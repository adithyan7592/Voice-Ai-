# 🎙 VoiceOS — Malayalam IVR Platform
### Complete Deployment Guide — From Zero to Live Calls

---

## Architecture Overview

```
Caller dials India number
       ↓
   Twilio (telephony)
       ↓
   Your Backend (Node.js on Railway)
       ↓
   Google STT → Malayalam text
       ↓
   Claude AI → Malayalam reply
       ↓
   Google TTS → Malayalam speech
       ↓
   Twilio speaks to caller
```

---

## Step 1 — Create Accounts (15 minutes)

### A. Twilio (India phone numbers)
1. Go to **twilio.com** → Sign up (free trial gives ₹1000 credit)
2. Verify your India mobile number
3. Dashboard → **Get a phone number** → choose India (+91)
4. Note your: **Account SID**, **Auth Token**, **Phone Number**

### B. Google Cloud (Malayalam voice)
1. Go to **console.cloud.google.com** → New Project → "voiceos"
2. Enable these APIs:
   - **Cloud Text-to-Speech API**
   - **Cloud Speech-to-Text API**
3. IAM & Admin → Service Accounts → Create Service Account
4. Grant role: **Editor**
5. Keys → Add Key → JSON → Download the file
6. Open the JSON file — you'll need its content in Step 3

### C. Anthropic Claude (AI brain)
1. Go to **console.anthropic.com** → Sign up
2. API Keys → Create Key → Copy it

### D. Railway (hosting — free tier works)
1. Go to **railway.app** → Login with GitHub
2. You'll deploy here in Step 4

---

## Step 2 — Prepare the Code

```bash
# Download/clone this backend folder
cd voiceos-backend

# Install dependencies
npm install

# Copy environment file
cp .env.example .env
```

---

## Step 3 — Fill in Your .env

Open `.env` and fill in:

```env
# From Twilio dashboard
TWILIO_ACCOUNT_SID=ACxxxxxx...
TWILIO_AUTH_TOKEN=your_token
TWILIO_PHONE_NUMBER=+918045678901

# From Anthropic console
ANTHROPIC_API_KEY=sk-ant-...

# Paste your entire Google JSON key file content here (one line):
GOOGLE_APPLICATION_CREDENTIALS_JSON={"type":"service_account",...}

# Leave empty for now — Railway gives you this URL after deploy
BASE_URL=https://your-app.up.railway.app

# Create any secret string (used by dashboard to authenticate)
API_SECRET=my-super-secret-key-2024

# Railway gives you this automatically when you add PostgreSQL
DATABASE_URL=postgresql://...
```

---

## Step 4 — Deploy to Railway

### Option A: GitHub (recommended)

```bash
# Push your code to GitHub
git init
git add .
git commit -m "VoiceOS Malayalam Platform"
git remote add origin https://github.com/YOUR_USERNAME/voiceos-backend
git push -u origin main
```

Then on Railway:
1. **New Project** → Deploy from GitHub repo → select your repo
2. **Add PostgreSQL**: New → Database → PostgreSQL (Railway gives you DATABASE_URL automatically)
3. **Add Variables**: Go to Variables tab → add all your .env values
4. **Note your URL**: Railway gives you `https://voiceos-XXXX.up.railway.app`
5. **Update BASE_URL** in Variables to that URL

### Option B: Railway CLI

```bash
npm install -g @railway/cli
railway login
railway init
railway add --plugin postgresql
railway up
```

---

## Step 5 — Run Database Migration

After Railway deploys:

```bash
# Option A: Railway CLI
railway run node db/index.js migrate

# Option B: Railway dashboard
# Go to your PostgreSQL service → Data → SQL editor
# Paste contents of db/schema.sql and run
```

---

## Step 6 — Connect Twilio Webhooks

This is where Twilio knows to call your server when someone dials your number.

1. Go to **twilio.com** → Phone Numbers → Manage → Active Numbers
2. Click your India number
3. Set these webhook URLs (replace with your Railway URL):

