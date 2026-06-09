# HireIQ

**AI career agent that tells you why you're failing your job search — not just how to apply to more jobs.**

HireIQ analyzes rejection patterns across your application history, detects where in the hiring funnel you're losing, and rebuilds your strategy in real time. It connects to your data through a conversational agent, not a form.

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

---

## The Problem

Every AI job tool optimizes for volume — more applications, faster. None of them tell you why you keep getting rejected. Most job seekers are losing at the same stage repeatedly (no response, post-interview, final round) without ever knowing it. HireIQ is the first tool built specifically to detect that pattern and fix it.

---

## Key Features

### 1. Intake Interview
The agent conducts a structured onboarding conversation, asking for your current role, target role, skills, resume, and urgency. All answers are saved to MongoDB automatically via the MCP tool-call loop — no forms, no manual input.

### 2. Job Analyzer
Paste any job description and get a match score (0–100), skill gap breakdown, missing ATS keywords, a APPLY_NOW / APPLY_WITH_EDITS / SKIP verdict, and a tailored cover letter — all in one request.

### 3. Rejection Intelligence
After three or more rejections, the agent runs a pattern analysis. It identifies whether you're losing pre-interview (resume/ATS issue), post-interview (skills gap), or at the final round (offer negotiation or culture fit), and provides specific recommendations tied to your actual data.

### 4. Proactive Follow-Up
On every return visit, the agent leads with a status briefing — flagging stale applications, surfacing new pattern insights, and prioritizing the actions with the highest impact. You are never greeted with a blank chat box.

### 5. Pipeline Kanban
Track every application by status (Applied → Phone Screen → Interview → Offer / Rejected). Drag between columns, add notes, and see days-since-apply at a glance.

### 6. Weekly Briefing + PDF
A weekly momentum score, response rate vs. industry average, best and worst performing application categories, and three priority actions — downloadable as a PDF report.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite |
| Styling | Tailwind CSS, shadcn/ui |
| Backend | Node.js, Express |
| Database | MongoDB Atlas M0 |
| AI | Gemini 2.5 Flash via Vertex AI |
| MCP | `@mongodb-js/mongodb-mcp-server` |
| Agent Orchestration | Google Cloud Agent Builder (Dialogflow CX) |
| PDF | PDFKit |
| Charts | Recharts |
| Auth | express-session + connect-mongo (anonymous, 30-day TTL) |
| Deploy | Vercel (frontend) + Google Cloud Run (backend) |

---

## Architecture Overview

```
Browser (React + Vite)
        │
        │  HTTPS
        ▼
Vercel Edge (proxy /api/* → Cloud Run)
        │
        ▼
Express Backend (Google Cloud Run)
        │
        ├─── geminiService.js
        │         │
        │         ├── Vertex AI  →  Gemini 2.5 Flash
        │         │       └── tool-call loop (up to 5 turns)
        │         │
        │         ├── MCP Client  →  MongoDB MCP Server (stdio)
        │         │       └── find / insertOne / updateOne / aggregate
        │         │               └── MongoDB Atlas (hireiq database)
        │         │
        │         └── Agent Builder Client  →  Dialogflow CX detectIntent
        │
        └─── mongoService.js  →  Mongoose ODM  →  MongoDB Atlas
```

**Agent flow:**
1. Request hits `/api/agent/chat`
2. Backend loads the user's `career_profile` from MongoDB
3. Agent mode (`NEW_USER` → `PROFILE_COMPLETE` → `ACTIVE_SEARCH` → `PATTERN_DETECTED`) determines which Gemini function runs
4. Gemini receives live MongoDB context and a set of MCP tools it can call
5. The tool-call loop executes: Gemini calls a tool → MCP runs it against MongoDB → result returned to Gemini → repeat until Gemini produces a text reply
6. Reply saved to conversation history, returned to frontend

---

## Hackathon Integrations

### Gemini via Vertex AI
**File:** `backend/src/services/geminiService.js`

The `@google-cloud/vertexai` SDK is initialized with Application Default Credentials (ADC). Every agent function (`runIntake`, `runActiveSearch`, `analyzeJob`, `generateCoverLetter`, `analyzeRejectionPattern`, `generateWeeklyBriefingContent`, `draftFollowUpEmail`) calls `getGenerativeModel` on the Vertex AI client with `gemini-2.5-flash`.

