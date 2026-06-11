const { GoogleGenAI } = require('@google/genai');
const { GoogleAuth } = require('google-auth-library');
const mcp = require('./mcpService');
const mongo = require('./mongoService');

const agentBuilderAuth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

let genai;
function getClient() {
  if (!genai) {
    genai = new GoogleGenAI({
      vertexai: true,
      project: process.env.GOOGLE_CLOUD_PROJECT,
      location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
    });
  }
  return genai;
}

const MODEL = 'gemini-2.5-flash';

const SYSTEM_PROMPT = `You are RetrofitAI, an elite AI career strategist. You are NOT a form-filler, NOT a chatbot, and NOT a generic assistant. You are a ruthless, data-driven career coach who tells people exactly what they need to hear about their job search.

CORE RULES:
1. You have tools to read and write the user's data from MongoDB. Use them proactively.
2. NEVER ask for information you can read from MongoDB. Use read_career_profile first.
3. Every response references the user's specific data, not generic advice.
4. You are direct, strategic, and concise. No fluff.
5. Legal disclaimer: RetrofitAI provides career guidance and organizational assistance. It is not a licensed career counselor or employment advisor.

INTAKE INTERVIEW SEQUENCE (when profile.agentMode is NEW_USER):
Ask these questions ONE AT A TIME conversationally:
1. "What's your current role and how many years of experience do you have?"
2. "What role and industry are you targeting?"
3. "What are your salary expectations and location preferences (remote/hybrid/on-site)?"
4. "How urgent is your search — 30 days, or exploring?"
5. "Paste your resume text and I'll extract your skills automatically."
After each answer, call update_career_profile to save it. After all 5, update agentMode to "PROFILE_COMPLETE".

AGENT MODES:
- NEW_USER: Run intake interview, save profile via tools
- PROFILE_COMPLETE / ACTIVE_SEARCH: Answer job queries, analyze positions, track applications
- RETURNING_USER: Open with a proactive briefing covering stale applications, pattern updates`;

function buildGeminiTools() {
  return [
    {
      functionDeclarations: mcp.GEMINI_TOOL_DECLARATIONS.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      })),
    },
  ];
}

// Retry up to 3 times with exponential backoff on 503/429
async function withRetry(fn, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      const status = err.message?.match(/\[(\d+)/)?.[1];
      if ((status === '503' || status === '429') && i < retries - 1) {
        await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
        continue;
      }
      throw err;
    }
  }
}

// Core agentic loop — Gemini calls tools via functionCalls, we execute via MCP
async function runAgentLoop(chatConfig, history, userMessage, userId, maxTurns = 5) {
  const chat = getClient().chats.create({ ...chatConfig, history });
  let response = await withRetry(() => chat.sendMessage({ message: userMessage }));

  let finalReply = '';
  let turns = 0;

  while (turns < maxTurns) {
    turns++;

    const textReply = response.text || '';
    const functionCalls = response.functionCalls || [];

    if (textReply) finalReply = textReply;
    if (functionCalls.length === 0) break;

    // Execute all tool calls via MCP
    const toolResults = [];
    for (const fc of functionCalls) {
      const { name, args } = fc;
      console.log(`[MCP] Calling tool: ${name}`, args);
      try {
        const result = await mcp.executeGeminiTool(name, { ...args, userId });
        toolResults.push({
          functionResponse: {
            name,
            response: { result: JSON.stringify(result) },
          },
        });
      } catch (err) {
        console.error(`[MCP] Tool error for ${name}:`, err.message);
        toolResults.push({
          functionResponse: {
            name,
            response: { error: err.message },
          },
        });
      }
    }

    response = await withRetry(() => chat.sendMessage({ message: toolResults }));
  }

  return finalReply || 'I processed your request. How can I help you further?';
}

// Map conversation history to the format @google/genai expects
function mapHistory(conversationHistory) {
  return conversationHistory.slice(-10).map((e) => ({
    role: e.role === 'agent' ? 'model' : 'user',
    parts: [{ text: e.text }],
  }));
}

