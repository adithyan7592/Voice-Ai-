import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import VoiceOSDashboard from "./dashboard.jsx";

// ── Inject API config from Vite environment variables ──────────
// Set these in client/.env.local for local dev,
// or in Railway Variables for production (prefixed with VITE_).
//
// client/.env.local:
//   VITE_API_BASE=http://localhost:3000/api
//   VITE_API_KEY=your-api-secret-here
//
// Railway Variables (production):
//   VITE_API_BASE=https://your-app.up.railway.app/api
//   VITE_API_KEY=your-api-secret-here
//
if (import.meta.env.VITE_API_BASE) {
  window.VOICEOS_API_BASE = import.meta.env.VITE_API_BASE;
}
if (import.meta.env.VITE_API_KEY) {
  window.VOICEOS_API_KEY = import.meta.env.VITE_API_KEY;
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <VoiceOSDashboard />
  </StrictMode>
);
