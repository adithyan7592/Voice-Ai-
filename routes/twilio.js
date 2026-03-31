// routes/twilio.js — Twilio IVR webhook handlers
// Google TTS: synthesizes agent speech → served via /twilio/audio/:key → <Play>
// Google STT: post-call recording transcription in /twilio/status
"use strict";

const express      = require("express");
const router       = express.Router();
const twilio       = require("twilio");
const { v4: uuid } = require("uuid");
const db           = require("../db");
const {
  generateReply, detectIntent, detectSentiment,
  summarizeCall, detectRegionFromCaller,
} = require("../services/claude");
const { TWILIO_SPEECH_CONFIG, transcribeRecording } = require("../services/stt");
const { synthesizeForTwilio, getAudioBuffer }       = require("../services/tts");

const VoiceResponse = twilio.twiml.VoiceResponse;

// ── Twilio signature validation (production only) ─────────────
function validateTwilio(req, res, next) {
  if (process.env.NODE_ENV !== "production") return next();
  const valid = twilio.validateRequest(
    process.env.TWILIO_AUTH_TOKEN,
    req.headers["x-twilio-signature"] || "",
    `${process.env.BASE_URL}${req.originalUrl}`,
    req.body
  );
  if (!valid) return res.status(403).send("Forbidden");
  next();
}

// ═══════════════════════════════════════════════════════════════
//  GET /twilio/audio/:key
//  Serves cached Google TTS MP3 to Twilio <Play> verb
// ═══════════════════════════════════════════════════════════════
router.get("/audio/:key", (req, res) => {
  const buffer = getAudioBuffer(req.params.key);
  if (!buffer) {
    // Audio expired or never generated — Twilio will hear silence then continue
    console.warn(`⚠️  Audio cache miss for key: ${req.params.key}`);
    return res.status(404).send("Audio not found");
  }
  res.set({
    "Content-Type":   "audio/mpeg",
    "Content-Length": buffer.length,
    "Cache-Control":  "no-store",  // Don't let Twilio cache stale audio
  });
  res.send(buffer);
});

// ── DB helpers ────────────────────────────────────────────────
async function getAgentByNumber(toNumber) {
  const normalized = toNumber.replace(/\s/g, "");
  const r = await db.query(
    `SELECT pn.*, a.id AS agent_id, a.name, a.greeting, a.system_prompt,
            a.escalation, a.temperature, a.region
     FROM phone_numbers pn
     LEFT JOIN agents a ON a.id = pn.agent_id
     WHERE REPLACE(pn.number, ' ', '') = $1 AND pn.status = 'active'`,
    [normalized]
  );
  return r.rows[0] || null;
}

async function getAgentByRegion(region) {
  const r = await db.query(
    `SELECT * FROM agents WHERE region = $1 AND status = 'active' LIMIT 1`,
    [region]
  );
  return r.rows[0] || null;
}

async function getAgentById(id) {
  const r = await db.query(`SELECT * FROM agents WHERE id = $1`, [id]);
  return r.rows[0] || null;
}

async function getKnowledgeContext(agentId) {
  const r = await db.query(
    `SELECT d.content FROM documents d
     JOIN agent_documents ad ON ad.document_id = d.id
     WHERE ad.agent_id = $1 AND d.status = 'trained' AND d.content != ''`,
    [agentId]
  );
  // Cap at 8000 chars (~2000 tokens) to avoid context overload
  return r.rows.map(row => row.content).join("\n\n").slice(0, 8000);
}

async function getSession(callId) {
  const r = await db.query(`SELECT * FROM call_sessions WHERE call_id = $1`, [callId]);
  return r.rows[0] || null;
}

// async function saveSession(callId, agentId, history) {
//   await db.query(
//     `INSERT INTO call_sessions (call_id, agent_id, history, updated_at)
//      VALUES ($1, $2, $3, NOW())
//      ON CONFLICT (call_id) DO UPDATE SET history = $3, updated_at = NOW()`,
//     [callId, agentId, JSON.stringify(history)]
//   );
// }

async function saveSession(callId, agentId, history) {
  await db.query(
    `INSERT INTO call_sessions (call_id, agent_id, history, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (call_id) DO UPDATE SET history = $3, updated_at = NOW()`,
    [callId, agentId, JSON.stringify(history)]
  );
}

