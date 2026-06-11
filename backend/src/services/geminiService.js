const { GoogleGenAI } = require('@google/genai');
const { GoogleAuth } = require('google-auth-library');
const mcp = require('./mcpService');
const mongo = require('./mongoService');
const { MIN_REJECTIONS_FOR_PATTERN } = require('../config');

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
// Disable thinking mode for all structured/analysis calls — 2.5-flash thinks by default,
// adding 30-60s latency that's completely unnecessary for JSON extraction tasks.
const NO_THINK = { thinkingConfig: { thinkingBudget: 0 } };

const SYSTEM_PROMPT = `You are RetrofitAI, an elite AI career strategist. You are NOT a form-filler, NOT a chatbot, and NOT a generic assistant. You are a ruthless, data-driven career coach who tells people exactly what they need to hear about their job search.

CORE RULES:
1. You have tools to read and write the user's data from MongoDB (read_career_profile, read_applications, read_job_analyses, read_rejection_pattern, read_weekly_briefing). Use them if context is missing.
2. NEVER ask for information already in FULL_MONGODB_CONTEXT or readable via tools.
3. Every response references the user's specific data, not generic advice.
4. You are direct, strategic, and concise. No fluff.
5. Legal disclaimer: RetrofitAI provides career guidance and organizational assistance. It is not a licensed career counselor or employment advisor.

INTAKE INTERVIEW SEQUENCE (ONLY when profile is truly empty — no currentRole, no targetRole, no skills, no resumeText):
If CURRENT_PROFILE already has role/skills/resume data, do NOT run intake. Answer the user's question using their MongoDB data via read_career_profile. Only ask for a specific missing field if the question requires it and that field is absent — say "I don't see X in your profile yet, please add it."

When profile IS empty, ask these questions ONE AT A TIME conversationally:
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
      ...NO_THINK,
      systemInstruction: SYSTEM_PROMPT,
      tools: buildGeminiTools(),
      temperature: 0.7,
      maxOutputTokens: 1024,
    },
  };

  const hasData = !!(profile.currentRole || profile.targetRole || profile.skills?.length || profile.resumeText?.length > 80);
  const contextMessage = `USER_ID: ${profile._id}\nCURRENT_PROFILE: ${JSON.stringify({
    agentMode: profile.agentMode,
    currentRole: profile.currentRole,
    targetRole: profile.targetRole,
    targetIndustry: profile.targetIndustry,
    yearsExperience: profile.yearsExperience,
    skills: profile.skills,
    resumeText: profile.resumeText ? `${profile.resumeText.slice(0, 500)}…` : '',
    intakeStep: profile.intakeStep,
  })}
${hasData ? '\nPROFILE_ALREADY_POPULATED: true — answer using this data; do NOT restart intake interview.\n' : ''}
User says: ${userMessage}`;

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
    config: { ...NO_THINK, temperature: 0.7, maxOutputTokens: 1024 },
  }));
  return { reply: result.text.trim(), mongoUpdates: null, agentAction: 'NONE', uiHints: { showPatternAlert: false, highlightStaleApplications: [] } };
}

function toPlainDoc(doc) {
  if (!doc) return null;
  return typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
}

function enrichApplicationsForChat(applications = []) {
  return applications.map((a) => {
    const plain = toPlainDoc(a) || {};
    const daysSinceApply = plain.appliedDate
      ? Math.floor((Date.now() - new Date(plain.appliedDate).getTime()) / (1000 * 60 * 60 * 24))
      : plain.daysSinceApply || 0;
    return {
      company: plain.company || '',
      role: plain.role || '',
      status: plain.status || 'APPLIED',
      appliedDate: plain.appliedDate || '',
      daysSinceApply,
      rejectionStage: plain.rejectionStage || null,
      followUpSent: !!plain.followUpSent,
      notes: plain.notes || '',
      jobAnalysisId: plain.jobAnalysisId || null,
    };
  });
}

function serializeJobForChat(job) {
  const j = toPlainDoc(job) || {};
  return {
    company: j.company || '',
    jobTitle: j.jobTitle || '',
    matchScore: j.matchScore || 0,
    verdict: j.verdict || '',
    strongMatches: j.strongMatches || [],
    gaps: j.gaps || [],
    missingKeywords: j.missingKeywords || [],
    coverLetterGenerated: !!j.coverLetterGenerated,
    postingAge: j.postingAge || null,
  };
}

function serializePatternForChat(pattern) {
  const p = toPlainDoc(pattern);
  if (!p || p.dominantPattern === 'INSUFFICIENT_DATA') return null;
  return {
    dominantPattern: p.dominantPattern,
    patternConfidence: p.patternConfidence,
    insight: p.insight || '',
    recommendedActions: p.recommendedActions || [],
    missingKeywordsAcrossRejections: p.missingKeywordsAcrossRejections || [],
    totalRejections: p.totalRejections,
    totalApplications: p.totalApplications,
    rejectionBreakdown: p.rejectionBreakdown || {},
  };
}

function serializeBriefingForChat(briefing) {
  const b = toPlainDoc(briefing);
  if (!b) return null;
  return {
    weekNumber: b.weekNumber,
    momentumScore: b.momentumScore,
    momentumTrend: b.momentumTrend,
    responseRate: b.responseRate,
    interviewRate: b.interviewRate,
    applicationsSentThisWeek: b.applicationsSentThisWeek,
    bestPerformingCategory: b.bestPerformingCategory,
    worstPerformingCategory: b.worstPerformingCategory,
    priorityActions: (b.priorityActions || []).slice(0, 5),
  };
}

function buildActiveSearchContext(profile, applications, pattern, jobAnalyses, briefing) {
  const apps = enrichApplicationsForChat(applications);
  const jobs = [...(jobAnalyses || [])]
    .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0))
    .map(serializeJobForChat);

  const resume = profile.resumeText ? String(profile.resumeText) : '';
  const resumeSnippet = resume.length > 1200 ? `${resume.slice(0, 1200)}…` : resume;

  return {
    userId: profile._id,
    agentMode: profile.agentMode,
    careerProfile: {
      currentRole: profile.currentRole || '',
      targetRole: profile.targetRole || '',
      targetIndustry: profile.targetIndustry || '',
      yearsExperience: profile.yearsExperience || 0,
      skills: profile.skills || [],
      salaryMin: profile.salaryMin,
      salaryMax: profile.salaryMax,
      location: profile.location || '',
      urgency: profile.urgency || '',
      resumeSnippet,
    },
    pipelineApplications: apps,
    pipelineSummary: {
      total: apps.length,
      applied: apps.filter((a) => a.status === 'APPLIED').length,
      noResponse: apps.filter((a) => a.status === 'NO_RESPONSE').length,
      phoneScreen: apps.filter((a) => a.status === 'PHONE_SCREEN').length,
      interview: apps.filter((a) => a.status === 'INTERVIEW').length,
      offer: apps.filter((a) => a.status === 'OFFER').length,
      rejected: apps.filter((a) => a.status === 'REJECTED').length,
      stale: apps.filter((a) => a.daysSinceApply > 7 && !['OFFER', 'REJECTED'].includes(a.status)).length,
    },
    jobAnalyses: jobs,
    rejectionPattern: serializePatternForChat(pattern),
    weeklyBriefing: serializeBriefingForChat(briefing),
  };
}

function buildActiveSearchContextMessage(context, userMessage) {
  return `USER_ID: ${context.userId}
