# RetrofitAI — CLAUDE.md

**Hackathon:** Building Agents for Real-World Challenges | MongoDB Track
**Deadline:** June 11, 2026, 2:00 PM PT
**Developer:** Roshaan Ahsan (Solo)
**Goal:** Win $5,000 first place in MongoDB track

---

## WHAT WE'RE BUILDING

RetrofitAI is an AI career agent that detects WHY a user is failing their job search by analyzing rejection patterns across MongoDB documents — then rebuilds their strategy in real time.

**One line:** "Every AI job tool helps you apply to more jobs. RetrofitAI is the first that tells you why you're failing."

---

## MANDATORY REQUIREMENTS (NEVER BREAK)

1. AI brain = **Gemini 3** via Vertex AI (model: `gemini-3.5-flash`)
2. Platform = **Google Cloud Agent Builder** (wire in for final submission)
3. Partner = **MongoDB MCP Server** (agent reads/writes through MCP, not just raw driver)
4. Hosted public URL (Vercel frontend + Google Cloud Run backend)
5. Public GitHub repo with MIT LICENSE file visible in About section
6. ~3 min demo video on YouTube/Vimeo
7. Submit at rapid-agent.devpost.com before June 11 2026 2:00 PM PT
8. Track = MongoDB

---

## TECH STACK

- Frontend: React + TypeScript + Vite
- Styling: Tailwind CSS + shadcn/ui
- Backend: Node.js + Express
- Database: MongoDB Atlas M0 (cluster: hackathon-db, Singapore)
- AI: Gemini 3 via Vertex AI
- PDF: PDFKit
- Icons: Lucide React
- Charts: Recharts
- Deploy: Vercel (frontend) + Google Cloud Run (backend)

---

## MONGODB COLLECTIONS (5 total)

**career_profiles** — one per user

```
userId, currentRole, targetRole, targetIndustry, yearsExperience,
resumeText, skills[], salaryMin, salaryMax, location, urgency,
searchStartDate, conversationHistory[]
```

**job_analyses** — one per analyzed JD

```
userId, jobTitle, company, jobDescriptionRaw, matchScore(0-100),
strongMatches[], gaps[], missingKeywords[], postingAge,
verdict(APPLY_NOW|APPLY_WITH_EDITS|SKIP), coverLetterText,
coverLetterStrategy, analyzedAt
```

**applications** — one per job applied to

```
userId, jobAnalysisId, company, role, appliedDate, status,
statusHistory[], rejectionStage, followUpSent, daysSinceApply, notes
status values: APPLIED|NO_RESPONSE|PHONE_SCREEN|INTERVIEW|OFFER|REJECTED
```

**rejection_patterns** — one per user, updated on each rejection

```
userId, totalApplications, totalRejections, rejectionBreakdown{},
dominantPattern(PRE_INTERVIEW|POST_INTERVIEW|FINAL_ROUND),
patternConfidence(LOW|MEDIUM|HIGH), insight, recommendedActions[],
missingKeywordsAcrossRejections[], lastCalculated
```

**weekly_briefings** — one per user per week

```
userId, weekNumber, applicationsSentThisWeek, responseRate,
interviewRate, industryAvgResponseRate(0.15), momentumScore(0-100),
momentumTrend(UP|DOWN|FLAT), bestPerformingCategory,
worstPerformingCategory, priorityActions[], pdfGenerated
```

---

## AGENT BEHAVIOR

### Gemini Response Format (always return this JSON)

```json
{
  "reply": "conversational reply to show user",
  "mongoUpdates": {
    "collection": "applications",
    "operation": "update|insert|none",
    "filter": {},
    "data": {}
  },
  "agentAction": "TRIGGER_REJECTION_ANALYSIS|GENERATE_BRIEFING|NONE",
  "uiHints": {
    "showPatternAlert": false,
    "highlightStaleApplications": []
  }
}
```

### Agent Modes

- **NEW_USER** → run intake interview → save career_profile → PROFILE_COMPLETE
- **PROFILE_COMPLETE** → job analysis / pipeline tracking → ACTIVE_SEARCH
- **ACTIVE_SEARCH + 3 rejections** → run pattern analysis → PATTERN_DETECTED
- **RETURNING_USER** → proactive briefing (check stale apps, pending insights) → resume session

### System Prompt Rules

- Always load career_profile from MongoDB before responding
- Never re-ask information already in the profile
- Return structured JSON only — no markdown, no preamble
- Tie every recommendation to user's specific MongoDB data
- Disclaimer always present: "RetrofitAI provides career guidance, not licensed career counseling."

---

## 6 FEATURES (BUILD IN THIS ORDER)

1. **Intake** — agent interviews new user, saves career_profile to MongoDB
2. **Job Analyzer** — paste JD → matchScore + gaps + verdict + cover letter
3. **Rejection Intelligence** — 3+ rejections → pattern analysis → specific insight
4. **Proactive Follow-Up** — on return visit, agent leads with status briefing
5. **Pipeline Kanban** — track applications by status, drag between columns
6. **Weekly Briefing + PDF** — momentum score + priority actions + downloadable PDF

---

## FILE STRUCTURE

```
hireiq/
├── CLAUDE.md
├── backend/
│   ├── .env
│   ├── index.js
│   ├── models/
│   │   ├── CareerProfile.js
│   │   ├── Application.js
│   │   ├── JobAnalysis.js
│   │   ├── RejectionPattern.js
│   │   └── WeeklyBriefing.js
│   ├── routes/
│   │   ├── agent.js
│   │   ├── applications.js
│   │   ├── profiles.js
│   │   └── briefings.js
│   └── services/
│       ├── geminiService.js
│       └── pdfService.js
└── frontend/
    └── src/
        ├── App.tsx
        ├── api.ts
        └── components/
            ├── Sidebar.tsx
            ├── Header.tsx
            ├── AgentChat.tsx
            ├── Dashboard.tsx
            ├── JobAnalyzer.tsx
            ├── Pipeline.tsx
            ├── Insights.tsx
            └── WeeklyBrief.tsx
```

---

## OPERATING RULES

- Write complete files — no TODOs, no placeholders
- One function per agent action in geminiService.js
- MongoDB ops in service files, not inline in routes
- Confirm each feature works before moving to next
- Prioritize backend correctness over UI polish
- UI direction is given separately per component — do not invent UI decisions
