# RetrofitAI — MongoDB Track Compliance

**Hackathon:** Building Agents for Real-World Challenges | MongoDB Track  
**Last verified:** June 11, 2026  
**Database:** MongoDB Atlas (`retrofitai`)  
**MCP package:** `@mongodb-js/mongodb-mcp-server@0.0.3`

---

## Checklist

| # | Requirement | Status | Notes |
|---|-------------|--------|-------|
| 1 | MCP server initialization | ✅ Met | Official server spawned via stdio; connection string wired |
| 2 | Agent DB writes via MCP | ⚠️ Partial | Autonomous pipeline + chat tool loop use MCP; several agent routes still use Mongoose |
| 3 | Human approval (pattern + briefing) | ⚠️ Partial | Autonomous pipeline uses drafts; chat intents bypass approval |
| 4 | Gemini model version | ⚠️ Note | `gemini-2.5-flash` in use; `gemini-3.5-flash` not verified in GCP |
| 5 | `[MCP]` logging | ⚠️ Partial | All wrapper ops log; connection bootstrap uses different prefix |

---

## 1. MCP Server Initialization

**Status: ✅ Met**

**File:** `backend/src/services/mcpService.js`

- Spawns the **official** MongoDB MCP server:
  ```js
  path.join(__dirname, '../../node_modules/@mongodb-js/mongodb-mcp-server/dist/index.js')
  ```
- Transport: `@modelcontextprotocol/sdk` `StdioClientTransport` with `command: 'node'`.
- Connection string passed as `MDB_MCP_CONNECTION_STRING` from `process.env.MONGODB_URI`:
  ```js
  env: {
    ...process.env,
    MDB_MCP_CONNECTION_STRING: process.env.MONGODB_URI,
  }
  ```
- Client name: `retrofitai-agent` v1.0.0.

**Minor gap:** Does not read `process.env.MDB_MCP_CONNECTION_STRING` directly if set separately. For judges, ensure `MONGODB_URI` is set in Cloud Run / `.env`.

**Optional hardening:**
```js
MDB_MCP_CONNECTION_STRING: process.env.MDB_MCP_CONNECTION_STRING || process.env.MONGODB_URI,
```

---

## 2. Agent Database Operations (MCP vs Mongoose)

### ✅ Fully MCP-compliant paths

| Flow | File | Operations |
|------|------|------------|
| **Autonomous pipeline** | `geminiService.js` → `runAutonomousPipeline` | `mcp.find`, `mcp.findOne`, `mcp.insertOne`, `mcp.updateOne`, `mcp.deleteOne` for applications, agent_drafts, rejection_patterns (read only), weekly_briefings (read only), agent_runs |
| **Chat tool loop** | `geminiService.js` → `runAgentLoop` | All Gemini tool calls → `mcp.executeGeminiTool` → MCP wrappers |
| **Draft approval** | `routes/agent.js` → `POST /confirm-draft/:draftId` | `mcp.updateOne` (patterns), `mcp.insertOne` (briefings), `mcp.deleteOne` (draft) |

### ⚠️ Exceptions (Mongoose / `mongoService` still used)

These are **agent-adjacent** flows that do **not** go through MCP today:

| Location | What still uses Mongoose | Risk for judges |
|----------|--------------------------|-----------------|
| `routes/agent.js` → `POST /chat` | `pushConversationEntry`, `updateProfile`, `applyMongoUpdate`, `getApplicationsForUser`, `getRejectionPattern` | Chat history + profile updates bypass MCP |
| `routes/agent.js` → `handleAgentIntent` → `WEEKLY_REPORT` | `mongo.saveWeeklyBriefing` — **writes briefing directly, no draft** | Breaks human-approval story for chat-triggered briefings |
| `routes/agent.js` → `handleAgentIntent` → `JOB_ANALYSIS` | `mongo.saveJobAnalysis` | Onboarding/batch path |
| `routes/agent.js` → `POST /finalize-analysis` | `getJobAnalysesForUser`, `saveApplication`, `saveJobAnalysis`, `getOrCreateProfile` | Post-batch pipeline setup |
| `routes/agent.js` → `GET /session-init` | All reads + `updateProfile` | Session bootstrap |
| `routes/agent.js` → `GET/PATCH /drafts` | `getAgentDrafts`, `updateDraftStatus` | Draft list/dismiss reads & status via Mongoose |
| `routes/agent.js` → `confirm-draft` | `mongo.getAgentDraftById` (read only) | Write path is MCP ✅ |
| `routes/insights.js` → `POST /recalculate` | `mongo.saveRejectionPattern` | Pattern saved without approval |
| `routes/briefings.js` | `mongo.saveWeeklyBriefing` | Briefing saved without approval |
| `routes/applications.js` | `mongo.saveRejectionPattern` on status → REJECTED | Side-effect write |
| `routes/jobs.js`, `routes/profile.js` | Standard CRUD | User-facing APIs, not autonomous agent |