AGENT_MODE: ${context.agentMode}

FULL_MONGODB_CONTEXT (use this data — do not ask the user to repeat it):
${JSON.stringify({
  careerProfile: context.careerProfile,
  pipelineSummary: context.pipelineSummary,
  pipelineApplications: context.pipelineApplications,
  jobAnalyses: context.jobAnalyses,
  rejectionPattern: context.rejectionPattern,
  weeklyBriefing: context.weeklyBriefing,
})}

ANSWER_RULES:
1. Answer ONLY from FULL_MONGODB_CONTEXT above — cite company names, match scores, statuses, gaps, and pattern insights.
2. Compare jobs when asked; reference application status (APPLIED, REJECTED, etc.) and days since apply.
3. If rejectionPattern exists, use it for "why am I failing" questions.
4. If weeklyBriefing exists, cite momentumScore and priorityActions when relevant.
5. NEVER ask for role, skills, resume, or job list if those fields are populated above.
6. Be direct, strategic, 2-6 sentences unless the user asks for a detailed breakdown.

User question: ${userMessage}`;
}

async function runActiveSearch(profile, userMessage, applications = [], pattern = null, jobAnalyses = [], briefing = null) {
  const chatConfig = {
    model: MODEL,
    config: {
      ...NO_THINK,
      systemInstruction: SYSTEM_PROMPT,
      tools: buildGeminiTools(),
      temperature: 0.55,
      maxOutputTokens: 1536,
    },
  };

  const context = buildActiveSearchContext(profile, applications, pattern, jobAnalyses, briefing);
  const contextMessage = buildActiveSearchContextMessage(context, userMessage);
  const hasData = context.jobAnalyses.length > 0
    || context.pipelineApplications.length > 0
    || context.careerProfile.skills?.length
    || context.careerProfile.currentRole
    || context.careerProfile.targetRole
    || context.careerProfile.resumeSnippet;

  try {
    let reply = '';
    if (hasData) {
      try {
        reply = await runAgentLoop(
          chatConfig,
          mapHistory(profile.conversationHistory || []),
          contextMessage,
          profile._id,
        );
      } catch (loopErr) {
        console.warn('[runActiveSearch] agent loop failed, using direct:', loopErr.message);
      }
    }
    if (!reply?.trim()) {
      reply = await runActiveSearchDirect(contextMessage, userMessage);
    }

    let agentAction = 'NONE';
    if (context.pipelineSummary.rejected >= MIN_REJECTIONS_FOR_PATTERN && !context.rejectionPattern) {
      agentAction = 'TRIGGER_REJECTION_ANALYSIS';
    }

    const staleIds = context.pipelineApplications
      .filter((a) => a.daysSinceApply > 7 && !['OFFER', 'REJECTED'].includes(a.status))
      .map((a) => a.company);

    return {
      reply: reply.trim(),
      mongoUpdates: null,
      agentAction,
      uiHints: { showPatternAlert: !!context.rejectionPattern, highlightStaleApplications: staleIds },
    };
  } catch (err) {
    console.error('Active search error:', err.message);
    return runActiveSearchFallback(profile, userMessage, jobAnalyses, applications, pattern, briefing);
  }
}

async function runActiveSearchDirect(contextBlock, userMessage) {
  const result = await withRetry(() => getClient().models.generateContent({
    model: MODEL,
    contents: `${SYSTEM_PROMPT}\n\n${contextBlock}\n\nRespond as RetrofitAI. Use specific data from FULL_MONGODB_CONTEXT — company names, scores, statuses, gaps. Never ask for info already in context.`,
    config: { ...NO_THINK, temperature: 0.5, maxOutputTokens: 1536 },
  }));
  return result.text.trim();
}

async function runActiveSearchFallback(profile, userMessage, jobAnalyses = [], applications = [], pattern = null, briefing = null) {
  const context = buildActiveSearchContext(profile, applications, pattern, jobAnalyses, briefing);
  const contextMessage = buildActiveSearchContextMessage(context, userMessage);
  const result = await withRetry(() => getClient().models.generateContent({
    model: MODEL,
    contents: `${SYSTEM_PROMPT}\n\n${contextMessage}\n\nRespond as RetrofitAI using FULL_MONGODB_CONTEXT. Be direct and strategic.`,
    config: { ...NO_THINK, temperature: 0.6, maxOutputTokens: 1536 },
  }));
  return {
    reply: result.text.trim(),
    mongoUpdates: null,
    agentAction: 'NONE',
    uiHints: { showPatternAlert: false, highlightStaleApplications: [] },
  };
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
    config: {
      ...NO_THINK,
      temperature: 0.3,
      responseMimeType: 'application/json',
      responseSchema: JOB_ANALYSIS_SCHEMA,
    },
  }));
  const parsed = parseGeminiResponse(result.text.trim());
  if (parsed.matchScore === undefined || parsed.matchScore === null) {
    throw new Error('[analyzeJob] Gemini returned incomplete analysis (missing matchScore)');
  }
  // Ensure arrays are never null/undefined
  parsed.strongMatches   = parsed.strongMatches   || [];
  parsed.gaps            = parsed.gaps            || [];
  parsed.missingKeywords = parsed.missingKeywords || [];
  parsed.postingAge      = parsed.postingAge      || null;
  parsed.matchScore      = Math.min(100, Math.max(0, Number(parsed.matchScore) || 0));
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
    config: { ...NO_THINK, temperature: 0.8 },
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
    config: { ...NO_THINK, temperature: 0.3 },
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
    config: { ...NO_THINK, temperature: 0.7 },
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
    config: { ...NO_THINK, temperature: 0.5 },
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
    config: { ...NO_THINK, temperature: 0.7 },
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
      config: { ...NO_THINK, temperature: 0.1 },
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
function serializeDoc(doc) {
  const out = { ...doc };
  for (const key of Object.keys(out)) {
    if (out[key] instanceof Date) out[key] = out[key].toISOString();
  }
  return out;
}

async function getPendingAgentDrafts(userId, type = null) {
  const filter = { userId, status: 'pending' };
  if (type) filter.type = type;
  try {
    const mcpDrafts = await mcp.find('agent_drafts', filter);
    if (Array.isArray(mcpDrafts) && mcpDrafts.length) return mcpDrafts;
  } catch (err) {
    console.warn('[getPendingAgentDrafts] MCP find failed:', err.message);
  }
  return mongo.getAgentDrafts(userId, 'pending');
}

function appDaysSinceApply(app) {
  if (app.appliedDate) {
    return Math.floor((Date.now() - new Date(app.appliedDate).getTime()) / (1000 * 60 * 60 * 24));
  }
  return app.daysSinceApply || 0;
}

function hasFollowUpDraftForApp(pendingDrafts, app) {
  const appId = String(app._id || '');
  const company = (app.company || '').toLowerCase().trim();
  return pendingDrafts.some((d) => {
    if (d.type !== 'followup') return false;
    if (appId && d.applicationId && String(d.applicationId) === appId) return true;
    return company && (d.company || '').toLowerCase().trim() === company;
  });
}

async function getLatestBriefingViaMcp(userId) {
  const briefings = await mcp.find('weekly_briefings', { userId });
  const list = Array.isArray(briefings) ? briefings : [];
  if (!list.length) return null;
  return list.sort((a, b) => (b.weekNumber || 0) - (a.weekNumber || 0))[0];
}

async function runAutonomousPipeline(userId, profile, emit) {
  const crypto = require('crypto');
  const runId = `run_${Date.now()}`;
  const startedAt = new Date();
  profile = await mongo.getProfileForAgent(userId);

  emit({ type: 'agent_start', message: 'Reviewing your job search...' });

  // ── STEP 1: Read applications (MCP) ───────────────────────────────────────
  emit({ type: 'tool_call', op: 'FIND', collection: 'applications', detail: `userId: ${userId}` });
  const apps = await mongo.getApplicationsForAgent(userId);
  emit({ type: 'tool_result', result: `${apps.length} application${apps.length !== 1 ? 's' : ''} found` });

  const staleApps = apps.filter(
    (a) => appDaysSinceApply(a) > 7 && !['REJECTED', 'OFFER'].includes(a.status) && !a.followUpSent
  );
  const rejections = apps.filter((a) => ['REJECTED', 'NO_RESPONSE'].includes(a.status));
  const pendingDrafts = await getPendingAgentDrafts(userId);

  if (staleApps.length > 0) {
    emit({ type: 'step_start', message: `${staleApps.length} application${staleApps.length !== 1 ? 's' : ''} need${staleApps.length === 1 ? 's' : ''} follow-up` });
  }

  // ── STEP 2: Draft follow-ups (one pending draft per application max) ─────
  let draftsCreated = 0;
  if (staleApps.length > 0) {
    for (const app of staleApps.slice(0, 3)) {
      if (hasFollowUpDraftForApp(pendingDrafts, app)) {
        emit({ type: 'tool_result', result: `Skipped ${app.company} — draft already pending`, company: app.company });
        continue;
      }
      emit({ type: 'tool_call', op: 'GEMINI', collection: 'draft_followup', detail: app.company, company: app.company });
      try {
        const draft = await draftFollowUpEmail(profile, app);
        const draftId = `draft_${crypto.randomBytes(6).toString('hex')}`;
        const draftDoc = {
          _id: draftId,
          userId,
          type: 'followup',
          applicationId: String(app._id),
          company: app.company || '',
          role: app.role || '',
          subject: draft.subject || 'Follow-up',
          body: draft.body || '',
          payload: null,
          status: 'pending',
          runId,
          createdAt: new Date().toISOString(),
        };
        emit({ type: 'tool_call', op: 'INSERT', collection: 'agent_drafts', detail: `${app.company}` });
        await mcp.insertOne('agent_drafts', draftDoc);
        await mongo.saveAgentDraft(draftDoc);
        pendingDrafts.push(draftDoc);
        emit({ type: 'tool_result', result: `Draft saved — "${draftDoc.subject}"`, company: app.company });
        draftsCreated++;
      } catch (err) {
        emit({ type: 'tool_result', result: `Skipped ${app.company} (Gemini error)`, company: app.company });
      }
    }
    if (draftsCreated > 0) {
      emit({ type: 'step_complete', message: `${draftsCreated} draft${draftsCreated !== 1 ? 's' : ''} ready for review` });
    }
  }

  // ── STEP 3: Rejection pattern → pending draft (MCP) ─────────────────────
  let patternUpdated = false;
  let finalPattern = null;
  if (rejections.length >= MIN_REJECTIONS_FOR_PATTERN) {
    emit({ type: 'tool_call', op: 'FIND', collection: 'rejection_patterns', detail: `userId: ${userId}` });
    const existingPattern = await mcp.findOne('rejection_patterns', { userId });
    finalPattern = existingPattern;
    const isStale =
      !existingPattern?.lastCalculated ||
      Date.now() - new Date(existingPattern.lastCalculated).getTime() > 24 * 60 * 60 * 1000;

    const hasPendingPatternDraft = pendingDrafts.some((d) => d.type === 'pattern');
    if (isStale && !hasPendingPatternDraft) {
      emit({ type: 'step_start', message: `Analyzing ${rejections.length} rejection signals...` });
      emit({ type: 'tool_call', op: 'GEMINI', collection: 'analyze_patterns', detail: `${rejections.length} rejections` });
      try {
        const newPattern = await analyzeRejectionPattern(profile, apps);
        const patternDoc = serializeDoc({
          _id: `pattern_${userId}`,
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
        });
        const patternDraft = {
          _id: `draft_pattern_${userId}_${runId}`,
          userId,
          type: 'pattern',
          company: 'Rejection Analysis',
          role: patternDoc.dominantPattern,
          subject: `Pattern detected: ${String(patternDoc.dominantPattern).replace(/_/g, ' ')}`,
          body: [
            patternDoc.insight,
            '',
            'Recommended actions:',
            ...(patternDoc.recommendedActions || []).map((a) => `• ${a}`),
          ].filter(Boolean).join('\n'),
          payload: patternDoc,
          status: 'pending',
          runId,
          createdAt: new Date().toISOString(),
        };
        emit({ type: 'tool_call', op: 'INSERT', collection: 'agent_drafts', detail: 'pattern draft (pending approval)' });
        await mcp.insertOne('agent_drafts', patternDraft);
        await mongo.saveAgentDraft(patternDraft);
        pendingDrafts.push(patternDraft);
        finalPattern = patternDoc;
        patternUpdated = true;
        draftsCreated++;
        emit({ type: 'tool_result', result: `${patternDoc.dominantPattern} · ${patternDoc.patternConfidence} confidence (awaiting approval)` });
        emit({ type: 'step_complete', message: `Pattern draft ready — approve to save` });
      } catch (err) {
        emit({ type: 'tool_result', result: 'Pattern analysis failed (Gemini error)' });
      }
    } else {
      emit({ type: 'tool_result', result: `Pattern current: ${existingPattern.dominantPattern}` });
      finalPattern = existingPattern;
    }
  }

  // ── STEP 4: Weekly briefing → pending draft (MCP) ───────────────────────
  let briefingGenerated = false;
  let finalMomentumScore = null;
  let finalMomentumTrend = null;
  const currentWeek = getISOWeek(new Date());
  emit({ type: 'tool_call', op: 'FIND', collection: 'weekly_briefings', detail: `week ${currentWeek}` });
  const existingBriefing = await getLatestBriefingViaMcp(userId);

  const briefingDraftId = `draft_briefing_${userId}_week${currentWeek}`;
  const hasPendingBriefingDraft = pendingDrafts.some(
    (d) => d.type === 'briefing' && (d._id === briefingDraftId || d.role === `Week ${currentWeek}`),
  );
  if ((!existingBriefing || existingBriefing.weekNumber !== currentWeek) && !hasPendingBriefingDraft) {
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

      const briefingDoc = serializeDoc({
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
      });
      const briefingDraft = {
        _id: briefingDraftId,
        userId,
        type: 'briefing',
        company: 'Weekly Briefing',
        role: `Week ${currentWeek}`,
        subject: `Week ${currentWeek} briefing — momentum ${briefingDoc.momentumScore}/100`,
        body: [
          `Trend: ${briefingDoc.momentumTrend}`,
          `Applications this week: ${briefingDoc.applicationsSentThisWeek}`,
          '',
          'Priority actions:',
          ...(briefingDoc.priorityActions || []).map((a) => `• ${a.action || a}`),
        ].filter(Boolean).join('\n'),
        payload: briefingDoc,
        status: 'pending',
        runId,
        createdAt: new Date().toISOString(),
      };
      emit({ type: 'tool_call', op: 'INSERT', collection: 'agent_drafts', detail: 'briefing draft (pending approval)' });
      await mcp.insertOne('agent_drafts', briefingDraft);
      await mongo.saveAgentDraft(briefingDraft);
      briefingGenerated = true;
      draftsCreated++;
      finalMomentumScore = briefingDoc.momentumScore;
      finalMomentumTrend = briefingDoc.momentumTrend;
      emit({ type: 'tool_result', result: `Momentum: ${briefingDoc.momentumScore}/100 (${briefingDoc.momentumTrend}) — awaiting approval` });
      emit({ type: 'step_complete', message: `Week ${currentWeek} briefing draft ready` });
    } catch (err) {
      emit({ type: 'tool_result', result: 'Briefing failed (Gemini error)' });
    }
  } else {
    finalMomentumScore = existingBriefing.momentumScore;
    finalMomentumTrend = existingBriefing.momentumTrend;
    emit({ type: 'tool_result', result: `Briefing current: ${existingBriefing.momentumScore}/100` });
  }

  // ── STEP 5: Save run log (MCP) ────────────────────────────────────────────
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
  emit({ type: 'tool_call', op: 'INSERT', collection: 'agent_runs', detail: runId });
  const runDoc = serializeDoc({
    _id: runId,
    userId,
    startedAt,
    completedAt,
    durationMs: completedAt - startedAt,
    summary: runSummary,
  });
  await mcp.insertOne('agent_runs', runDoc);
  await mongo.saveAgentRun(runDoc).catch(() => {});

  emit({ type: 'pipeline_complete', summary: runSummary });
}

// ─── Mission: plan + execute a user-defined multi-step goal ──────────────────

const MISSION_STEP_DEFAULTS = {
  read_profile: { title: 'Load career profile', description: 'Read profile from MongoDB' },
  find_pattern: { title: 'Analyze rejection patterns', description: 'Find why applications fail' },
  find_gaps: { title: 'Identify skill gaps', description: 'Compare profile vs job requirements' },
  rank_matches: { title: 'Rank job matches', description: 'Score and prioritize analyzed roles' },
  generate_briefing: { title: 'Generate weekly briefing', description: 'Build momentum report' },
  draft_followup: { title: 'Draft follow-up email', description: 'Write follow-up for stale apps' },
  generate_cover_letter: { title: 'Generate cover letter', description: 'Write cover letter for top match' },
};

function getEligibleJobs(analysisList) {
  return [...(analysisList || [])]
    .filter((a) => ['APPLY_NOW', 'APPLY_WITH_EDITS'].includes(a.verdict))
    .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
}

/** Aggregate skill data across all job analyses for radar chart (MCP docs may omit arrays) */
function buildSkillGapChartData(profile, analysisList, topKeywords = []) {
  if (!analysisList?.length) return null;

  const ranked = [...analysisList].sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
  const anchor = ranked[0];
  const strongSet = new Set(profile.skills || []);
  const gapSet = new Set();

  for (const analysis of analysisList) {
    for (const m of (analysis.strongMatches || [])) if (m) strongSet.add(m);
    for (const g of (analysis.gaps || [])) if (g) gapSet.add(g);
    for (const kw of (analysis.missingKeywords || [])) if (kw) gapSet.add(kw);
  }
  for (const kw of topKeywords) if (kw.keyword) gapSet.add(kw.keyword);

  const strongMatches = [...strongSet].slice(0, 8);
  const gaps = [...gapSet].slice(0, 8);

  return {
    profileSkills: profile.skills || [],
    strongMatches: strongMatches.length ? strongMatches : (anchor.strongMatches || []),
    gaps: gaps.length ? gaps : (anchor.gaps || []),
    company: anchor.company || '',
    jobTitle: anchor.jobTitle || '',
    matchScore: anchor.matchScore || 0,
  };
}

function pickJobByGoal(goal, analysisList) {
  const eligible = getEligibleJobs(analysisList);
  if (!eligible.length) return null;
  const g = goal.toLowerCase();
  for (const job of eligible) {
    const company = (job.company || '').toLowerCase().trim();
    if (company && g.includes(company)) return job;
  }
  return eligible.length === 1 ? eligible[0] : null;
}

/** Keep missions focused — quick goals get one relevant step, not unrelated extras */
function filterStepsForGoal(goal, steps) {
  const g = goal.toLowerCase();
  const pick = (id) => {
    const found = steps.find((s) => s.id === id);
    const defaults = MISSION_STEP_DEFAULTS[id] || { title: id, description: '' };
    return found || { id, ...defaults };
  };

  if (/reject|pattern|why/.test(g)) return [pick('find_pattern')];
  if (/skill|gap/.test(g)) return [pick('find_gaps')];
  if (/rank|best job|compare|prioritize/.test(g)) return [pick('rank_matches')];
  if (/briefing|weekly|strategy|momentum/.test(g)) return [pick('generate_briefing')];
  if (/cover|letter/.test(g) || (/prepare/.test(g) && /application/.test(g))) {
    return [pick('generate_cover_letter')];
  }
  if (/follow/.test(g) || /stale/.test(g)) return [pick('draft_followup')];

  const filtered = steps.filter((s) => s.id !== 'read_profile');
  return filtered.length > 0 ? filtered.slice(0, 4) : steps.slice(0, 4);
}

async function planAndExecuteMission(userId, profile, goal, emit) {
  const crypto = require('crypto');
  profile = await mongo.getProfileForAgent(userId);

  // Ask Gemini to create a structured execution plan
  emit({ type: 'tool_call', op: 'GEMINI', collection: 'plan_mission', detail: goal.slice(0, 60), ts: Date.now() });

  const planPrompt = `You are RetrofitAI's Mission Planner. Given a user's career goal, create a concise execution plan.