async function runIntake(profile, userMessage) {
  const chatConfig = {
    model: MODEL,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      tools: buildGeminiTools(),
      temperature: 0.7,
      maxOutputTokens: 1024,
    },
  };

  const contextMessage = `USER_ID: ${profile._id}\nCURRENT_PROFILE: ${JSON.stringify({
    agentMode: profile.agentMode,
    currentRole: profile.currentRole,
    targetRole: profile.targetRole,
    skills: profile.skills,
    intakeStep: profile.intakeStep,
  })}\n\nUser says: ${userMessage}`;

  try {
    const reply = await runAgentLoop(chatConfig, mapHistory(profile.conversationHistory), contextMessage, profile._id);
    return { reply, mongoUpdates: null, agentAction: 'NONE', uiHints: { showPatternAlert: false, highlightStaleApplications: [] } };
  } catch (err) {
    console.error('Agent loop error:', err.message);
    return runIntakeFallback(profile, userMessage);
  }
}

async function runIntakeFallback(profile, userMessage) {
  const result = await withRetry(() => getClient().models.generateContent({
    model: MODEL,
    contents: `${SYSTEM_PROMPT}\n\nCURRENT PROFILE: ${JSON.stringify({
      agentMode: profile.agentMode,
      currentRole: profile.currentRole,
      targetRole: profile.targetRole,
      skills: profile.skills,
      intakeStep: profile.intakeStep,
    })}\n\nUser: ${userMessage}\n\nRespond conversationally as RetrofitAI. Be direct and strategic.`,
    config: { temperature: 0.7, maxOutputTokens: 1024 },
  }));
  return { reply: result.text.trim(), mongoUpdates: null, agentAction: 'NONE', uiHints: { showPatternAlert: false, highlightStaleApplications: [] } };
}

async function runActiveSearch(profile, userMessage, applications = [], pattern = null) {
  const chatConfig = {
    model: MODEL,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      tools: buildGeminiTools(),
      temperature: 0.7,
      maxOutputTokens: 1024,
    },
  };

  const appSummary = {
    total: applications.length,
    applied: applications.filter((a) => a.status === 'APPLIED').length,
    noResponse: applications.filter((a) => a.status === 'NO_RESPONSE').length,
    phoneScreen: applications.filter((a) => a.status === 'PHONE_SCREEN').length,
    interview: applications.filter((a) => a.status === 'INTERVIEW').length,
    offer: applications.filter((a) => a.status === 'OFFER').length,
    rejected: applications.filter((a) => a.status === 'REJECTED').length,
    stale: applications.filter((a) => a.daysSinceApply > 7 && !['OFFER', 'REJECTED'].includes(a.status)).length,
  };

  const contextMessage = `USER_ID: ${profile._id}
AGENT_MODE: ${profile.agentMode}
PROFILE: ${JSON.stringify({
  currentRole: profile.currentRole,
  targetRole: profile.targetRole,
  targetIndustry: profile.targetIndustry,
  yearsExperience: profile.yearsExperience,
  skills: profile.skills,
  location: profile.location,
  urgency: profile.urgency,
})}
PIPELINE_SUMMARY: ${JSON.stringify(appSummary)}
REJECTION_PATTERN: ${pattern ? JSON.stringify({
  dominantPattern: pattern.dominantPattern,
  patternConfidence: pattern.patternConfidence,
  insight: pattern.insight,
  lastCalculated: pattern.lastCalculated,
}) : 'none yet'}

User says: ${userMessage}`;

  try {
    const reply = await runAgentLoop(chatConfig, mapHistory(profile.conversationHistory), contextMessage, profile._id);

    let agentAction = 'NONE';
    if (appSummary.rejected >= 3 && !pattern) {
      agentAction = 'TRIGGER_REJECTION_ANALYSIS';
    }

    return { reply, mongoUpdates: null, agentAction, uiHints: { showPatternAlert: !!pattern, highlightStaleApplications: [] } };
  } catch (err) {
    console.error('Active search agent loop error:', err.message);
    return runActiveSearchFallback(profile, userMessage);
  }
}

