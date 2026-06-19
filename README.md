# RetrofitAI

**AI career agent that tells you why you're failing your job search — not just how to apply to more jobs.**

[![Live Demo](https://img.shields.io/badge/Demo-Live-8f7fe0?style=for-the-badge&logoColor=white)](https://frontend-six-sigma-45.vercel.app?landing=true)
[![MIT License](https://img.shields.io/badge/License-MIT-7264b3?style=for-the-badge&logoColor=white)](LICENSE)
[![MongoDB Track](https://img.shields.io/badge/Hackathon-MongoDB%20Track-171129?style=for-the-badge&logoColor=8f7fe0)](https://rapid-agent.devpost.com)

**Live app:** https://frontend-six-sigma-45.vercel.app?landing=true  
**Clean demo Video:** https://youtu.be/dhTnbFFptNI

RetrofitAI analyzes rejection patterns across your application history, detects where in the hiring funnel you're losing, and rebuilds your strategy in real time — powered by **Gemini**, **MongoDB Atlas**, and the **MongoDB MCP Server**.

---

## The Problem

Every AI job tool optimizes for volume — more applications, faster. None of them tell you **why** you keep getting rejected. Most job seekers lose at the same stage repeatedly (no response, post-interview, final round) without ever knowing it.

RetrofitAI is built to detect that pattern and fix it.

---

## Key Features

| Feature | What it does |
|---|---|
| **Intake interview** | Conversational onboarding → saves `career_profiles` via agent + MCP |
| **Job analyzer** | Paste a JD → match score, gaps, ATS keywords, verdict, cover letter |
| **Rejection intelligence** | 3+ rejections → dominant funnel pattern + recommended actions |
| **Agent drafts** | Follow-ups, patterns, and briefings queued for **your approval** before save |
| **Mission Control** | One-click playbooks (rejection analysis, skill gaps, cover letter, briefing) |
| **Pipeline tracking** | Track applications by status with days-since-apply |
| **Weekly briefing + PDF** | Momentum score, response rate vs. 15% benchmark, priority actions |
| **MongoDB MCP panel** | Live visibility into every agent read/write against your data |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, Recharts |
| Backend | Node.js, Express |
| Database | MongoDB Atlas M0 |
| AI | Gemini 2.5 Flash via Vertex AI |
| MCP | `@mongodb-js/mongodb-mcp-server` (official MongoDB MCP) |
| Agent Builder | Google Cloud Agent Builder (Dialogflow CX) |
| PDF | PDFKit |
| Sessions | express-session + connect-mongo |
| Deploy | Vercel (frontend) + Google Cloud Run (backend) |

---

## Architecture

```
Browser (React + Vite)
        │
        ▼
Vercel  ── /api/* proxy ──►  Express (Cloud Run)
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
              Vertex AI       MCP Server       Mongoose
              Gemini 2.5      (stdio)            (Atlas)
                    │               │
                    └─────── tool-call loop ──────┘
```

**Agent modes:** `NEW_USER` → `PROFILE_COMPLETE` → `ACTIVE_SEARCH` → `PATTERN_DETECTED`

**Autonomous pipeline** (runs after onboarding, not on every refresh): scans stale applications, drafts follow-ups, queues pattern/briefing drafts for approval, logs to `agent_runs`.

---

## MongoDB Collections

| Collection | Purpose |
|---|---|
| `career_profiles` | User profile, skills, resume, agent mode, conversation history |
| `job_analyses` | Per-JD analysis — match score, gaps, verdict, cover letter |
| `applications` | Pipeline status, rejection stage, follow-up flags |
| `rejection_patterns` | Dominant failure pattern, confidence, recommended actions |
| `weekly_briefings` | Weekly momentum score, trends, priority actions |
| `agent_drafts` | Pending follow-ups, patterns, briefings awaiting approval |
| `agent_runs` | Autonomous pipeline run logs |

---

## Project Structure

```
retrofitai/
├── backend/
│   ├── src/
│   │   ├── index.js
│   │   ├── config.js
│   │   ├── models/          # Mongoose schemas
│   │   ├── routes/          # agent, profile, jobs, applications, briefings, insights
│   │   ├── services/
│   │   │   ├── geminiService.js   # Vertex AI + agent modes + autonomous pipeline
│   │   │   ├── mcpService.js      # MongoDB MCP stdio client
│   │   │   └── mongoService.js    # Data layer + draft deduplication
│   │   └── middleware/session.js
│   ├── scripts/             # seedDemoData, clearDemoData
│   └── Dockerfile
├── frontend/
│   ├── public/favicon.svg
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── AgentChat.tsx          # Center chat + draft approval UI
│   │   │   ├── MissionPanel.tsx         # Mission Control playbooks
│   │   │   ├── AgentEventsPanel.tsx     # Live MongoDB MCP panel
│   │   │   ├── SkillGapChart.tsx
│   │   │   └── ...
│   │   └── lib/api.ts
│   └── vercel.json          # API proxy → Cloud Run
├── COMPLIANCE.md            # Hackathon integration checklist
├── LICENSE
└── README.md
```

---

## Running Locally

### Prerequisites

- Node.js 20+
- MongoDB Atlas cluster (M0 free tier works)
- Google Cloud project with Vertex AI enabled
- `gcloud auth application-default login`

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

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 — Vite proxies `/api/*` to `localhost:3001`.

---

## Deployment

**Frontend (Vercel):**

```bash
cd frontend
npx vercel --prod
```

**Backend (Cloud Run):**

```bash
cd backend
gcloud run deploy hireiq-backend --source . --region us-central1 --allow-unauthenticated
```

Set env vars via `cloudrun-env.yaml` or the Cloud Run console. Never commit secrets.

---

## Demo Flow (3 min)

1. Open `?landing=true` → fresh onboarding
2. Complete setup (resume + jobs) → agent analyzes in background
3. Main screen → Mission Control playbooks on the left
4. **Track outcomes** → log rejections → run rejection mission
5. Center chat → ask about skill gaps or cover letters
6. Approve agent drafts (follow-up / pattern / briefing) in the chat panel
7. Watch the **MongoDB MCP panel** on the right for live reads/writes

---

## Author

**Roshaan Ahsan** — solo project for the [Building Agents for Real-World Challenges](https://rapid-agent.devpost.com) hackathon (MongoDB Track).

## License

MIT © 2026 Roshaan Ahsan — see [LICENSE](LICENSE).
