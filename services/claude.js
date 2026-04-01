// services/claude.js — Anthropic Claude AI integration
"use strict";

const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Kerala STD prefix → region ────────────────────────────────
const KERALA_STD = {
  "0471":"South Kerala","0474":"South Kerala","0476":"South Kerala","0477":"South Kerala",
  "0478":"South Kerala","0479":"South Kerala",
  "0481":"Central Kerala","0484":"Central Kerala","0485":"Central Kerala", 
  "0486":"Central Kerala","0487":"Central Kerala","0488":"Central Kerala",
  "0491":"North Kerala","0492":"North Kerala","0493":"North Kerala","0494":"North Kerala",
  "0495":"North Kerala","0496":"North Kerala","0497":"North Kerala","0498":"North Kerala",
  "0499":"North Kerala",
};

function detectRegionFromCaller(callerNumber) {
  const cleaned = (callerNumber || "").replace(/^\+91/, "0").replace(/\s/g, "");
  return KERALA_STD[cleaned.slice(0, 4)] || "South Kerala";
}

// ── Detect intent ─────────────────────────────────────────────
async function detectIntent(transcript) {
  try {
    const r = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 60,
      messages: [{
        role: "user",
        content:
          `Classify the main intent of this call in 3-5 words (English). Reply ONLY with the label.\n` +
          `Examples: "Paint product inquiry", "Pricing query", "Dealer location", "Complaint", "Site visit request"\n\n` +
          `Transcript:\n"${transcript}"`,
      }],
    });
    return r.content[0]?.text?.trim() || "General inquiry";
  } catch { return "General inquiry"; }
}

// ── Detect sentiment ──────────────────────────────────────────
async function detectSentiment(transcript) {
  try {
    const r = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 10,
      messages: [{
        role: "user",
        content: `Caller's sentiment? Reply with exactly one word: positive, neutral, or negative.\n\n"${transcript}"`,
      }],
    });
    const s = r.content[0]?.text?.trim().toLowerCase();
    return ["positive","neutral","negative"].includes(s) ? s : "neutral";
  } catch { return "neutral"; }
}

// ── Main reply generator ──────────────────────────────────────
async function generateReply({ systemPrompt, history, userMessage, knowledgeContext }) {
  const system = [
    systemPrompt,
    "",
    "CALL RULES:",
    "- Speak primarily in Malayalam. Mix natural English words as Keralites do.",
    "- Keep replies SHORT (2-4 sentences max). This is a phone call.",
    "- Sound warm, natural — like a real Kerala lady.",
    "- Never use formatting, asterisks, or lists. Plain sentences only.",
    "- Always end with one follow-up question or clear next step.",
    "- If caller says 'human', 'manager', 'transfer', or similar — say you will transfer them.",
    "",
    knowledgeContext ? `KNOWLEDGE BASE:\n${knowledgeContext}` : "",
  ].filter(Boolean).join("\n");

  // Convert stored history to Anthropic message format
  // Merge consecutive same-role messages (Anthropic requires alternating roles)
  const rawMessages = [
    ...history.map(h => ({ role: h.role === "assistant" ? "assistant" : "user", content: h.text })),
    { role: "user", content: userMessage },
  ];

  const messages = [];
  for (const msg of rawMessages) {
    if (messages.length && messages[messages.length - 1].role === msg.role) {
      messages[messages.length - 1].content += "\n" + msg.content;
    } else {
      messages.push({ ...msg });
    }
  }
  // Anthropic requires first message to be user role
  if (messages[0]?.role === "assistant") messages.shift();

  // const r = await client.messages.create({
  //   model:      "claude-sonnet-4-5",
  //   max_tokens: 200,
  //   system,
  //   messages,
  // });
  // changed max_token 150 to 350 and model to claude-haiku-4-5-20251001 for more concise and relevant responses, especially for IVR context. Adjust as needed based on response quality and latency.
  const r = await Promise.race([
    client.messages.create({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 350,
      system,
      messages,
    }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Claude timeout")), 10000)
    ),
  ]);

  return r.content[0]?.text?.trim() ||
    "ക്ഷമിക്കണം, ഒരു technical issue ഉണ്ട്. ദയവായി ഒന്ന് കൂടി പറഞ്ഞൂ?";
}

// ── Summarise call ────────────────────────────────────────────
async function summarizeCall(transcriptLines) {
  try {
    const text = transcriptLines.map(t => `${t.role}: ${t.text}`).join("\n");
    const r = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 150,
      messages: [{
        role: "user",
        content: `Summarize this IVR call in 2-3 English sentences. Include: main topic, outcome, any action needed.\n\n${text}`,
      }],
    });
    return r.content[0]?.text?.trim() || "";
  } catch { return ""; }
}

module.exports = { generateReply, detectIntent, detectSentiment, summarizeCall, detectRegionFromCaller };
