// server.js — VoiceOS Malayalam IVR Platform
"use strict";
require("dotenv").config();

const express   = require("express");
const cors      = require("cors");
const helmet    = require("helmet");
const rateLimit = require("express-rate-limit");
const winston   = require("winston");
const path      = require("path");
const fs        = require("fs");

// ── Logger ────────────────────────────────────────────────────
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message }) =>
      `[${timestamp}] ${level}: ${message}`)
  ),
  transports: [new winston.transports.Console()],
});

const app = express();
// added  this 
app.set("trust proxy", 1);

// ── Middleware ────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));

const allowedOrigins = process.env.NODE_ENV === "production"
  ? (process.env.DASHBOARD_URL || "*").split(",").map(s => s.trim())
  : "*";

app.use(cors({
  origin: allowedOrigins,
  methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type","x-api-key","Authorization"],
}));

// Twilio sends application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: "20mb" }));

// Rate limiting
app.use("/api",   rateLimit({ windowMs: 60_000, max: 60,  standardHeaders: true }));
app.use(          rateLimit({ windowMs: 60_000, max: 300, standardHeaders: true }));

// Request logger
app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// ── Serve React dashboard (built static files) ────────────────
const PUBLIC_DIR = path.join(__dirname, "public");
const hasPublic  = fs.existsSync(PUBLIC_DIR);

if (hasPublic) {
  // Serve JS/CSS/assets
  app.use(express.static(PUBLIC_DIR));
  logger.info("🖥  Serving dashboard from /public");
} else {
  logger.warn("⚠️  No /public folder found. Run: npm run build:ui");
}

// ── API Routes ────────────────────────────────────────────────
const twilioRoutes = require("./routes/twilio");
const apiRoutes    = require("./routes/api");

app.use("/twilio", twilioRoutes);
app.use("/api",    apiRoutes);

// ── Health ────────────────────────────────────────────────────
app.get("/health", (req, res) =>
  res.json({ status: "ok", uptime: Math.round(process.uptime()) + "s" })
);

// ── SPA fallback — MUST be after /api and /twilio routes ──────
// Any route that isn't /api or /twilio returns index.html
// so React Router can handle client-side navigation
if (hasPublic) {
  app.get("*", (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, "index.html"));
  });
} else {
  // No build yet — show a helpful JSON response at root
  app.get("/", (req, res) => {
    res.json({
      service:   "VoiceOS Malayalam IVR Platform",
      dashboard: "Run `npm run build:ui` to build the dashboard",
      status:    "running",
      version:   "1.0.0",
      endpoints: {
        health:        "GET  /health",
        twilioInbound: "POST /twilio/incoming",
        agents:        "GET  /api/agents",
        calls:         "GET  /api/calls",
        analytics:     "GET  /api/analytics/summary",
      },
    });
  });
}

// ── Error handler ─────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  logger.error(`Unhandled error: ${err.message}`);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === "production"
      ? "Internal server error"
      : err.message,
  });
});

app.use((req, res) =>
  res.status(404).json({ error: `Not found: ${req.method} ${req.path}` })
);

// ── Start ─────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || "3000", 10);
app.listen(PORT, () => {
  logger.info(`🎙  VoiceOS running on port ${PORT}`);
  logger.info(`📞  Twilio webhook: ${process.env.BASE_URL || `http://localhost:${PORT}`}/twilio/incoming`);
  logger.info(`🖥  Dashboard: ${process.env.BASE_URL || `http://localhost:${PORT}`}/`);
  logger.info(`🌍  Environment: ${process.env.NODE_ENV || "development"}`);

  const required = ["ANTHROPIC_API_KEY","TWILIO_ACCOUNT_SID","TWILIO_AUTH_TOKEN","DATABASE_URL","BASE_URL","API_SECRET"];
  const missing  = required.filter(k => !process.env[k]);
  if (missing.length) {
    logger.warn(`⚠️  Missing env vars: ${missing.join(", ")}`);
  } else {
    logger.info("✅  All required environment variables present");
  }
});

module.exports = app;