async function runActiveSearchFallback(profile, userMessage) {
  const result = await withRetry(() => getClient().models.generateContent({
    model: MODEL,
    contents: `${SYSTEM_PROMPT}\n\nPROFILE: ${JSON.stringify({
      agentMode: profile.agentMode,
      currentRole: profile.currentRole,
      targetRole: profile.targetRole,
      skills: profile.skills,
    })}\n\nUser: ${userMessage}\n\nRespond as RetrofitAI. Be direct and strategic.`,
    config: { temperature: 0.7, maxOutputTokens: 1024 },
  }));
  return { reply: result.text.trim(), mongoUpdates: null, agentAction: 'NONE', uiHints: { showPatternAlert: false, highlightStaleApplications: [] } };
}

const JOB_ANALYSIS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    jobTitle:            { type: 'STRING' },
    company:             { type: 'STRING' },
    matchScore:          { type: 'INTEGER' },
    strongMatches:       { type: 'ARRAY', items: { type: 'STRING' } },
    gaps:                { type: 'ARRAY', items: { type: 'STRING' } },
    missingKeywords:     { type: 'ARRAY', items: { type: 'STRING' } },
    verdict:             { type: 'STRING' },
    verdictReason:       { type: 'STRING' },
    reply:               { type: 'STRING' },
  },
  required: ['jobTitle', 'company', 'matchScore', 'strongMatches', 'gaps', 'missingKeywords', 'verdict', 'reply'],
};

async function analyzeJob(profile, jobDescription, inlineBio = '') {
  // Use inline bio if provided (direct from frontend), else fall back to saved profile
  const resumeSource = (inlineBio && inlineBio.trim().length > 30)
    ? inlineBio.trim()
    : (profile.resumeText && profile.resumeText.trim().length > 30 ? profile.resumeText.trim() : '');

  const hasResume = resumeSource.length > 30;
  const roleInfo    = profile.currentRole    || (hasResume ? '(extract from resume below)' : 'Not specified');
  const targetInfo  = profile.targetRole     || (hasResume ? '(extract from resume below)' : 'Not specified');
  const skillsInfo  = (profile.skills || []).join(', ') || (hasResume ? '(extract from resume below)' : 'Not specified');
  const expInfo     = profile.yearsExperience || (hasResume ? '(extract from resume below)' : 'Not specified');

  const prompt = `You are RetrofitAI's job analysis engine. Perform a precise, honest match analysis.

USER PROFILE:
- Current role: ${roleInfo}
- Target role: ${targetInfo}
- Skills: ${skillsInfo}
- Years experience: ${expInfo}
- Resume / background: ${hasResume ? resumeSource.slice(0, 1000) : 'Not provided'}

IMPORTANT: If resume/background is provided, extract skills and experience from it directly. A provided resume means the profile IS complete — do not apply low-score penalties.

JOB DESCRIPTION TO ANALYZE:
${jobDescription.slice(0, 2000)}

Scoring rules:
- 70-100 = APPLY_NOW: user meets most requirements, strong overlap
- 45-69 = APPLY_WITH_EDITS: user meets core requirements but has notable gaps
- 0-44 = SKIP: user lacks the fundamental requirements
- Only apply scores below 20 if resume/background is completely absent AND structured fields are all empty.
- verdict must be exactly one of: APPLY_NOW, APPLY_WITH_EDITS, SKIP
- All array fields must be arrays (never null).

Return ONLY a valid JSON object in this exact format — no markdown, no preamble, no trailing text:
{
  "jobTitle": "exact title from the job description",
  "company": "company name from the job description",
  "matchScore": 75,
  "strongMatches": ["matching skill or experience"],
  "gaps": ["gap or missing requirement"],
  "missingKeywords": ["keyword1", "keyword2"],
  "verdict": "APPLY_NOW",
  "verdictReason": "one sentence explaining the verdict",
  "reply": "2-3 sentences summarizing the analysis for the user"
}`;

  const result = await withRetry(() => getClient().models.generateContent({
    model: MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: { temperature: 0.3 },
  }));
  const parsed = parseGeminiResponse(result.text.trim());
  // Ensure arrays are never null/undefined
  parsed.strongMatches   = parsed.strongMatches   || [];
  parsed.gaps            = parsed.gaps            || [];
  parsed.missingKeywords = parsed.missingKeywords || [];
  parsed.postingAge      = parsed.postingAge      || null;
  return parsed;
}