USER PROFILE:
- Current role: ${profile.currentRole || 'not set'}
- Target role: ${profile.targetRole || 'not set'}
- Skills: ${(profile.skills || []).slice(0, 8).join(', ') || 'none yet'}

USER GOAL: "${goal}"

Create a plan with 1-3 sequential steps. Use ONLY steps required by the goal — no unrelated extras.
Each step "id" must be one of:
- "read_profile" — Read the user's career profile from MongoDB
- "find_pattern" — Analyze rejection patterns across applications
- "find_gaps" — Identify skill gaps vs job requirements
- "rank_matches" — Rank analyzed jobs by match score and recommend priorities
- "generate_briefing" — Generate a weekly momentum briefing
- "draft_followup" — Draft a follow-up email for a stale application
- "generate_cover_letter" — Generate a cover letter for the best matching job

Return ONLY this JSON (no markdown):
{
  "missionTitle": "Short descriptive title (5-7 words)",
  "steps": [
    {"id": "step_id_here", "title": "Step title (5-8 words)", "description": "One sentence what this step does"}
  ]
}`;

  const planResult = await withRetry(() => getClient().models.generateContent({
    model: MODEL,
    contents: [{ role: 'user', parts: [{ text: planPrompt }] }],
    config: { ...NO_THINK, temperature: 0.3 },
  }));

  const plan = parseGeminiResponse(planResult.text.trim());
  const rawSteps = Array.isArray(plan.steps) ? plan.steps.slice(0, 5) : [];
  const steps = filterStepsForGoal(goal, rawSteps);

  emit({
    type: 'plan_ready',
    message: plan.missionTitle || 'Mission ready',
    missionTitle: plan.missionTitle,
    steps: steps.map((s) => ({ id: s.id, title: s.title, description: s.description })),
    ts: Date.now(),
  });

  // Load data needed across steps
  emit({ type: 'tool_call', op: 'FIND', collection: 'applications', detail: `userId: ${userId}`, ts: Date.now() });
  const apps = await mongo.getApplicationsForAgent(userId);
  emit({ type: 'tool_result', result: `${apps.length} application${apps.length !== 1 ? 's' : ''} loaded`, ts: Date.now() });

  emit({ type: 'tool_call', op: 'FIND', collection: 'rejection_patterns', detail: `userId: ${userId}`, ts: Date.now() });
  const pattern = await mcp.findOne('rejection_patterns', { userId });
  emit({ type: 'tool_result', result: pattern ? `Pattern: ${pattern.dominantPattern}` : 'No pattern yet', ts: Date.now() });

  const stepResults = {};

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    emit({ type: 'step_start', message: step.title, stepIndex: i, stepId: step.id, ts: Date.now() });

    try {
      switch (step.id) {
        case 'read_profile': {
          profile = await mongo.getProfileForAgent(userId);
          emit({ type: 'tool_call', op: 'FIND', collection: 'career_profiles', detail: `userId: ${userId}`, ts: Date.now() });
          emit({ type: 'tool_result', result: `Profile loaded: ${profile.targetRole || 'role not set'}, ${(profile.skills || []).length} skills`, ts: Date.now() });
          emit({
            type: 'step_complete',
            message: `Profile loaded — ${(profile.skills || []).length} skills, targeting ${profile.targetRole || 'role not set'}`,
            stepIndex: i, stepId: step.id,
            result: { type: 'profile_summary', targetRole: profile.targetRole, skillCount: (profile.skills || []).length, skills: (profile.skills || []).slice(0, 10) },
            ts: Date.now(),
          });
          break;
        }

        case 'find_pattern': {
          const freshApps = await mongo.getApplicationsForAgent(userId);
          const rejections = freshApps.filter((a) => ['REJECTED', 'NO_RESPONSE'].includes(a.status));
          if (rejections.length >= MIN_REJECTIONS_FOR_PATTERN) {
            emit({ type: 'tool_call', op: 'GEMINI', collection: 'analyze_patterns', detail: `${rejections.length} rejections`, ts: Date.now() });
            const patternResult = await analyzeRejectionPattern(profile, freshApps);
            stepResults.pattern = patternResult;
            const breakdown = {
              noResponse: rejections.filter((a) => a.status === 'NO_RESPONSE').length,
              phoneScreen: rejections.filter((a) => a.rejectionStage === 'PHONE_SCREEN').length,
              firstInterview: rejections.filter((a) => a.rejectionStage === 'FIRST_INTERVIEW').length,
              finalRound: rejections.filter((a) => a.rejectionStage === 'FINAL_ROUND').length,
            };
            emit({ type: 'tool_result', result: `Pattern: ${patternResult.dominantPattern} (${patternResult.patternConfidence})`, ts: Date.now() });
            emit({
              type: 'step_complete',
              message: patternResult.reply || `Pattern: ${patternResult.dominantPattern}`,
              stepIndex: i, stepId: step.id,
              result: {
                type: 'pattern_analysis',
                dominantPattern: patternResult.dominantPattern,
                patternConfidence: patternResult.patternConfidence,
                insight: patternResult.insight,
                recommendedActions: patternResult.recommendedActions,
                breakdown,
                totalRejections: rejections.length,
                totalApplications: freshApps.length,
              },
              ts: Date.now(),
            });
          } else {
            emit({ type: 'tool_result', result: `Only ${rejections.length} rejection${rejections.length !== 1 ? 's' : ''} — need at least ${MIN_REJECTIONS_FOR_PATTERN}`, ts: Date.now() });
            emit({ type: 'step_complete', message: `Need more data (${rejections.length} rejection${rejections.length !== 1 ? 's' : ''} so far — keep applying!)`, stepIndex: i, stepId: step.id, result: { type: 'insufficient_data' }, ts: Date.now() });
          }
          break;
        }

        case 'rank_matches': {
          emit({ type: 'tool_call', op: 'FIND', collection: 'job_analyses', detail: `userId: ${userId}`, ts: Date.now() });
          const analysisList = await mongo.getJobAnalysesForAgent(userId);
          emit({ type: 'tool_result', result: `${analysisList.length} job analyses found`, ts: Date.now() });

          const ranked = [...analysisList]
            .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0))
            .slice(0, 8)
            .map((j) => ({
              company: j.company || 'Unknown',
              jobTitle: j.jobTitle || 'Role',
              matchScore: j.matchScore || 0,
              verdict: j.verdict || 'SKIP',
              topGap: (j.gaps || [])[0] || null,
            }));

          const best = ranked[0];
          emit({
            type: 'step_complete',
            message: ranked.length === 0
              ? 'No job analyses yet — analyze job descriptions first to rank your matches.'
              : best
              ? `Top priority: ${best.company} (${best.matchScore}/100) — ${ranked.length} role${ranked.length !== 1 ? 's' : ''} ranked`
              : 'No ranked matches found.',
            stepIndex: i, stepId: step.id,
            result: ranked.length > 0
              ? { type: 'job_rankings', jobs: ranked, targetRole: profile.targetRole || '' }
              : { type: 'no_jobs' },
            ts: Date.now(),
          });
          break;
        }

        case 'find_gaps': {
          emit({ type: 'tool_call', op: 'FIND', collection: 'job_analyses', detail: `userId: ${userId}`, ts: Date.now() });
          const analysisList = await mongo.getJobAnalysesForAgent(userId);
          emit({ type: 'tool_result', result: `${analysisList.length} job analyses found`, ts: Date.now() });

          const keywordCounts = {};
          const relevant = analysisList.filter((a) => ['APPLY_NOW', 'APPLY_WITH_EDITS'].includes(a.verdict));
          for (const analysis of analysisList) {
            for (const kw of (analysis.missingKeywords || [])) {
              keywordCounts[kw] = (keywordCounts[kw] || 0) + 1;
            }
            for (const g of (analysis.gaps || [])) {
              keywordCounts[g] = (keywordCounts[g] || 0) + 1;
            }
          }
          const topKeywords = Object.entries(keywordCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([keyword, count]) => ({ keyword, count }));

          stepResults.gaps = topKeywords;
          const chartData = buildSkillGapChartData(profile, analysisList, topKeywords);

          emit({
            type: 'step_complete',
            message: analysisList.length === 0
              ? 'No job analyses yet — analyze a job description first to see skill gaps.'
              : topKeywords.length > 0
              ? `Found ${topKeywords.length} skill gaps across ${relevant.length || analysisList.length} jobs — top missing: ${topKeywords.slice(0, 3).map((k) => k.keyword).join(', ')}`
              : 'No significant skill gaps — your profile is well-matched!',
            stepIndex: i, stepId: step.id,
            result: {
              type: 'skill_gaps',
              topKeywords,
              chartData,
            },
            ts: Date.now(),
          });
          break;
        }

        case 'generate_briefing': {
          emit({ type: 'tool_call', op: 'GEMINI', collection: 'generate_briefing', detail: 'weekly momentum', ts: Date.now() });
          const currentPattern = stepResults.pattern || pattern;
          const briefing = await generateWeeklyBriefingContent(profile, apps, currentPattern);
          stepResults.briefing = briefing;
          emit({ type: 'tool_result', result: `Momentum: ${briefing.momentumScore}/100 (${briefing.momentumTrend})`, ts: Date.now() });
          emit({
            type: 'step_complete',
            message: briefing.reply || `Momentum score: ${briefing.momentumScore}/100`,
            stepIndex: i, stepId: step.id,
            result: {
              type: 'weekly_briefing',
              momentumScore: briefing.momentumScore,
              momentumTrend: briefing.momentumTrend,
              priorityActions: briefing.priorityActions,
              bestPerformingCategory: briefing.bestPerformingCategory,
            },
            ts: Date.now(),
          });
          break;
        }

        case 'draft_followup': {
          const missionPending = await getPendingAgentDrafts(userId, 'followup');
          const staleApps = apps.filter(
            (a) => appDaysSinceApply(a) > 7 && !['REJECTED', 'OFFER'].includes(a.status) && !a.followUpSent
          );
          const app = staleApps.find((a) => !hasFollowUpDraftForApp(missionPending, a));
          if (app) {
            emit({ type: 'tool_call', op: 'GEMINI', collection: 'draft_followup', detail: app.company, company: app.company, ts: Date.now() });
            const draft = await draftFollowUpEmail(profile, app);
            const draftId = `draft_${crypto.randomBytes(6).toString('hex')}`;
            const draftDoc = {
              _id: draftId,
              userId,
              type: 'followup',
              applicationId: String(app._id),
              company: app.company || '',
              role: app.role || '',
              subject: draft.subject || 'Follow-up',
              body: draft.body || '',
              payload: null,
              status: 'pending',
              runId: `mission_${Date.now()}`,
              createdAt: new Date().toISOString(),
            };
            emit({ type: 'tool_call', op: 'INSERT', collection: 'agent_drafts', detail: app.company, ts: Date.now() });
            await mcp.insertOne('agent_drafts', draftDoc);
            await mongo.saveAgentDraft(draftDoc);
            emit({ type: 'tool_result', result: `Draft saved: "${draft.subject}"`, ts: Date.now() });
            emit({
              type: 'step_complete',
              message: `Follow-up email drafted for ${app.company} — awaiting your approval`,
              stepIndex: i, stepId: step.id,
              result: { type: 'followup_draft', draftId, company: app.company, subject: draft.subject, body: draft.body },
              ts: Date.now(),
            });
          } else if (staleApps.length > 0) {
            const existing = staleApps[0];
            const prior = missionPending.find((d) => d.type === 'followup' && (d.company === existing.company));
            emit({
              type: 'step_complete',
              message: `Follow-up for ${existing.company} is already in your drafts — approve or dismiss it below.`,
              stepIndex: i, stepId: step.id,
              result: prior
                ? { type: 'followup_draft', draftId: prior._id, company: prior.company, subject: prior.subject, body: prior.body }
                : { type: 'no_stale_apps' },
              ts: Date.now(),
            });
          } else {
            emit({ type: 'step_complete', message: 'No stale applications to follow up on. Pipeline is current!', stepIndex: i, stepId: step.id, result: { type: 'no_stale_apps' }, ts: Date.now() });
          }
          break;
        }

        case 'generate_cover_letter': {
          emit({ type: 'tool_call', op: 'FIND', collection: 'job_analyses', detail: `userId: ${userId}`, ts: Date.now() });
          const analysisList = await mongo.getJobAnalysesForAgent(userId);
          const eligible = getEligibleJobs(analysisList);
          emit({ type: 'tool_result', result: `${eligible.length} eligible job(s)`, ts: Date.now() });

          const targetJob = pickJobByGoal(goal, analysisList);

          if (!targetJob && eligible.length > 1) {
            const options = eligible.slice(0, 5).map((j) => ({
              company: j.company,
              jobTitle: j.jobTitle,
              matchScore: j.matchScore,
              verdict: j.verdict,
            }));
            emit({
              type: 'step_complete',
              message: `You have ${eligible.length} strong matches — pick a role below and I'll draft your cover letter.`,
              stepIndex: i, stepId: step.id,
              result: { type: 'cover_letter_pick', jobs: options },
              ts: Date.now(),
            });
            break;
          }

          const bestJob = targetJob || eligible[0];

          if (bestJob) {
            emit({ type: 'tool_call', op: 'GEMINI', collection: 'generate_cover_letter', detail: bestJob.company, ts: Date.now() });
            const result = await generateCoverLetter(profile, bestJob);
            emit({ type: 'tool_result', result: `Cover letter ready for ${bestJob.company}`, ts: Date.now() });
            emit({ type: 'tool_call', op: 'UPDATE', collection: 'job_analyses', detail: bestJob._id, ts: Date.now() });
            const coverUpdates = {
              ...bestJob,
              coverLetterGenerated: true,
              coverLetterText: result.coverLetterText || '',
              coverLetterStrategy: result.coverLetterStrategy || '',
            };
            await mongo.saveJobAnalysis(coverUpdates);
            mcp.updateOne('job_analyses', { _id: bestJob._id }, {
              $set: {
                coverLetterGenerated: true,
                coverLetterText: result.coverLetterText || '',
                coverLetterStrategy: result.coverLetterStrategy || '',
              },
            }, { upsert: false }).catch(() => {});
            emit({ type: 'tool_result', result: 'Saved to MongoDB', ts: Date.now() });
            emit({
              type: 'step_complete',
              message: `Cover letter ready for ${bestJob.company} (${bestJob.matchScore}/100 match)`,
              stepIndex: i, stepId: step.id,
              result: {
                type: 'cover_letter',
                company: bestJob.company,
                jobTitle: bestJob.jobTitle,
                matchScore: bestJob.matchScore,
                coverLetterText: result.coverLetterText,
                coverLetterStrategy: result.coverLetterStrategy,
              },
              ts: Date.now(),
            });
          } else {
            emit({ type: 'step_complete', message: 'No eligible jobs found — analyze jobs first!', stepIndex: i, stepId: step.id, result: { type: 'no_jobs' }, ts: Date.now() });
          }
          break;
        }

        default:
          emit({ type: 'step_complete', message: 'Step complete', stepIndex: i, stepId: step.id, result: { type: 'unknown' }, ts: Date.now() });
      }
    } catch (err) {
      console.error(`[mission] Step ${step.id} failed:`, err.message);
      emit({ type: 'step_complete', message: `Step encountered an issue — continuing`, stepIndex: i, stepId: step.id, result: { type: 'error', error: err.message }, ts: Date.now() });
    }
  }

  emit({
    type: 'mission_complete',
    message: plan.missionTitle || 'Mission complete',
    missionTitle: plan.missionTitle,
    stepCount: steps.length,
    ts: Date.now(),
  });
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
  planAndExecuteMission,
  getISOWeek,
  extractProfileFromResume,
  // MCP agent-write helpers (used by routes; chat tool loop uses executeGeminiTool)
  agentUpdateProfile: mcp.agentUpdateProfile,
  agentPushConversation: mcp.agentPushConversation,
  agentUpsertJobAnalysis: mcp.agentUpsertJobAnalysis,
  agentInsertApplication: mcp.agentInsertApplication,
  agentInsertPatternDraft: mcp.agentInsertPatternDraft,
  executeGeminiTool: mcp.executeGeminiTool,
  GEMINI_TOOL_DECLARATIONS: mcp.GEMINI_TOOL_DECLARATIONS,
};
