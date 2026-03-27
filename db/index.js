// db/index.js — PostgreSQL connection pool
"use strict";

const { Pool } = require("pg");
const fs        = require("fs");
const path      = require("path");

const pool = new Pool({
  connectionString: String(process.env.DATABASE_URL),
  ssl: process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : false,
  max:                    20,
  idleTimeoutMillis:      30_000,
  connectionTimeoutMillis: 4_000,
});

pool.on("error", (err) => {
  console.error("Unexpected DB pool error:", err.message);
});

async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    if (process.env.NODE_ENV !== "production") {
      console.log("query", { sql: text.slice(0, 80), ms: Date.now() - start, rows: res.rowCount });
    }
    return res;
  } catch (err) {
    console.error("DB query error:", err.message, "\nSQL:", text.slice(0, 120));
    throw err;
  }
}

async function getClient() {
  return pool.connect();
}

module.exports = { query, getClient, pool };

// Migration runner: node db/index.js migrate
if (require.main === module) {
  (async () => {
    console.log("🔧  Running VoiceOS database migration…");
    const sqlPath = path.join(__dirname, "schema.sql");
    if (!fs.existsSync(sqlPath)) { console.error("❌  schema.sql not found"); process.exit(1); }

    const statements = fs.readFileSync(sqlPath, "utf8")
      .split(/;\s*\n/)
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith("--"));

    let ok = 0, fail = 0;
    for (const stmt of statements) {
      try { await pool.query(stmt); process.stdout.write("."); ok++; }
      catch (err) { console.error(`\n⚠️  ${err.message}\n   ${stmt.slice(0,100)}`); fail++; }
    }
    console.log(`\n✅  Done — ${ok} ok, ${fail} warnings`);
    await pool.end();
    process.exit(0);
  })();
}