```js
// geminiService.js:1
const { VertexAI } = require('@google-cloud/vertexai');

// geminiService.js:12
vertexai = new VertexAI({ project: process.env.GOOGLE_CLOUD_PROJECT, location: 'us-central1' });

// geminiService.js:129 — called on every user message
getClient().getGenerativeModel({ model: 'gemini-2.5-flash', tools: buildGeminiTools(), ... })
```

### Google Cloud Agent Builder
**File:** `backend/src/services/geminiService.js` (function `callAgentBuilder`)
**Route:** `backend/src/routes/agent.js` — `POST /api/agent/builder-chat`

Uses `google-auth-library` to obtain an ADC access token, then calls the Dialogflow CX v3 `detectIntent` REST endpoint directly.

```js
// geminiService.js:474
const endpoint = `https://us-central1-dialogflow.googleapis.com/v3/projects/${project}/locations/us-central1/agents/${agentId}/sessions/${sessionId}:detectIntent`;

// geminiService.js:486
await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body })
```

Agent ID: `agent_1780983431538`
Project: `project-5b77a880-1208-446f-9f4`

### MongoDB MCP Server
**File:** `backend/src/services/mcpService.js`

The `@mongodb-js/mongodb-mcp-server` package is launched as a child process via `StdioClientTransport`. The MCP client connects over stdio and exposes `find`, `insert-one`, `update-one`, `aggregate`, and `count` as tools that Gemini can call during its reasoning loop. Every read and write the agent performs against MongoDB goes through this MCP layer.

```js
// mcpService.js:19
const transport = new StdioClientTransport({
  command: 'node',
  args: [MCP_SERVER_PATH],
  env: { MDB_MCP_CONNECTION_STRING: process.env.MONGODB_URI },
});

// mcpService.js:29
await client.connect(transport);

// mcpService.js:40 — called on every Gemini tool invocation
await client.callTool({ name: toolName, arguments: args });
```

---

## MongoDB Collections

| Collection | Purpose |
|---|---|
| `career_profiles` | One per user — role, skills, resume text, agent mode, conversation history |
| `job_analyses` | One per analyzed job description — match score, gaps, verdict, cover letter |
| `applications` | One per application — status, stage history, days since apply |
| `rejection_patterns` | One per user — dominant failure pattern, confidence, recommended actions |
| `weekly_briefings` | One per user per week — momentum score, priority actions, PDF flag |

---

## Running Locally

### Prerequisites

- Node.js 20+
- MongoDB Atlas cluster (free M0 tier works)
- Google Cloud project with Vertex AI API enabled
- `gcloud` CLI installed and authenticated (`gcloud auth application-default login`)

### Backend

```bash
cd backend
npm install
```

Create `backend/.env`:

```env
MONGODB_URI=your_mongodb_atlas_connection_string
SESSION_SECRET=any_random_32_char_string
GOOGLE_CLOUD_PROJECT=your_gcp_project_id
GOOGLE_CLOUD_LOCATION=us-central1
AGENT_BUILDER_ID=your_dialogflow_cx_agent_id
PORT=3001
NODE_ENV=development
```

```bash
npm run dev
```

Backend runs at `http://localhost:3001`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:5173`. The Vite dev server proxies `/api/*` to `localhost:3001` automatically.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `MONGODB_URI` | Yes | MongoDB Atlas connection string |
| `SESSION_SECRET` | Yes | Secret for signing express-session cookies |
| `GOOGLE_CLOUD_PROJECT` | Yes | GCP project ID (used by Vertex AI and Agent Builder) |
| `GOOGLE_CLOUD_LOCATION` | Yes | GCP region — `us-central1` recommended |
| `AGENT_BUILDER_ID` | Yes | Dialogflow CX agent ID for Agent Builder integration |
| `PORT` | No | Backend port, defaults to `3001` |
| `NODE_ENV` | No | `development` or `production` |
| `FRONTEND_URL` | No | Frontend origin for CORS (required in production) |

> **Never commit `.env` or `cloudrun-env.yaml` to version control.** Both are listed in `.gitignore`.

---

## Deployment

### Frontend — Vercel

```bash
cd frontend
npx vercel --prod
```

The `frontend/vercel.json` rewrite proxies all `/api/*` requests to the Cloud Run backend URL.

### Backend — Google Cloud Run

```bash
cd backend
gcloud run deploy hireiq-backend \
  --source . \
  --region us-central1 \
  --env-vars-file cloudrun-env.yaml \
  --allow-unauthenticated \
  --quiet
```

Cloud Run uses ADC automatically — no service account key file needed.

---

## License

MIT © 2026 Roshaan Ahsan
