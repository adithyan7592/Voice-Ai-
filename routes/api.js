// routes/api.js — REST API for the VoiceOS dashboard
"use strict";

const express      = require("express");
const router       = express.Router();
const multer       = require("multer");
const { v4: uuid } = require("uuid");
const db           = require("../db");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

// ── API key auth ──────────────────────────────────────────────
function auth(req, res, next) {
  const key = req.headers["x-api-key"] || req.query.apiKey;
  if (!process.env.API_SECRET || key !== process.env.API_SECRET) {
    return res.status(401).json({ error: "Unauthorized. Provide x-api-key header." });
  }
  next();
}
router.use(auth);

// ════════════════════════════════════════════════
//  AGENTS
// ════════════════════════════════════════════════

router.get("/agents", async (req, res) => {
  try {
    const result = await db.query(`
      SELECT a.*,
        COALESCE(
          json_agg(ad.document_id) FILTER (WHERE ad.document_id IS NOT NULL),
          '[]'
        ) AS docs
      FROM agents a
      LEFT JOIN agent_documents ad ON ad.agent_id = a.id
      GROUP BY a.id
      ORDER BY a.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/agents/:id", async (req, res) => {
  try {
    const r = await db.query(`SELECT * FROM agents WHERE id = $1`, [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: "Agent not found" });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/agents", async (req, res) => {
  const {
    name, role = "Sales Agent", persona = "Friendly Sales Lady",
    voice = "South Kerala", region = "South Kerala",
    greeting, system_prompt, number,
    status = "idle", temperature = 0.8, max_duration = 300,
    end_silence = 2, interruption = true, auto_intent = true,
    crm_capture = true, escalation = true, color = "amber", docs = [],
  } = req.body;

  if (!name || !greeting || !system_prompt)
    return res.status(400).json({ error: "name, greeting, system_prompt are required" });

  const id = "ag_" + uuid().slice(0, 8);
  try {
    await db.query(
      `INSERT INTO agents
        (id,name,role,persona,voice,region,greeting,system_prompt,number,status,
         temperature,max_duration,end_silence,interruption,auto_intent,crm_capture,
         escalation,color)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [id,name,role,persona,voice,region,greeting,system_prompt,number||null,status,
       temperature,max_duration,end_silence,interruption,auto_intent,crm_capture,
       escalation,color]
    );
    for (const docId of docs) {
      await db.query(
        `INSERT INTO agent_documents (agent_id, document_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [id, docId]
      );
    }
    const created = await db.query(`SELECT * FROM agents WHERE id = $1`, [id]);
    res.status(201).json(created.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch("/agents/:id", async (req, res) => {
  const ALLOWED = [
    "name","role","persona","voice","region","greeting","system_prompt",
    "number","status","temperature","max_duration","end_silence",
    "interruption","auto_intent","crm_capture","escalation","color",
  ];
  const updates = Object.entries(req.body).filter(([k]) => ALLOWED.includes(k));
  if (!updates.length) return res.status(400).json({ error: "No valid fields to update" });

  const set    = updates.map(([k], i) => `${k} = $${i + 2}`).join(", ");
  const values = updates.map(([, v]) => v);

  try {
    await db.query(
      `UPDATE agents SET ${set}, updated_at = NOW() WHERE id = $1`,
      [req.params.id, ...values]
    );
    if (Array.isArray(req.body.docs)) {
      await db.query(`DELETE FROM agent_documents WHERE agent_id = $1`, [req.params.id]);
      for (const docId of req.body.docs) {
        await db.query(
          `INSERT INTO agent_documents (agent_id, document_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [req.params.id, docId]
        );
      }
    }
    const r = await db.query(`SELECT * FROM agents WHERE id = $1`, [req.params.id]);
    res.json(r.rows[0] || {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete("/agents/:id", async (req, res) => {
  try {
    await db.query(`DELETE FROM agents WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════
//  DOCUMENTS
// ════════════════════════════════════════════════

router.get("/documents", async (req, res) => {
  try {
    const r = await db.query(`SELECT * FROM documents ORDER BY uploaded_at DESC`);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/documents/upload", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const id      = "doc_" + uuid().slice(0, 8);
  const ext     = req.file.originalname.split(".").pop().toLowerCase();
  const type    = ext === "pdf" ? "pdf" : "doc";
  const sizeMB  = (req.file.size / 1024 / 1024).toFixed(1);
  let   content = req.body.content || "";

  // Plain text / simple text-based files
  if (!content && ["txt", "md", "csv", "doc", "docx"].includes(ext)) {
    try { content = req.file.buffer.toString("utf8").slice(0, 15_000); } catch (_) {}
  }

  try {
    await db.query(
      `INSERT INTO documents (id, name, size, type, status, chunks, content)
       VALUES ($1,$2,$3,$4,'queued',0,$5)`,
      [id, req.file.originalname, `${sizeMB} MB`, type, content]
    );
    const doc = await db.query(`SELECT * FROM documents WHERE id = $1`, [id]);
    res.status(201).json(doc.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/documents/:id/train", async (req, res) => {
  const { id } = req.params;
  try {
    await db.query(`UPDATE documents SET status = 'training' WHERE id = $1`, [id]);
    res.json({ status: "training", id });

    // Async training simulation (swap out for real vector indexing in production)
    setTimeout(async () => {
      try {
        const r     = await db.query(`SELECT * FROM documents WHERE id = $1`, [id]);
        const doc   = r.rows[0];
        if (!doc) return;
        const words  = (doc.content || "").split(/\s+/).length;
        const chunks = Math.max(Math.ceil(words / 50), 5);
        await db.query(
          `UPDATE documents SET status = 'trained', chunks = $1 WHERE id = $2`,
          [chunks, id]
        );
        console.log(`✅ Document ${id} trained: ${chunks} chunks`);
      } catch (err) {
        await db.query(`UPDATE documents SET status = 'error' WHERE id = $1`, [id]);
        console.error("Training error:", err);
      }
    }, 3_000 + Math.random() * 4_000);

  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete("/documents/:id", async (req, res) => {
  try {
    await db.query(`DELETE FROM documents WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════
//  CALL LOGS
// ════════════════════════════════════════════════

router.get("/calls", async (req, res) => {
  const { limit = 50, offset = 0, status, agentId, from, to } = req.query;
  const filters = [], vals = [];

  if (status)  { vals.push(status);  filters.push(`c.status = $${vals.length}`); }
  if (agentId) { vals.push(agentId); filters.push(`c.agent_id = $${vals.length}`); }
  if (from)    { vals.push(from);    filters.push(`c.started_at >= $${vals.length}`); }
  if (to)      { vals.push(to);      filters.push(`c.started_at <= $${vals.length}`); }

  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const safeLimit  = Math.min(parseInt(limit)  || 50, 200);
  const safeOffset = Math.max(parseInt(offset) || 0,  0);
  vals.push(safeLimit, safeOffset);

  try {
    const r = await db.query(
      `SELECT c.*,
         COALESCE(
           json_agg(json_build_object('role', t.role, 'text', t.text) ORDER BY t.id)
             FILTER (WHERE t.id IS NOT NULL),
           '[]'
         ) AS transcript
       FROM calls c
       LEFT JOIN transcripts t ON t.call_id = c.id
       ${where}
       GROUP BY c.id
       ORDER BY c.started_at DESC
       LIMIT $${vals.length - 1} OFFSET $${vals.length}`,
      vals
    );
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/calls/:id", async (req, res) => {
  try {
    const [callRes, txRes] = await Promise.all([
      db.query(`SELECT * FROM calls WHERE id = $1`, [req.params.id]),
      db.query(`SELECT role, text, created_at FROM transcripts WHERE call_id = $1 ORDER BY id`, [req.params.id]),
    ]);
    if (!callRes.rows[0]) return res.status(404).json({ error: "Call not found" });
    res.json({ ...callRes.rows[0], transcript: txRes.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════
//  PHONE NUMBERS
// ════════════════════════════════════════════════

router.get("/numbers", async (req, res) => {
  try {
    const r = await db.query(`
      SELECT pn.*, a.name AS agent_name_only
      FROM phone_numbers pn
      LEFT JOIN agents a ON a.id = pn.agent_id
      ORDER BY pn.created_at DESC
    `);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/numbers", async (req, res) => {
  const { number, agentId, region, type = "DID" } = req.body;
  if (!number) return res.status(400).json({ error: "number is required" });
  const id = "num_" + uuid().slice(0, 8);
  try {
    await db.query(
      `INSERT INTO phone_numbers (id, number, agent_id, region, type, status)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, number, agentId || null, region || "—", type, agentId ? "active" : "available"]
    );
    const r = await db.query(`SELECT * FROM phone_numbers WHERE id = $1`, [id]);
    res.status(201).json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch("/numbers/:id", async (req, res) => {
  const { agentId } = req.body;
  try {
    await db.query(
      `UPDATE phone_numbers SET agent_id=$1, status=$2 WHERE id=$3`,
      [agentId || null, agentId ? "active" : "available", req.params.id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete("/numbers/:id", async (req, res) => {
  try {
    await db.query(`DELETE FROM phone_numbers WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════
//  ANALYTICS
// ════════════════════════════════════════════════

router.get("/analytics/summary", async (req, res) => {
  try {
    const [total, today, avgDur, sentiments, intents, agents] = await Promise.all([
      db.query(`SELECT COUNT(*) FROM calls`),
      db.query(`SELECT COUNT(*) FROM calls WHERE started_at >= NOW() - INTERVAL '24 hours'`),
      db.query(`
        SELECT AVG(EXTRACT(EPOCH FROM (ended_at - started_at))) AS avg_s
        FROM calls WHERE ended_at IS NOT NULL
      `),
      db.query(`SELECT sentiment, COUNT(*) FROM calls GROUP BY sentiment`),
      db.query(`
        SELECT intent, COUNT(*) FROM calls
        WHERE intent NOT IN ('Unknown','General inquiry')
        GROUP BY intent ORDER BY COUNT(*) DESC LIMIT 6
      `),
      db.query(`SELECT id, name, calls_total, success_rate, region FROM agents ORDER BY calls_total DESC`),
    ]);

    const avgS = Math.round(avgDur.rows[0]?.avg_s || 0);
    res.json({
      totalCalls:  parseInt(total.rows[0].count),
      callsToday:  parseInt(today.rows[0].count),
      avgDuration: `${Math.floor(avgS / 60)}m ${avgS % 60}s`,
      sentiments:  Object.fromEntries(sentiments.rows.map(r => [r.sentiment, parseInt(r.count)])),
      topIntents:  intents.rows.map(r => ({ intent: r.intent, count: parseInt(r.count) })),
      agents:      agents.rows,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/analytics/monthly", async (req, res) => {
  try {
    const r = await db.query(`
      SELECT DATE_TRUNC('month', started_at) AS month, COUNT(*) AS calls
      FROM calls
      WHERE started_at >= NOW() - INTERVAL '12 months'
      GROUP BY month ORDER BY month
    `);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
