// services/tts.js — Google Cloud Text-to-Speech (Malayalam ml-IN)
// NOW LIVE: synthesizes audio → serves via /twilio/audio/:callId endpoint
"use strict";

const textToSpeech = require("@google-cloud/text-to-speech");

// ── Lazy client init (Railway-friendly, no file needed) ───────
let ttsClient;
function getClient() {
  if (ttsClient) return ttsClient;
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    const creds = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
    if (!creds.private_key || !creds.client_email) {
      console.warn("⚠️  Google TTS credentials appear incomplete — check GOOGLE_APPLICATION_CREDENTIALS_JSON");
    }
    ttsClient = new textToSpeech.TextToSpeechClient({ credentials: creds });
  } else {
    // Falls back to GOOGLE_APPLICATION_CREDENTIALS file path (local dev)
    ttsClient = new textToSpeech.TextToSpeechClient();
  }
  return ttsClient;
}

// ── In-memory audio cache (keyed by callId + turn index) ─────
// Twilio fetches the audio URL once — we serve it from memory.
// Auto-expires after 5 minutes so RAM doesn't grow unbounded.
const audioCache = new Map(); // key → { buffer, expiresAt }

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function cacheAudio(key, buffer) {
  audioCache.set(key, { buffer, expiresAt: Date.now() + CACHE_TTL_MS });
}

function getCachedAudio(key) {
  const entry = audioCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { audioCache.delete(key); return null; }
  return entry.buffer;
}

// Cleanup stale entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of audioCache) {
    if (now > v.expiresAt) audioCache.delete(k);
  }
}, 10 * 60 * 1000);

// ── Voice profile (Google only has one Malayalam Wavenet voice) ─
const MALAYALAM_VOICE = {
  name:         "ml-IN-Wavenet-A",
  languageCode: "ml-IN",
  ssmlGender:   "FEMALE",
};

// ── Core synthesizer ──────────────────────────────────────────
/**
 * Convert Malayalam text → MP3 Buffer via Google TTS
 * @param {string} text — Malayalam text to speak
 * @returns {Buffer}    — MP3 audio buffer
 */
async function synthesize(text) {
  const [response] = await getClient().synthesizeSpeech({
    input: { text },
    voice: MALAYALAM_VOICE,
    audioConfig: {
      audioEncoding:  "MP3",
      speakingRate:   0.95,   // Slightly slower — natural for IVR
      pitch:          1.5,    // Slightly higher — warm, feminine
      volumeGainDb:   2.0,    // Louder for phone call clarity
      effectsProfileId: ["telephony-class-application"], // optimised for phone
    },
  });
  return Buffer.from(response.audioContent, "binary");
}

/**
 * Synthesize + cache audio, returns a URL Twilio can <Play>
 * @param {string} text    — Malayalam text
 * @param {string} cacheKey — unique key e.g. "callId_turn3"
 * @returns {string}       — Full URL: BASE_URL/twilio/audio/:cacheKey
 */
async function synthesizeForTwilio(text, cacheKey) {
  const mp3Buffer = await synthesize(text);
  cacheAudio(cacheKey, mp3Buffer);
  return `${process.env.BASE_URL}/twilio/audio/${encodeURIComponent(cacheKey)}`;
}

/**
 * Serve a cached audio buffer by key (called by /twilio/audio/:key route)
 * @param {string} key
 * @returns {Buffer|null}
 */
function getAudioBuffer(key) {
  return getCachedAudio(key);
}

module.exports = { synthesize, synthesizeForTwilio, getAudioBuffer, MALAYALAM_VOICE };