### `runAgentLoop` tool writes (important)

`mcpService.executeGeminiTool` exposes `save_rejection_pattern` and `save_weekly_briefing`, which write **directly** to `rejection_patterns` / `weekly_briefings` when Gemini invokes them during chat — **not** via `agent_drafts` + approval.

**Recommended fix for full compliance** — change `save_rejection_pattern` / `save_weekly_briefing` in `mcpService.js`:

```js
case 'save_rejection_pattern': {
  const { userId, pattern } = toolArgs;
  const draft = {
    _id: `draft_pattern_chat_${userId}_${Date.now()}`,
    userId,
    type: 'pattern',
    company: 'Rejection Analysis',
    role: pattern.dominantPattern || '',
    subject: `Pattern: ${pattern.dominantPattern || 'analysis'}`,
    body: pattern.insight || '',
    payload: { ...pattern, userId, _id: `pattern_${userId}` },
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  await insertOne('agent_drafts', draft);
  return { success: true, pendingApproval: true, draftId: draft._id };
}

case 'save_weekly_briefing': {
  const { userId, briefing } = toolArgs;
  const draft = {
    _id: `draft_briefing_${userId}_week${briefing.weekNumber}`,
    userId,
    type: 'briefing',
    company: 'Weekly Briefing',
    role: `Week ${briefing.weekNumber}`,
    subject: `Week ${briefing.weekNumber} briefing`,
    body: (briefing.priorityActions || []).map((a) => `• ${a.action || a}`).join('\n'),
    payload: { ...briefing, userId },
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  await insertOne('agent_drafts', draft);
  return { success: true, pendingApproval: true, draftId: draft._id };
}
```

And in `routes/agent.js` `handleAgentIntent` for `WEEKLY_REPORT`, replace `mongo.saveWeeklyBriefing(briefingDoc)` with `mcp.insertOne('agent_drafts', { type: 'briefing', payload: briefingDoc, ... })`.

---

## 3. Human Approval (Patterns & Briefings)

**Status: ⚠️ Partial**

### ✅ Met — Autonomous pipeline (`runAutonomousPipeline`)

1. Gemini generates pattern/briefing content.
2. Result stored as `agent_drafts` with `type: 'pattern' | 'briefing'`, `status: 'pending'`, full doc in `payload`.
3. User sees draft cards in chat (`AgentChat.tsx`).
4. **Approve** → `POST /api/agent/confirm-draft/:draftId`:
   - `pattern` → `mcp.updateOne('rejection_patterns', …)`
   - `briefing` → `mcp.insertOne('weekly_briefings', …)`
   - Draft removed via `mcp.deleteOne('agent_drafts', …)`

**Relevant files:**
- `backend/src/models/AgentDraft.js` — `type`, `payload` fields
- `backend/src/services/geminiService.js` — lines ~746–765 (pattern draft), ~820–837 (briefing draft)
- `backend/src/routes/agent.js` — `POST /confirm-draft/:draftId`
- `frontend/src/lib/api.ts` — `confirmDraft()`
- `frontend/src/components/AgentChat.tsx` — Approve / Dismiss UI

### ❌ Not met — Other paths that skip approval

| Path | Behavior |
|------|----------|
| Chat intent `WEEKLY_REPORT` | `handleAgentIntent` → `mongo.saveWeeklyBriefing` directly |
| Chat tool `save_weekly_briefing` | MCP insert to `weekly_briefings` directly |
| Chat tool `save_rejection_pattern` | MCP upsert to `rejection_patterns` directly |
| `POST /insights/recalculate` | `mongo.saveRejectionPattern` directly |

**Demo script for judges (compliant path):**
1. Complete onboarding with demo data.
2. Return visit → autonomous pipeline runs (watch backend logs for `[MCP]`).
3. Approve pattern/briefing draft cards in chat.
4. Confirm `[MCP] confirm-draft → rejection_patterns upsert` or `weekly_briefings insert` in logs.

---

## 4. Gemini Model Version