async function generateCoverLetter(profile, jobAnalysis) {
  const prompt = `You are RetrofitAI's cover letter specialist. Write a personalized, strategic cover letter.

USER PROFILE:
- Current role: ${profile.currentRole || 'Not specified'}
- Target role: ${profile.targetRole || 'Not specified'}
- Skills: ${(profile.skills || []).join(', ') || 'Not specified'}
- Years experience: ${profile.yearsExperience || 0}
- Resume excerpt: ${profile.resumeText ? profile.resumeText.slice(0, 1000) : 'Not provided'}

JOB:
- Title: ${jobAnalysis.jobTitle} at ${jobAnalysis.company}
- Strong matches: ${(jobAnalysis.strongMatches || []).join(', ') || 'none'}
- Gaps to address: ${(jobAnalysis.gaps || []).join(', ') || 'none'}
- Job description excerpt: ${(jobAnalysis.jobDescriptionRaw || '').slice(0, 800)}

Write a 3-paragraph professional cover letter. Return a JSON object with exactly these three string fields:
- coverLetterText: the complete cover letter (use \\n for paragraph breaks)
- coverLetterStrategy: 1-2 sentences on the strategic angle
- reply: one sentence confirming generation for the chat UI`;

  const result = await withRetry(() => getClient().models.generateContent({
    model: MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: { temperature: 0.8 },
  }));
  return parseGeminiResponse(result.text.trim());
}

async function analyzeRejectionPattern(profile, applications) {
  const rejectedApps = applications.filter(
    (a) => a.status === 'REJECTED' || a.status === 'NO_RESPONSE'
  );
  const breakdown = {
    noResponse: rejectedApps.filter((a) => a.rejectionStage === 'NO_RESPONSE' || a.status === 'NO_RESPONSE').length,
    phoneScreen: rejectedApps.filter((a) => a.rejectionStage === 'PHONE_SCREEN').length,
    firstInterview: rejectedApps.filter((a) => a.rejectionStage === 'FIRST_INTERVIEW').length,
    finalRound: rejectedApps.filter((a) => a.rejectionStage === 'FINAL_ROUND').length,
  };

  const prompt = `You are RetrofitAI's Rejection Intelligence Engine. Analyze rejection data.

USER PROFILE:
- Target role: ${profile.targetRole}
- Skills: ${(profile.skills || []).join(', ')}

REJECTION DATA:
- Total applications: ${applications.length}
- Total rejections/no-responses: ${rejectedApps.length}
- Breakdown: ${JSON.stringify(breakdown)}
- Companies rejected from: ${rejectedApps.map((a) => a.company).join(', ')}

Return ONLY this JSON (no markdown):
{
  "dominantPattern": "PRE_INTERVIEW | POST_INTERVIEW | FINAL_ROUND | INSUFFICIENT_DATA",
  "patternConfidence": "LOW | MEDIUM | HIGH",
  "insight": "2-3 sentences of precise, actionable insight referencing actual data",
  "recommendedActions": ["Action 1", "Action 2", "Action 3"],
  "missingKeywordsAcrossRejections": ["keyword1", "keyword2", "keyword3"],
  "reply": "The conversational version of the insight (2-3 sentences, direct)"
}`;

  const result = await withRetry(() => getClient().models.generateContent({
    model: MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: { temperature: 0.3 },
  }));
  return parseGeminiResponse(result.text.trim());
}

