// services/stt.js — Google Cloud Speech-to-Text (Malayalam ml-IN)
// NOW LIVE: used for post-call recording transcription accuracy check
"use strict";

const speech = require("@google-cloud/speech");
const https  = require("https");

// ── Lazy client init ──────────────────────────────────────────
let sttClient;
function getClient() {
  if (sttClient) return sttClient;
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    const creds = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
    if (!creds.private_key || !creds.client_email) {
      console.warn("⚠️  Google STT credentials appear incomplete — check GOOGLE_APPLICATION_CREDENTIALS_JSON");
    }
    sttClient = new speech.SpeechClient({ credentials: creds });
  } else {
    sttClient = new speech.SpeechClient();
  }
  return sttClient;
}

// ── Recognition config ────────────────────────────────────────
const RECOGNITION_CONFIG = {
  encoding:          "LINEAR16",
  sampleRateHertz:   8000,          // Twilio phone audio is 8kHz
  languageCode:      "ml-IN",       // Malayalam — India
  alternativeLanguageCodes: ["en-IN"], // Accept English for mixed speech
  model:             "phone_call",  // Optimised for telephony
  useEnhanced:       true,
  profanityFilter:   false,
  enableAutomaticPunctuation: true,
  speechContexts: [{
    phrases: [
      "BHADRAM", "Kerala Paints", "interior paint", "exterior paint",
      "ലക്ഷ്മി", "പ്രിയ", "മീര", "paint", "colour", "litre",
      "bedroom", "hall", "kitchen", "contractor", "quote",
      "dealer", "outlet", "Thiruvananthapuram", "Kochi", "Thrissur",
      "Kozhikode", "Kannur", "ചായം", "വീട്", "മുറി",
    ],
    boost: 15,
  }],
};

// ── Download audio from Twilio (requires Basic Auth) ─────────
/**
 * Twilio recording URLs require HTTP Basic Auth.
 * This downloads the .wav audio as a Buffer.
 * @param {string} recordingUrl — e.g. https://api.twilio.com/2010.../Recordings/RExx.wav
 * @returns {Promise<Buffer>}
 */
function downloadTwilioRecording(recordingUrl) {
  return new Promise((resolve, reject) => {
    // Append .wav format to get proper audio
    const url = recordingUrl.replace(/\.(mp3|json)$/, "") + ".wav";

    const auth = Buffer.from(
      `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
    ).toString("base64");

    https.get(url, { headers: { Authorization: `Basic ${auth}` } }, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`Twilio download failed: HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on("data", chunk => chunks.push(chunk));
      res.on("end",  ()    => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
}

// ── Transcribe audio buffer ───────────────────────────────────
/**
 * Transcribe a raw audio Buffer using Google STT
 * @param {Buffer} audioBuffer — Raw LINEAR16 / WAV bytes
 * @returns {Promise<string>}  — Transcribed text
 */
async function transcribeBuffer(audioBuffer) {
  const [response] = await getClient().recognize({
    config: RECOGNITION_CONFIG,
    audio:  { content: audioBuffer.toString("base64") },
  });

  return response.results
    ?.map(r => r.alternatives?.[0]?.transcript)
    .filter(Boolean)
    .join(" ") || "";
}

/**
 * Full pipeline: download Twilio recording → transcribe with Google STT
 * Called from /twilio/status after a completed call for quality verification.
 * @param {string} recordingUrl — Twilio RecordingUrl from status webhook
 * @returns {Promise<string>}   — Full transcription text
 */
async function transcribeRecording(recordingUrl) {
  if (!recordingUrl) return "";
  try {
    console.log(`🎙  Downloading recording for STT: ${recordingUrl}`);
    const audioBuffer = await downloadTwilioRecording(recordingUrl);
    console.log(`🎙  Transcribing ${(audioBuffer.length / 1024).toFixed(0)}KB of audio`);
    const text = await transcribeBuffer(audioBuffer);
    console.log(`🎙  Google STT result: "${text.slice(0, 100)}..."`);
    return text;
  } catch (err) {
    console.error("Google STT error:", err.message);
    return ""; // Non-fatal — fall back to Twilio's SpeechResult transcripts
  }
}

// ── Twilio <Gather> config (used during live call) ────────────
// Twilio handles live STT natively during the call.
// Google STT is used POST-CALL for higher accuracy verification.
const TWILIO_SPEECH_CONFIG = {
  language:    "ml-IN",
  enhanced:    true,
  speechModel: "phone_call",
  speechTimeout: "auto",
  hints: "BHADRAM,Kerala Paints,paint,colour,litre,bedroom,dealer,quote,ചായം,വീട്,മുറി,price,cost",
};

module.exports = { transcribeBuffer, transcribeRecording, TWILIO_SPEECH_CONFIG };