**Status: ⚠️ Note**

**File:** `backend/src/services/geminiService.js` line 22

```js
const MODEL = 'gemini-2.5-flash';
```

- Hackathon spec / `CLAUDE.md` target: **`gemini-3.5-flash`** via Vertex AI.
- Current code uses **`gemini-2.5-flash`**, which is available and working in this project.
- `gemini-3.5-flash` availability depends on GCP project + region (`GOOGLE_CLOUD_LOCATION`, default `us-central1`). **Not verified** in this environment.

**To upgrade (when available in your project):**
```js
const MODEL = 'gemini-3.5-flash';
```

**To verify in GCP:**
```bash
# List models in your project/region via Vertex AI Model Garden or:
gcloud ai models list --region=us-central1 --project=$GOOGLE_CLOUD_PROJECT
```

If the model returns 404, keep `gemini-2.5-flash` and mention both in the Devpost submission.

---

## 5. MCP Logging

**Status: ⚠️ Partial**

### ✅ Logged with `[MCP]` prefix

| Function | Log format |
|----------|------------|
| `find` | `[MCP] find → collection` / `[MCP] find ← collection: N doc(s)` |
| `insertOne` | `[MCP] insert-one → collection` / `[MCP] insert-one ← collection: ok` |
| `updateOne` | `[MCP] update-one → collection` / `[MCP] update-one ← collection: ok` |
| `deleteOne` | `[MCP] delete-one → collection` / `[MCP] delete-one ← collection: ok` |
| `count` | `[MCP] count → collection` |
| `aggregate` | `[MCP] aggregate → collection` |
| `runAgentLoop` | `[MCP] Calling tool: {name}` / `[MCP] Tool error for {name}` |
| `confirm-draft` route | `[MCP] confirm-draft → …` |

### Gaps

| Location | Current log | Recommended |
|----------|-------------|-------------|
| `mcpService.getClient()` | `MongoDB MCP server connected` | `console.log('[MCP] MongoDB MCP server connected')` |
| `callTool()` | *(none)* | `console.log('[MCP] callTool:', toolName)` |

**One-line fixes in `mcpService.js`:**
```js
// getClient(), after connect:
console.log('[MCP] MongoDB MCP server connected');

// callTool(), first line:
console.log(`[MCP] callTool → ${toolName}`);
```

---

## Architecture Summary (for judges)

```
User → React (Vercel)
         ↓ REST
       Express (Cloud Run)
         ├─ User CRUD routes ──────────→ Mongoose → MongoDB Atlas
         └─ Agent flows
              ├─ runAutonomousPipeline ──→ MCP stdio ──→ @mongodb-js/mongodb-mcp-server
              ├─ runAgentLoop (chat) ────→ mcp.executeGeminiTool ──→ MCP
              └─ confirm-draft ──────────→ MCP (writes) + Mongoose (read draft)
```

**Key demo talking points:**
1. Agent **reads and writes** through the official MongoDB MCP server (stdio subprocess).
2. Autonomous login pipeline streams NDJSON events to the UI (`AgentEventsPanel`).
3. Sensitive writes (patterns, briefings) require **human approval** via draft cards.
4. Console shows `[MCP]` prefixed logs during the autonomous run.

---

## Pre-Submission Action Items

| Priority | Action |
|----------|--------|
| High | Route chat `WEEKLY_REPORT` intent through `agent_drafts` instead of direct `saveWeeklyBriefing` |
| High | Change `save_rejection_pattern` / `save_weekly_briefing` MCP tools to create drafts, not direct writes |
| Medium | Migrate `POST /chat` conversation + profile updates to MCP (or document as non-agent CRUD) |
| Medium | Add `[MCP]` prefix to `getClient` / `callTool` logs |
| Low | Verify `gemini-3.5-flash` in GCP; update `MODEL` constant if available |
| Low | Support `MDB_MCP_CONNECTION_STRING \|\| MONGODB_URI` fallback |

---

## Quick Verification Commands

```bash
# Start backend, trigger autonomous run, grep MCP logs
cd backend && npm run dev
# In another terminal after login:
curl -X POST http://localhost:3001/api/agent/autonomous-run -b cookies.txt
# Expect lines like: [MCP] find → applications {"userId":"..."}
```

```bash
# Frontend build
cd frontend && npm run build
```

---

*This document reflects the codebase as of the agent-features implementation (proactive chat, MCP autonomous pipeline, draft approval). Re-run this audit after any refactor.*