```
Voice Configuration:
  A call comes in → Webhook (HTTP POST):
  https://your-app.up.railway.app/twilio/incoming

  Call Status Changes → Status Callback URL:
  https://your-app.up.railway.app/twilio/status
```

4. Save. **Done.** Call your number — Lakshmi answers in Malayalam! 🎉

---

## Step 7 — Connect Your Dashboard

Update the React dashboard to hit your live API:

In the frontend dashboard (voiceos-malayalam-platform.jsx), the API calls replace localStorage.
Add this to the top of the dashboard file:

```javascript
const API_BASE = "https://your-app.up.railway.app/api";
const API_KEY  = "my-super-secret-key-2024"; // matches your API_SECRET

async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "x-api-key": API_KEY }
  });
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
    body: JSON.stringify(body)
  });
  return res.json();
}
```

Then replace the `useStorage` hooks with API calls:
```javascript
// Replace: const [agents, setAgents] = useStorage("agents", DEFAULT_AGENTS);
// With:
const [agents, setAgents] = useState([]);
useEffect(() => { apiGet("/agents").then(setAgents); }, []);
```

---

## API Reference

All endpoints require header: `x-api-key: YOUR_API_SECRET`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/agents | List all agents |
| POST | /api/agents | Create agent |
| PATCH | /api/agents/:id | Update agent |
| DELETE | /api/agents/:id | Delete agent |
| GET | /api/calls | Call logs (filterable) |
| GET | /api/calls/:id | Call + transcript |
| GET | /api/documents | Knowledge docs |
| POST | /api/documents/upload | Upload document |
| POST | /api/documents/:id/train | Start training |
| GET | /api/numbers | Phone numbers |
| POST | /api/numbers | Add number |
| PATCH | /api/numbers/:id | Assign agent |
| GET | /api/analytics/summary | Dashboard stats |

Twilio webhooks (no auth — Twilio signature validated):
| POST | /twilio/incoming | Inbound call handler |
| POST | /twilio/respond | Caller speech reply |
| POST | /twilio/no-input | Silence handler |
| POST | /twilio/status | Call status updates |

---

## Costs (approximate)

| Service | Cost | Notes |
|---------|------|-------|
| Twilio India DID | ₹500/month | Per number |
| Twilio call charges | ₹0.85/min | Inbound |
| Google TTS | ~₹1.6/1M chars | ml-IN Wavenet |
| Google STT | ~₹90/1M chars | Phone model |
| Claude Sonnet | ~₹2.5/1M tokens | Input+output |
| Railway (app) | Free–$5/mo | Hobby plan |
| Railway (PostgreSQL) | Free–$5/mo | 1GB included |
| **Total per 1000 calls** | ~**₹3,500–4,500** | 2 min avg calls |

---

## Going Further

- **Better Malayalam TTS**: ElevenLabs has more natural Kerala voices (costlier)
- **Call Recording**: Enable in Twilio → recordings saved to S3
- **Vector Search**: Replace simple content search with Pinecone for smarter knowledge retrieval
- **CRM Integration**: Add webhook to push lead data to HubSpot / Zoho CRM
- **WhatsApp Bot**: Same Claude agent can work on WhatsApp Business API
- **Multi-language**: Add Tamil support for cross-border callers

---

## Troubleshooting

**"No agent found" on call**
→ Check phone number in DB matches Twilio number exactly (with country code)

**Agent speaks English not Malayalam**
→ Twilio's TTS voice `Google.ml-IN-Wavenet-A` requires Google TTS credentials
→ Verify GOOGLE_APPLICATION_CREDENTIALS_JSON is valid JSON

**Call drops after greeting**
→ Check BASE_URL in env — must be your Railway URL, not localhost
→ Twilio can't reach localhost

**STT not transcribing Malayalam**
→ Ensure `language: "ml-IN"` in Gather verb
→ Caller must speak clearly — phone call audio quality matters

**Database errors**
→ Run migration: `railway run node db/index.js migrate`
→ Check DATABASE_URL in Railway Variables tab
