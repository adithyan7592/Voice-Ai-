-- ═══════════════════════════════════════════════════════════
-- VoiceOS Malayalam Platform — PostgreSQL Schema
-- Run: node db/migrate.js  (or paste into Railway's SQL panel)
-- ═══════════════════════════════════════════════════════════

-- Agents table
CREATE TABLE IF NOT EXISTS agents (
  id            VARCHAR(50) PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  role          VARCHAR(100) DEFAULT 'Sales Agent',
  persona       VARCHAR(100) DEFAULT 'Friendly Sales Lady',
  voice         VARCHAR(100) DEFAULT 'South Kerala',
  region        VARCHAR(50)  DEFAULT 'South Kerala',
  greeting      TEXT         NOT NULL,
  system_prompt TEXT         NOT NULL,
  number        VARCHAR(20),
  status        VARCHAR(20)  DEFAULT 'idle',
  temperature   DECIMAL(3,2) DEFAULT 0.80,
  max_duration  INT          DEFAULT 300,
  end_silence   INT          DEFAULT 2,
  interruption  BOOLEAN      DEFAULT true,
  auto_intent   BOOLEAN      DEFAULT true,
  crm_capture   BOOLEAN      DEFAULT true,
  escalation    BOOLEAN      DEFAULT true,
  color         VARCHAR(20)  DEFAULT 'amber',
  calls_total   INT          DEFAULT 0,
  success_rate  INT          DEFAULT 0,
  created_at    TIMESTAMP    DEFAULT NOW(),
  updated_at    TIMESTAMP    DEFAULT NOW()
);

-- Documents (knowledge base)
CREATE TABLE IF NOT EXISTS documents (
  id          VARCHAR(50) PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  size        VARCHAR(20),
  type        VARCHAR(10)  DEFAULT 'pdf',
  status      VARCHAR(20)  DEFAULT 'queued',
  chunks      INT          DEFAULT 0,
  content     TEXT         DEFAULT '',
  uploaded_at TIMESTAMP    DEFAULT NOW()
);

-- Agent ↔ Document many-to-many
CREATE TABLE IF NOT EXISTS agent_documents (
  agent_id    VARCHAR(50) REFERENCES agents(id) ON DELETE CASCADE,
  document_id VARCHAR(50) REFERENCES documents(id) ON DELETE CASCADE,
  PRIMARY KEY (agent_id, document_id)
);

-- Phone numbers
CREATE TABLE IF NOT EXISTS phone_numbers (
  id           VARCHAR(50) PRIMARY KEY,
  number       VARCHAR(20) NOT NULL UNIQUE,
  agent_id     VARCHAR(50) REFERENCES agents(id) ON DELETE SET NULL,
  region       VARCHAR(50) DEFAULT '—',
  type         VARCHAR(20) DEFAULT 'DID',
  monthly_rate VARCHAR(20) DEFAULT '₹499',
  status       VARCHAR(20) DEFAULT 'available',
  calls_total  INT         DEFAULT 0,
  created_at   TIMESTAMP   DEFAULT NOW()
);

-- Call logs
CREATE TABLE IF NOT EXISTS calls (
  id          VARCHAR(50) PRIMARY KEY,
  twilio_sid  VARCHAR(100),
  caller      VARCHAR(20) NOT NULL,
  agent_id    VARCHAR(50) REFERENCES agents(id) ON DELETE SET NULL,
  agent_name  VARCHAR(100),
  duration    INT         DEFAULT 0,       -- stored in seconds, formatted in API/UI
  status      VARCHAR(20) DEFAULT 'in-progress',
  intent      VARCHAR(100) DEFAULT 'Unknown',
  sentiment   VARCHAR(20)  DEFAULT 'neutral',
  region      VARCHAR(50),
  started_at  TIMESTAMP   DEFAULT NOW(),
  ended_at    TIMESTAMP,
  recording_url TEXT,
  summary     TEXT
);

-- Transcript messages per call
CREATE TABLE IF NOT EXISTS transcripts (
  id        SERIAL PRIMARY KEY,
  call_id   VARCHAR(50) REFERENCES calls(id) ON DELETE CASCADE,
  role      VARCHAR(20) NOT NULL,   -- 'agent' | 'caller' | 'stt_full'
  text      TEXT        NOT NULL,
  created_at TIMESTAMP  DEFAULT NOW()
);

-- Conversation state (in-memory for active calls, persisted for resume)
CREATE TABLE IF NOT EXISTS call_sessions (
  call_id     VARCHAR(50) PRIMARY KEY,
  agent_id    VARCHAR(50),
  history     JSONB       DEFAULT '[]',
  created_at  TIMESTAMP   DEFAULT NOW(),
  updated_at  TIMESTAMP   DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_calls_agent_id    ON calls(agent_id);
CREATE INDEX IF NOT EXISTS idx_calls_started_at  ON calls(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_transcripts_call  ON transcripts(call_id);
CREATE INDEX IF NOT EXISTS idx_numbers_agent     ON phone_numbers(agent_id);
CREATE INDEX IF NOT EXISTS idx_sessions_updated  ON call_sessions(updated_at);

-- Orphan session cleanup (run manually or as cron)
-- DELETE FROM call_sessions WHERE updated_at < NOW() - INTERVAL '2 hours';

-- Seed default agents (Kerala Paints)
INSERT INTO agents (id, name, role, persona, voice, region, greeting, system_prompt, number, status, temperature, color)
VALUES
  ('ag_001', 'Lakshmi', 'Sales Agent', 'Friendly Sales Lady',
   'South Kerala (Thiruvananthapuram)', 'South Kerala',
   'നമസ്കാരം! ഞാൻ ലക്ഷ്മി, Kerala Paints-ൽ നിന്ന് സംസാരിക്കുന്നു. BHADRAM paint-നെ പറ്റി അറിയാൻ ആഗ്രഹമുണ്ടോ?',
   'You are Lakshmi, a friendly and knowledgeable sales agent for Kerala Paints. You speak primarily in Malayalam (Kerala dialect, South Kerala accent - Thiruvananthapuram style). You are warm, helpful, and sound like a real Kerala lady. You know everything about BHADRAM interior paint - pricing (₹185/litre, ₹680/4L), coverage (100-120 sq ft per litre), 180 color options, and you can arrange free site visits. Keep responses natural and conversational. Use some English words naturally as Keralites do. Be enthusiastic but not pushy.',
   '+91 80 4567 8901', 'active', 0.80, 'amber'),

  ('ag_002', 'Priya', 'Support Agent', 'Helpful Support Lady',
   'Central Kerala (Thrissur)', 'Central Kerala',
   'നമസ്കാരം! ഞാൻ പ്രിയ. Kerala Paints customer support-ൽ നിന്ന്. എന്ത് സഹായം വേണം?',
   'You are Priya, a helpful customer support agent for Kerala Paints. You speak in Malayalam with a Central Kerala (Thrissur) accent. You handle complaints, queries, and support issues warmly and professionally. You sound like a real Kerala lady - patient, understanding, and efficient. Mix some English naturally as Keralites do. You have access to order details, warranty info, and can escalate to a supervisor.',
   '+91 80 4567 8902', 'active', 0.70, 'teal'),

  ('ag_003', 'Meera', 'Lead Qualifier', 'Professional Qualifier',
   'North Kerala (Kozhikode)', 'North Kerala',
   'ഹലോ! ഞാൻ മീര, Kerala Paints-ൽ നിന്ന്. ഞങ്ങളുടെ products-നെ കുറിച്ച് enquire ചെയ്യുകയാണോ?',
   'You are Meera, a professional lead qualification agent for Kerala Paints. You speak in Malayalam with a North Kerala (Kozhikode/Malabar) accent and style. Your goal is to qualify leads by understanding their painting needs, budget, timeline, and location. Sound like a real Kerala lady from the north - friendly but efficient. Ask one question at a time.',
   '+91 80 4567 8903', 'idle', 0.75, 'blue')
ON CONFLICT (id) DO NOTHING;

INSERT INTO documents (id, name, size, type, status, chunks, content)
VALUES
  ('doc_001', 'BHADRAM Product Guide.pdf', '2.4 MB', 'pdf', 'trained', 148,
   'BHADRAM is Kerala Paints premium interior emulsion. Price: ₹185/litre, ₹680/4L, ₹1240/8L, ₹2200/16L. Coverage: 100-120 sq ft per litre. Available in 180 shades. Washable, low-VOC, Kerala weather resistant. 5 year warranty. Free site visit available. Factory outlets in all major Kerala cities.'),
  ('doc_002', 'IVR Sales Script.docx', '89 KB', 'doc', 'trained', 34,
   'Sales script: Greeting → Ask about painting need → Recommend BHADRAM → Share pricing → Offer free site visit → Get address → Confirm booking → Thank caller.'),
  ('doc_003', 'Dealer & Pricing FAQ.pdf', '1.1 MB', 'pdf', 'trained', 72,
   'Dealers in all 14 Kerala districts. Factory outlets: Thiruvananthapuram, Kochi, Thrissur, Kozhikode, Kannur. Bulk discount: 5% on 50+ litres, 10% on 100+ litres. Dealer margin: 15%. Dealership investment: ₹2 lakhs minimum.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO phone_numbers (id, number, agent_id, region, status, calls_total)
VALUES
  ('num_001', '+918045678901', 'ag_001', 'South Kerala', 'active', 842),
  ('num_002', '+918045678902', 'ag_002', 'Central Kerala', 'active', 1204),
  ('num_003', '+918045678903', 'ag_003', 'North Kerala', 'active', 391),
  ('num_004', '+918045678904', NULL, '—', 'available', 0)
ON CONFLICT (id) DO NOTHING;