async function finalizeCall(callId, status) {
  await db.query(
    `UPDATE calls SET status = $1, ended_at = NOW()
     WHERE id = $2 AND ended_at IS NULL`,
    [status, callId]
  );
}

function formatDuration(seconds) {
  const s = parseInt(seconds) || 0;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// ── Google TTS helper ─────────────────────────────────────────
/**
 * Synthesize text via Google TTS and return a cache key.
 * Falls back to Twilio <Say> if Google TTS fails.
 * @param {string} text    — Malayalam text
 * @param {string} callId  — for unique cache key
 * @param {string} suffix  — e.g. "greeting", "turn3", "bye"
 * @returns {{ usePlay: true, audioUrl: string }
 *          |{ usePlay: false }}
 */
async function buildTTSAudio(text, callId, suffix) {
  try {
    const cacheKey = `${callId}_${suffix}`;
    const audioUrl = await synthesizeForTwilio(text, cacheKey);
    return { usePlay: true, audioUrl };
  } catch (err) {
    console.error(`Google TTS failed (${suffix}):`, err.message);
    return { usePlay: false };
  }
}

// Fallback: if Google TTS fails, we'll use Twilio <Say> with Malayalam voice.
// ── TwiML builder — uses <Play> (Google TTS) or <Say> (fallback)
function addSpeech(node, text, audioUrl) {
  if (audioUrl) {
    node.play(audioUrl);
  } else {
    node.say({ language: "ml-IN", voice: "Google.ml-IN-Wavenet-A" }, text);
  }
}

// claude code for transcribing the call and analyzing the intent and sentiment.
// ── GATHER builder ────────────────────────────────────────────
// function buildGather(twiml, { callId, agentId, text, audioUrl }) {
//   const gather = twiml.gather({
//     input:         "speech",
//     action:        `${process.env.BASE_URL}/twilio/respond?callId=${callId}&agentId=${agentId}`,
//     method:        "POST",
//     language:      TWILIO_SPEECH_CONFIG.language,
//     enhanced:      TWILIO_SPEECH_CONFIG.enhanced,
//     speechModel:   TWILIO_SPEECH_CONFIG.speechModel,
//     speechTimeout: TWILIO_SPEECH_CONFIG.speechTimeout,
//     hints:         TWILIO_SPEECH_CONFIG.hints,
//     timeout:       6,
//   });

// My custom code
function buildGather(twiml, { callId, agentId, text, audioUrl }) {
  const gather = twiml.gather({
    input:         "speech",
    action:        `${process.env.BASE_URL}/twilio/respond?callId=${callId}&agentId=${agentId}`,
    method:        "POST",
    language:      "ml-IN",
    speechTimeout: "auto",
    timeout:       10,
  });


  addSpeech(gather, text, audioUrl);
  // Redirect fires only if Gather gets no input
  twiml.redirect(
    { method: "POST" },
    `${process.env.BASE_URL}/twilio/no-input?callId=${callId}&agentId=${agentId}`
  );
}

// ═══════════════════════════════════════════════════════════════
//  POST /twilio/incoming
// ═══════════════════════════════════════════════════════════════
router.post("/incoming", validateTwilio, async (req, res) => {
  const { CallSid, To, From } = req.body;
  console.log(`📞 Incoming: ${From} → ${To} [${CallSid}]`);

  try {
    // 1. Find agent by number, then fallback to region
    let agent = await getAgentByNumber(To);
    if (!agent) {
      const region = detectRegionFromCaller(From);
      agent = await getAgentByRegion(region);
    }

    if (!agent) {
      const fallbackText = "നമസ്കാരം! Kerala Paints-ൽ സ്വാഗതം. ദയവായി ഞങ്ങളുടെ ഓഫീസ് സമയത്ത് വിളിക്കൂ.";
      const twiml = new VoiceResponse();
      const tts   = await buildTTSAudio(fallbackText, CallSid, "no_agent");
      addSpeech(twiml, fallbackText, tts.usePlay ? tts.audioUrl : null);
      twiml.hangup();
      return res.type("text/xml").send(twiml.toString());
    }

    // 2. Create call record
    const callId  = uuid();
    const region  = detectRegionFromCaller(From);
    const agentId = agent.agent_id || agent.id;

    await db.query(
      `INSERT INTO calls (id, twilio_sid, caller, agent_id, agent_name, status, region)
       VALUES ($1, $2, $3, $4, $5, 'in-progress', $6)`,
      [callId, CallSid, From, agentId, agent.name, region]
    );

    // 3. Init session + transcript
    const history = [{ role: "assistant", text: agent.greeting }];
    await Promise.all([
      saveSession(callId, agentId, history),
      db.query(
        `INSERT INTO transcripts (call_id, role, text) VALUES ($1, 'agent', $2)`,
        [callId, agent.greeting]
      ),
      db.query(
        `UPDATE phone_numbers SET calls_total = calls_total + 1 WHERE agent_id = $1`,
        [agentId]
      ),
    ]);

    // 4. Synthesize greeting via Google TTS
    const tts = await buildTTSAudio(agent.greeting, callId, "greeting");

    // 5. Respond with greeting + listen
    const twiml = new VoiceResponse();
    buildGather(twiml, {
      callId,
      agentId,
      text:     agent.greeting,
      audioUrl: tts.usePlay ? tts.audioUrl : null,
    });
    res.type("text/xml").send(twiml.toString());

  } catch (err) {
    console.error("Incoming error:", err);
    const twiml = new VoiceResponse();
    twiml.say({ language: "ml-IN" },
      "ക്ഷമിക്കണം, ഒരു technical issue ഉണ്ട്. ദയവായി ഒരു നിമിഷം കഴിഞ്ഞ് വിളിക്കൂ.");
    twiml.hangup();
    res.type("text/xml").send(twiml.toString());
  }
});

// ═══════════════════════════════════════════════════════════════
//  POST /twilio/respond
// ═══════════════════════════════════════════════════════════════
const ESCALATION_WORDS = [
  "human", "manager", "real person", "transfer", "supervisor",
  "മനുഷ്യൻ", "officer", "manushyan",
];
const FAREWELL_WORDS = [
  "goodbye", "bye", "thank you", "നന്ദി", "ശരി", "bye bye", "ok thanks",
];
const MAX_TURNS = 10;

router.post("/respond", validateTwilio, async (req, res) => {
  const { callId, agentId }          = req.query;
  const { SpeechResult, CallStatus } = req.body;

  // if (CallStatus === "completed" || !SpeechResult?.trim()) {
  //   return res.type("text/xml").send(new VoiceResponse().toString());
  // }

  
  if (CallStatus === "completed") {
    return res.type("text/xml").send(new VoiceResponse().toString());
  }

  // No speech detected — ask to repeat instead of hanging up
  // for twilio to speak back because its is us number i changed En-in to En-us
  if (!SpeechResult?.trim()) {
    const twiml = new VoiceResponse();
    const gather = twiml.gather({
      input: "speech",
      action: `${process.env.BASE_URL}/twilio/respond?callId=${callId}&agentId=${agentId}`,
      method: "POST",
      language: "en-US",
      speechTimeout: "auto",
      timeout: 10,
    });
    gather.say({ language: "ml-IN", voice: "Google.ml-IN-Wavenet-A" },
      "ക്ഷമിക്കണം, ശരിക്കും കേട്ടില്ല. ദയവായി ഒന്നുകൂടി പറഞ്ഞൂ?"
    );
    return res.type("text/xml").send(twiml.toString());
  }

  console.log(`💬 [${callId}]: "${SpeechResult}"`);                                                   
  try {
    const [session, agent] = await Promise.all([
      getSession(callId),
      getAgentById(agentId),
    ]);
    if (!session || !agent) {
      return res.type("text/xml").send(new VoiceResponse().toString());
    }

    // const history = JSON.parse(session.history || "[]");
    const history = typeof session.history === "string"
  ? JSON.parse(session.history || "[]")
  : (session.history || []);
    const turn    = history.filter(h => h.role === "user").length + 1;

    // ── Escalation check ──────────────────────────────────────
    const wantsHuman = ESCALATION_WORDS.some(w =>
      SpeechResult.toLowerCase().includes(w)
    );
    if (wantsHuman && agent.escalation) {
      const byeText = "ശരി, ഞാൻ ഇപ്പോൾ ഒരു human agent-ലേക്ക് transfer ചെയ്യുന്നു. ദയവായി hold ചെയ്യൂ.";
      const tts     = await buildTTSAudio(byeText, callId, "escalate");
      await Promise.all([
        db.query(`INSERT INTO transcripts (call_id, role, text) VALUES ($1,'caller',$2)`, [callId, SpeechResult]),
        db.query(`INSERT INTO transcripts (call_id, role, text) VALUES ($1,'agent',$2)`,  [callId, byeText]),
        finalizeCall(callId, "transferred"),
      ]);
      const twiml = new VoiceResponse();
      addSpeech(twiml, byeText, tts.usePlay ? tts.audioUrl : null);
      if (process.env.HUMAN_AGENT_NUMBER) twiml.dial(process.env.HUMAN_AGENT_NUMBER);
      else twiml.hangup();
      return res.type("text/xml").send(twiml.toString());
    }

    // ── Save caller turn ──────────────────────────────────────
    await db.query(
      `INSERT INTO transcripts (call_id, role, text) VALUES ($1,'caller',$2)`,
      [callId, SpeechResult]
    );

    // ── Generate AI reply + synthesize TTS in parallel ────────
    const knowledge = await getKnowledgeContext(agentId);
    const agentReply = await generateReply({
      systemPrompt:     agent.system_prompt,
      history,
      userMessage:      SpeechResult,
      knowledgeContext: knowledge,
    });

    // Synthesize Google TTS audio for reply
    const tts = await buildTTSAudio(agentReply, callId, `turn${turn}`);

    // ── Update session + transcript ───────────────────────────
    const newHistory = [
      ...history,
      { role: "user",      text: SpeechResult },
      { role: "assistant", text: agentReply   },
    ];
    await Promise.all([
      db.query(`INSERT INTO transcripts (call_id, role, text) VALUES ($1,'agent',$2)`, [callId, agentReply]),
      saveSession(callId, agentId, newHistory),
    ]);

    // ── Check if we should end the call ──────────────────────
    const callerBye = FAREWELL_WORDS.some(w => SpeechResult.toLowerCase().includes(w));
    const agentBye  = FAREWELL_WORDS.some(w => agentReply.toLowerCase().includes(w));
    const userTurns = newHistory.filter(h => h.role === "user").length;
    const shouldEnd = userTurns >= MAX_TURNS || (callerBye && agentBye);

    const twiml = new VoiceResponse();

    if (shouldEnd) {
      await finalizeCall(callId, "completed");
      addSpeech(twiml, agentReply, tts.usePlay ? tts.audioUrl : null);
      twiml.hangup();
    } else {
      buildGather(twiml, {
        callId,
        agentId,
        text:     agentReply,
        audioUrl: tts.usePlay ? tts.audioUrl : null,
      });
    }

    res.type("text/xml").send(twiml.toString());

  } catch (err) {
    console.error("Respond error:", err);
    const twiml = new VoiceResponse();
    twiml.say({ language: "ml-IN" }, "ക്ഷമിക്കണം, ദയവായി ഒന്ന് കൂടി പറഞ്ഞൂ?");
    twiml.redirect(
      { method: "POST" },
      `${process.env.BASE_URL}/twilio/respond?callId=${callId}&agentId=${agentId}`
    );
    res.type("text/xml").send(twiml.toString());
  }
});

// ═══════════════════════════════════════════════════════════════
//  POST /twilio/no-input
// ═══════════════════════════════════════════════════════════════
router.post("/no-input", async (req, res) => {
  const { callId, agentId } = req.query;
  const nudge = "ഹലോ? ഇപ്പോഴും ഉണ്ടോ? ഞാൻ Kerala Paints-ൽ നിന്ന്. BHADRAM paint-നെ പറ്റി സഹായിക്കാൻ ഇവിടെ ഉണ്ട്!";
  const endText = "ഞങ്ങൾ ഈ call close ചെയ്യുന്നു. Kerala Paints-ൽ വിളിച്ചതിന് നന്ദി!";

  // Synthesize nudge audio
  // i am changing this also ml-in to eng-us
  const tts = callId
    ? await buildTTSAudio(nudge, callId, "no_input").catch(() => ({ usePlay: false }))
    : { usePlay: false };

  const twiml   = new VoiceResponse();
  const gather  = twiml.gather({
    input:         "speech",
    action:        `${process.env.BASE_URL}/twilio/respond?callId=${callId}&agentId=${agentId}`,
    method:        "POST",
    language:      "en-US",
    speechTimeout: "auto",
    timeout:       8,
  });
  addSpeech(gather, nudge, tts.usePlay ? tts.audioUrl : null);

  // If still no input after nudge — say goodbye and hang up
  // NOTE: finalizeCall called ONLY here (after hang up path), not before the nudge
  twiml.say({ language: "ml-IN" }, endText);
  twiml.hangup();

  // Finalize after sending response — call is ending
  if (callId) {
    finalizeCall(callId, "dropped").catch(() => {});
  }

  res.type("text/xml").send(twiml.toString());
});

// ═══════════════════════════════════════════════════════════════
//  POST /twilio/status  — post-call webhook
//  Google STT runs here for full recording transcription
// ═══════════════════════════════════════════════════════════════
router.post("/status", async (req, res) => {
  const { CallSid, CallStatus, CallDuration, RecordingUrl } = req.body;
  console.log(`📊 Status [${CallSid}]: ${CallStatus}`);

  res.sendStatus(200); // Respond to Twilio immediately — never block here

  if (!["completed", "busy", "no-answer", "failed"].includes(CallStatus)) return;

  try {
    const callRes = await db.query(`SELECT * FROM calls WHERE twilio_sid = $1`, [CallSid]);
    const call    = callRes.rows[0];
    if (!call) return;

    const duration = formatDuration(CallDuration);
    const status   = CallStatus === "completed" ? "completed" : "dropped";

    await db.query(
      `UPDATE calls SET status=$1, duration=$2, ended_at=NOW(), recording_url=$3 WHERE id=$4`,
      [status, duration, RecordingUrl || null, call.id]
    );

    if (CallStatus === "completed") {
      await db.query(
        `UPDATE agents SET calls_total = calls_total + 1 WHERE id = $1`,
        [call.agent_id]
      );
    }

    // ── Post-call AI analysis + Google STT (all non-blocking) ─
    const txRes = await db.query(
      `SELECT role, text FROM transcripts WHERE call_id = $1 ORDER BY id`,
      [call.id]
    );

    if (txRes.rows.length > 1) {
      const fullText = txRes.rows.map(r => `${r.role}: ${r.text}`).join(" ");

      // Run Claude analysis + Google STT transcription in parallel
      const [intentResult, sentimentResult, summaryResult, sttResult] =
        await Promise.allSettled([
          detectIntent(fullText),
          detectSentiment(fullText),
          summarizeCall(txRes.rows),
          // Google STT: download + re-transcribe the full recording for accuracy
          // This gives a higher-quality transcript than Twilio's per-turn SpeechResult
          RecordingUrl ? transcribeRecording(RecordingUrl) : Promise.resolve(""),
        ]);

      const intent    = intentResult.value    || "General inquiry";
      const sentiment = sentimentResult.value || "neutral";
      const summary   = summaryResult.value   || "";
      const sttText   = sttResult.value        || "";

      // If Google STT produced a full transcription, store it as a single
      // high-quality transcript entry alongside the per-turn transcripts
      if (sttText && sttText.length > 20) {
        await db.query(
          `INSERT INTO transcripts (call_id, role, text)
           VALUES ($1, 'stt_full', $2)
           ON CONFLICT DO NOTHING`,
          [call.id, sttText]
        ).catch(() => {}); // non-fatal if transcript exists
        console.log(`🎙  Google STT stored for call ${call.id}`);
      }

      await db.query(
        `UPDATE calls SET intent=$1, sentiment=$2, summary=$3 WHERE id=$4`,
        [intent, sentiment, summary, call.id]
      );
    }

    // Clean up live session
    await db.query(`DELETE FROM call_sessions WHERE call_id = $1`, [call.id]);

  } catch (err) {
    console.error("Status webhook error:", err);
  }
});

module.exports = router;