async function generateProactiveBriefing(profile, staleApps, pattern, latestBriefing) {
  const staleList = staleApps.map((a) => `${a.company} (${a.daysSinceApply}d)`).join(', ');

  const prompt = `You are RetrofitAI. The user just returned to the app. Write a proactive status briefing — not a greeting, a strategic update. Be specific and direct.

DATA:
- Target role: ${profile.targetRole || 'not set yet'}
- Stale applications (7+ days, no response): ${staleList || 'none'}
- Pattern available: ${pattern ? pattern.dominantPattern : 'none yet'}
- Pattern insight: ${pattern ? pattern.insight : 'not available yet'}
- Momentum score: ${latestBriefing ? latestBriefing.momentumScore : 'not yet calculated'}

Write 2-4 sentences. Lead with the most urgent item. Reference actual application names if available. Be direct.`;

  const result = await withRetry(() => getClient().models.generateContent({
    model: MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: { temperature: 0.7 },
  }));

  return {
    reply: result.text.trim(),
    mongoUpdates: null,
    agentAction: 'NONE',
    uiHints: {
      showPatternAlert: !!(pattern && pattern.dominantPattern !== 'INSUFFICIENT_DATA'),
      highlightStaleApplications: staleApps.map((a) => String(a._id)),
    },
  };
}

async function generateWeeklyBriefingContent(profile, applications, pattern) {
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const weeklyApps = applications.filter((a) => new Date(a.appliedDate) >= oneWeekAgo);
  const responded = applications.filter((a) => !['APPLIED', 'NO_RESPONSE'].includes(a.status));
  const interviewed = applications.filter((a) => ['INTERVIEW', 'OFFER'].includes(a.status));

  const prompt = `You are RetrofitAI's weekly briefing generator. Compute a momentum score and write 3 priority actions.

USER DATA:
- Target role: ${profile.targetRole}
- Applications this week: ${weeklyApps.length}
- Total applications: ${applications.length}
- Responses received: ${responded.length}
- Interviews: ${interviewed.length}
- Dominant pattern: ${pattern ? pattern.dominantPattern : 'INSUFFICIENT_DATA'}

Return ONLY this JSON (no markdown):
{
  "momentumScore": 0-100,
  "momentumTrend": "UP | DOWN | STABLE",
  "bestPerformingCategory": "one phrase",
  "worstPerformingCategory": "one phrase",
  "priorityActions": [
    {"action": "specific action 1", "impact": "HIGH", "dueDate": null},
    {"action": "specific action 2", "impact": "HIGH", "dueDate": null},
    {"action": "specific action 3", "impact": "MEDIUM", "dueDate": null}
  ],
  "reply": "2 sentences summarizing the briefing"
}`;

  const result = await withRetry(() => getClient().models.generateContent({
    model: MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: { temperature: 0.5 },
  }));
  return parseGeminiResponse(result.text.trim());
}

async function draftFollowUpEmail(profile, application) {
  const prompt = `You are RetrofitAI. Draft a professional follow-up email.

Applicant: ${profile.currentRole} targeting ${profile.targetRole}
Applied to: ${application.role} at ${application.company}
Days since applying: ${application.daysSinceApply}

Return ONLY this JSON (no markdown):
{
  "subject": "Email subject line",
  "body": "The full email body — professional, brief (3 short paragraphs), genuine interest",
  "reply": "One sentence confirming the follow-up was drafted"
}`;

  const result = await withRetry(() => getClient().models.generateContent({
    model: MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: { temperature: 0.7 },
  }));
  return parseGeminiResponse(result.text.trim());
}

async function extractProfileFromResume(resumeText) {
  const prompt = `Analyze this resume or bio text and extract the candidate's career profile. Return ONLY valid JSON with NO markdown fences, NO extra text.

RESUME/BIO:
${resumeText.slice(0, 4000)}

Return exactly this JSON (use null for any field you cannot determine):
{
  "currentRole": "their current or most recent job title (e.g. Senior Software Engineer)",
  "targetRole": "the role they are likely targeting — infer from seniority and trajectory (e.g. Staff Engineer)",
  "targetIndustry": "choose one of: Fintech, Healthtech, SaaS, Edtech, Dev Tools, Crypto, Web3, E-commerce, Infrastructure, Enterprise, Gaming — or null",
  "yearsExperience": 5,
  "skills": ["up to 12 technical skills from the resume"]
}`;

  const result = await withRetry(() =>
    getClient().models.generateContent({
      model: MODEL,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { temperature: 0.1 },
    })
  );

  const parsed = parseGeminiResponse(result.text.trim());
  // parseGeminiResponse may return a fallback object if JSON fails — validate it has expected fields
  if (!parsed.currentRole && !parsed.targetRole && !parsed.skills) {
    throw new Error('Gemini did not return valid profile fields');
  }
  return parsed;
}

async function callAgentBuilder(message, sessionId) {
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
  const agentId = process.env.AGENT_BUILDER_ID;
  const endpoint = `https://${location}-dialogflow.googleapis.com/v3/projects/${project}/locations/${location}/agents/${agentId}/sessions/${sessionId}:detectIntent`;

  const client = await agentBuilderAuth.getClient();
  const token = await client.getAccessToken();

  const body = JSON.stringify({
    queryInput: {
      text: { text: message },
      languageCode: 'en',
    },
  });

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token.token}`,
      'Content-Type': 'application/json',
    },
    body,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Agent Builder API ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const messages = data.queryResult?.responseMessages || [];
  const replyText = messages.flatMap((m) => m.text?.text || []).join(' ').trim();

  return {
    reply: replyText || 'Agent Builder returned no text response.',
    queryResult: data.queryResult,
    responseId: data.responseId,
  };
}

// Escape literal newlines/tabs inside JSON string values so JSON.parse doesn't choke
// on multi-line cover letter text or similar multi-paragraph Gemini output.
function fixJsonStringNewlines(str) {
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (escaped) { out += ch; escaped = false; continue; }
    if (ch === '\\') { out += ch; escaped = true; continue; }
    if (ch === '"') { inString = !inString; out += ch; continue; }
    if (inString) {
      if (ch === '\n') { out += '\\n'; continue; }
      if (ch === '\r') { out += '\\r'; continue; }
      if (ch === '\t') { out += '\\t'; continue; }
    }
    out += ch;
  }
  return out;
}

function parseGeminiResponse(raw) {
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  // Attempt 1: direct parse
  try { return JSON.parse(cleaned); } catch(e1) {
    console.error('[parse] direct failed:', e1.message, '| cleaned[:80]:', JSON.stringify(cleaned.slice(0, 80)));
  }

  // Attempt 2: fix unescaped newlines inside strings then parse
  try { return JSON.parse(fixJsonStringNewlines(cleaned)); } catch(e2) {
    console.error('[parse] fix failed:', e2.message);
  }

  // Attempt 3: extract first JSON object (handles extra preamble text), then fix + parse
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch { /* next */ }
    try { return JSON.parse(fixJsonStringNewlines(match[0])); } catch { /* next */ }
  }

  return {
    reply: cleaned,
    mongoUpdates: null,
    agentAction: 'NONE',
    uiHints: { showPatternAlert: false, highlightStaleApplications: [] },
  };
}

// ─── ISO Week Helper ──────────────────────────────────────────────────────────

function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

// ─── Autonomous Pipeline ──────────────────────────────────────────────────────
// Runs on login for ACTIVE_SEARCH users. Streams events via emit(). Each step:
//   1. Read all applications
//   2. Draft follow-ups for stale apps
//   3. Run/refresh rejection pattern analysis
//   4. Generate weekly briefing if none for this week
//   5. Save audit run
async function runAutonomousPipeline(userId, profile, emit) {
  const crypto = require('crypto');
  const runId = `run_${Date.now()}`;
  const startedAt = new Date();

  emit({ type: 'agent_start', message: 'Reviewing your job search...' });

  // ── STEP 1: Read applications ────────────────────────────────────────────
  emit({ type: 'tool_call', op: 'FIND', collection: 'applications', detail: `userId: ${userId}` });
  const apps = await mongo.getApplicationsForUser(userId);
  emit({ type: 'tool_result', result: `${apps.length} application${apps.length !== 1 ? 's' : ''} found` });

  const staleApps = apps.filter(
    (a) => a.daysSinceApply > 7 && !['REJECTED', 'OFFER'].includes(a.status)
  );
  const rejections = apps.filter((a) => ['REJECTED', 'NO_RESPONSE'].includes(a.status));

  if (staleApps.length > 0) {
    emit({ type: 'step_start', message: `${staleApps.length} application${staleApps.length !== 1 ? 's' : ''} need${staleApps.length === 1 ? 's' : ''} follow-up` });
  }

  // ── STEP 2: Draft follow-ups ─────────────────────────────────────────────
  let draftsCreated = 0;
  if (staleApps.length > 0) {
    await mongo.clearOldFollowUpDrafts(userId);
    for (const app of staleApps.slice(0, 3)) {
      emit({ type: 'tool_call', op: 'GEMINI', collection: 'draft_followup', detail: app.company, company: app.company });
      try {
        const draft = await draftFollowUpEmail(profile, app);
        emit({ type: 'tool_call', op: 'INSERT', collection: 'agent_drafts', detail: `${app.company}` });
        await mongo.saveFollowUpDraft(userId, String(app._id), app.company, app.role, draft.subject || '', draft.body || '', runId);
        emit({ type: 'tool_result', result: `Draft saved — "${draft.subject || 'Follow-up'}"`, company: app.company });
        draftsCreated++;
      } catch (err) {
        emit({ type: 'tool_result', result: `Skipped ${app.company} (Gemini error)`, company: app.company });
      }
    }
    emit({ type: 'step_complete', message: `${draftsCreated} draft${draftsCreated !== 1 ? 's' : ''} ready in your inbox` });
  }

  // ── STEP 3: Rejection pattern ────────────────────────────────────────────
  let patternUpdated = false;
  let finalPattern = null;
  if (rejections.length >= 3) {
    emit({ type: 'tool_call', op: 'FIND', collection: 'rejection_patterns', detail: `userId: ${userId}` });
    const existingPattern = await mongo.getRejectionPattern(userId);
    finalPattern = existingPattern;
    const isStale =
      !existingPattern?.lastCalculated ||
      Date.now() - new Date(existingPattern.lastCalculated).getTime() > 24 * 60 * 60 * 1000;

    if (isStale) {
      emit({ type: 'step_start', message: `Analyzing ${rejections.length} rejection signals...` });
      emit({ type: 'tool_call', op: 'GEMINI', collection: 'analyze_patterns', detail: `${rejections.length} rejections` });
      try {
        const newPattern = await analyzeRejectionPattern(profile, apps);
        const patternId = `pattern_${userId}`;
        const patternDoc = {
          _id: patternId,
          userId,
          totalApplications: apps.length,
          totalRejections: rejections.length,
          rejectionBreakdown: {
            noResponse: rejections.filter((a) => a.status === 'NO_RESPONSE').length,
            phoneScreen: rejections.filter((a) => a.rejectionStage === 'PHONE_SCREEN').length,
            firstInterview: rejections.filter((a) => a.rejectionStage === 'FIRST_INTERVIEW').length,
            finalRound: rejections.filter((a) => a.rejectionStage === 'FINAL_ROUND').length,
          },
          dominantPattern: newPattern.dominantPattern || 'INSUFFICIENT_DATA',
          patternConfidence: newPattern.patternConfidence || 'LOW',
          insight: newPattern.insight || '',
          recommendedActions: newPattern.recommendedActions || [],
          missingKeywordsAcrossRejections: newPattern.missingKeywordsAcrossRejections || [],
          lastCalculated: new Date(),
        };
        emit({ type: 'tool_call', op: 'UPSERT', collection: 'rejection_patterns', detail: `pattern: ${patternDoc.dominantPattern}` });
        await mongo.saveRejectionPattern(patternDoc);
        finalPattern = patternDoc;
        patternUpdated = true;
        emit({ type: 'tool_result', result: `${patternDoc.dominantPattern} · ${patternDoc.patternConfidence} confidence` });
        emit({ type: 'step_complete', message: `Pattern updated: ${patternDoc.dominantPattern.replace(/_/g, ' ')}` });
      } catch (err) {
        emit({ type: 'tool_result', result: 'Pattern analysis failed (Gemini error)' });
      }
    } else {
      emit({ type: 'tool_result', result: `Pattern current: ${existingPattern.dominantPattern}` });
      finalPattern = existingPattern;
    }
  }

  // ── STEP 4: Weekly briefing ───────────────────────────────────────────────
  let briefingGenerated = false;
  let finalMomentumScore = null;
  let finalMomentumTrend = null;
  const currentWeek = getISOWeek(new Date());
  emit({ type: 'tool_call', op: 'FIND', collection: 'weekly_briefings', detail: `week ${currentWeek}` });
  const existingBriefing = await mongo.getLatestWeeklyBriefing(userId);

  if (!existingBriefing || existingBriefing.weekNumber !== currentWeek) {
    emit({ type: 'step_start', message: 'Generating weekly briefing...' });
    emit({ type: 'tool_call', op: 'GEMINI', collection: 'generate_briefing', detail: `${apps.length} apps` });
    try {
      const content = await generateWeeklyBriefingContent(profile, apps, finalPattern);
      const now = new Date();
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(now.getDate() - 7);
      const weeklyApps = apps.filter((a) => new Date(a.appliedDate) >= oneWeekAgo);
      const responded = apps.filter((a) => !['APPLIED', 'NO_RESPONSE'].includes(a.status));
      const interviewed = apps.filter((a) => ['INTERVIEW', 'OFFER'].includes(a.status));

      const briefingDoc = {
        _id: `brief_${userId}_week${currentWeek}`,
        userId,
        weekNumber: currentWeek,
        generatedAt: now,
        applicationsSentThisWeek: weeklyApps.length,
        responseRate: apps.length > 0 ? responded.length / apps.length : 0,
        interviewRate: apps.length > 0 ? interviewed.length / apps.length : 0,
        industryAvgResponseRate: 0.15,
        momentumScore: content.momentumScore || 0,
        momentumTrend: content.momentumTrend || 'STABLE',
        bestPerformingCategory: content.bestPerformingCategory || '',
        worstPerformingCategory: content.worstPerformingCategory || '',
        priorityActions: content.priorityActions || [],
        pdfGenerated: false,
        pdfPath: null,
      };
      emit({ type: 'tool_call', op: 'UPSERT', collection: 'weekly_briefings', detail: `momentum: ${briefingDoc.momentumScore}/100` });
      await mongo.saveWeeklyBriefing(briefingDoc);
      briefingGenerated = true;
      finalMomentumScore = briefingDoc.momentumScore;
      finalMomentumTrend = briefingDoc.momentumTrend;
      emit({ type: 'tool_result', result: `Momentum: ${briefingDoc.momentumScore}/100 (${briefingDoc.momentumTrend})` });
      emit({ type: 'step_complete', message: `Week ${currentWeek} briefing ready — ${briefingDoc.momentumScore}/100` });
    } catch (err) {
      emit({ type: 'tool_result', result: 'Briefing failed (Gemini error)' });
    }
  } else {
    finalMomentumScore = existingBriefing.momentumScore;
    finalMomentumTrend = existingBriefing.momentumTrend;
    emit({ type: 'tool_result', result: `Briefing current: ${existingBriefing.momentumScore}/100` });
  }

  // ── STEP 5: Save run log ──────────────────────────────────────────────────
  const completedAt = new Date();
  const runSummary = {
    appsScanned: apps.length,
    staleFound: staleApps.length,
    draftsCreated,
    patternUpdated,
    patternConfidence: finalPattern?.patternConfidence || null,
    dominantPattern: finalPattern?.dominantPattern || null,
    briefingGenerated,
    momentumScore: finalMomentumScore,
    momentumTrend: finalMomentumTrend,
  };
  await mongo.saveAgentRun({
    _id: runId,
    userId,
    startedAt,
    completedAt,
    durationMs: completedAt - startedAt,
    summary: runSummary,
  });

  emit({ type: 'pipeline_complete', summary: runSummary });
}

module.exports = {
  runIntake,
  runActiveSearch,
  analyzeJob,
  generateCoverLetter,
  analyzeRejectionPattern,
  generateProactiveBriefing,
  generateWeeklyBriefingContent,
  draftFollowUpEmail,
  callAgentBuilder,
  runAutonomousPipeline,
  getISOWeek,
  extractProfileFromResume,
};
