const { VertexAI } = require('@google-cloud/vertexai');
const mcp = require('./mcpService');

let vertexai;
function getClient() {
  if (!vertexai) {
    vertexai = new VertexAI({
      project: process.env.GOOGLE_CLOUD_PROJECT,
      location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
    });
  }
  return vertexai;
}

const SYSTEM_PROMPT = `You are HireIQ, an elite AI career strategist. You are NOT a form-filler, NOT a chatbot, and NOT a generic assistant. You are a ruthless, data-driven career coach who tells people exactly what they need to hear about their job search.

CORE RULES:
1. You have tools to read and write the user's data from MongoDB. Use them proactively.
2. NEVER ask for information you can read from MongoDB. Use read_career_profile first.
3. Every response references the user's specific data, not generic advice.
4. You are direct, strategic, and concise. No fluff.
5. Legal disclaimer: HireIQ provides career guidance and organizational assistance. It is not a licensed career counselor or employment advisor.

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

// Build Gemini tool declarations from MCP definitions
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

// Retry a Gemini call up to 3 times with 2s backoff
async function withRetry(fn, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      const status = err.message.match(/\[(\d+)/)?.[1];
      if ((status === '503' || status === '429') && i < retries - 1) {
        await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
        continue;
      }
      throw err;
    }
  }
}

// Core agentic loop — Gemini calls tools, we execute via MCP, repeat until done
async function runAgentLoop(model, history, userMessage, userId, maxTurns = 5) {
  const chat = model.startChat({ history });
  let response = await withRetry(() => chat.sendMessage(userMessage));

  let finalReply = '';
  let turns = 0;

  while (turns < maxTurns) {
    turns++;
    const candidate = response.response.candidates?.[0];
    if (!candidate) break;

    const parts = candidate.content?.parts || [];
    const textParts = parts.filter((p) => p.text);
    const funcParts = parts.filter((p) => p.functionCall);

    // Collect any text
    if (textParts.length > 0) {
      finalReply = textParts.map((p) => p.text).join('');
    }

    // No function calls — we're done
    if (funcParts.length === 0) break;

    // Execute all tool calls via MCP
    const toolResults = [];
    for (const part of funcParts) {
      const { name, args } = part.functionCall;
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

    // Send tool results back to Gemini
    response = await withRetry(() => chat.sendMessage(toolResults));
  }

  return finalReply || 'I processed your request. How can I help you further?';
}

async function runIntake(profile, userMessage) {
  const model = getClient().getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    tools: buildGeminiTools(),
    generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
  });

  const history = profile.conversationHistory.slice(-10).map((e) => ({
    role: e.role === 'agent' ? 'model' : 'user',
    parts: [{ text: e.text }],
  }));

  const contextMessage = `USER_ID: ${profile._id}\nCURRENT_PROFILE: ${JSON.stringify({
    agentMode: profile.agentMode,
    currentRole: profile.currentRole,
    targetRole: profile.targetRole,
    skills: profile.skills,
    intakeStep: profile.intakeStep,
  })}\n\nUser says: ${userMessage}`;

  try {
    const reply = await runAgentLoop(model, history, contextMessage, profile._id);
    return { reply, mongoUpdates: null, agentAction: 'NONE', uiHints: { showPatternAlert: false, highlightStaleApplications: [] } };
  } catch (err) {
    console.error('Agent loop error:', err.message);
    // Fallback to simple generation without tools
    return runIntakeFallback(profile, userMessage);
  }
}

async function runIntakeFallback(profile, userMessage) {
  const model = getClient().getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
  });

  const prompt = `${SYSTEM_PROMPT}\n\nCURRENT PROFILE: ${JSON.stringify({
    agentMode: profile.agentMode,
    currentRole: profile.currentRole,
    targetRole: profile.targetRole,
    skills: profile.skills,
    intakeStep: profile.intakeStep,
  })}\n\nUser: ${userMessage}\n\nRespond conversationally as HireIQ. Be direct and strategic.`;

  const result = await model.generateContent(prompt);
  const reply = result.response.text().trim();
  return { reply, mongoUpdates: null, agentAction: 'NONE', uiHints: { showPatternAlert: false, highlightStaleApplications: [] } };
}

async function runActiveSearch(profile, userMessage, applications = [], pattern = null) {
  const model = getClient().getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    tools: buildGeminiTools(),
    generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
  });

  const history = profile.conversationHistory.slice(-10).map((e) => ({
    role: e.role === 'agent' ? 'model' : 'user',
    parts: [{ text: e.text }],
  }));

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
    const reply = await runAgentLoop(model, history, contextMessage, profile._id);

    // Check if the reply signals a trigger action
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
  const model = getClient().getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
  });

  const prompt = `${SYSTEM_PROMPT}\n\nPROFILE: ${JSON.stringify({
    agentMode: profile.agentMode,
    currentRole: profile.currentRole,
    targetRole: profile.targetRole,
    skills: profile.skills,
  })}\n\nUser: ${userMessage}\n\nRespond as HireIQ. Be direct and strategic. Reference their specific profile.`;

  const result = await model.generateContent(prompt);
  const reply = result.response.text().trim();
  return { reply, mongoUpdates: null, agentAction: 'NONE', uiHints: { showPatternAlert: false, highlightStaleApplications: [] } };
}

async function analyzeJob(profile, jobDescription) {
  const model = getClient().getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
  });

  const prompt = `You are HireIQ's job analysis engine.

USER PROFILE:
- Current role: ${profile.currentRole}
- Target role: ${profile.targetRole}
- Skills: ${(profile.skills || []).join(', ')}
- Years experience: ${profile.yearsExperience}
- Resume excerpt: ${profile.resumeText ? profile.resumeText.slice(0, 800) : 'Not provided'}

JOB DESCRIPTION TO ANALYZE:
${jobDescription}

Perform a deep analysis and return ONLY this JSON (no markdown, no extra text):
{
  "jobTitle": "extracted job title",
  "company": "extracted company name",
  "matchScore": 0-100,
  "strongMatches": ["skill1", "skill2"],
  "gaps": ["missing1", "missing2"],
  "missingKeywords": ["ats keyword1", "ats keyword2"],
  "postingAge": null or number of days,
  "verdict": "APPLY_NOW | APPLY_WITH_EDITS | SKIP",
  "verdictReason": "One sentence explaining the verdict",
  "reply": "A 2-3 sentence strategic summary to show the user in chat"
}

Scoring: 70+ = APPLY_NOW, 45-69 = APPLY_WITH_EDITS, <45 = SKIP.`;

  const result = await model.generateContent(prompt);
  const raw = result.response.text().trim();
  return parseGeminiResponse(raw);
}

async function generateCoverLetter(profile, jobAnalysis) {
  const model = getClient().getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { temperature: 0.8, maxOutputTokens: 2048 },
  });

  const prompt = `You are HireIQ's cover letter specialist. Write a cover letter that is NOT generic.

USER PROFILE:
- Current role: ${profile.currentRole}
- Target role: ${profile.targetRole}
- Skills: ${(profile.skills || []).join(', ')}
- Years experience: ${profile.yearsExperience}
- Resume excerpt: ${profile.resumeText ? profile.resumeText.slice(0, 1000) : 'Not provided'}

JOB:
- Title: ${jobAnalysis.jobTitle} at ${jobAnalysis.company}
- Strong matches: ${(jobAnalysis.strongMatches || []).join(', ')}
- Gaps to address: ${(jobAnalysis.gaps || []).join(', ')}
- Job description excerpt: ${(jobAnalysis.jobDescriptionRaw || '').slice(0, 800)}

Return ONLY this JSON (no markdown):
{
  "coverLetterText": "The full cover letter text, professional, 3 paragraphs, no placeholder brackets",
  "coverLetterStrategy": "2 sentences explaining the strategic angle chosen",
  "reply": "One sentence to show the user in chat confirming generation"
}`;

  const result = await model.generateContent(prompt);
  const raw = result.response.text().trim();
  return parseGeminiResponse(raw);
}

async function analyzeRejectionPattern(profile, applications) {
  const model = getClient().getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
  });

  const rejectedApps = applications.filter(
    (a) => a.status === 'REJECTED' || a.status === 'NO_RESPONSE'
  );
  const breakdown = {
    noResponse: rejectedApps.filter((a) => a.rejectionStage === 'NO_RESPONSE' || a.status === 'NO_RESPONSE').length,
    phoneScreen: rejectedApps.filter((a) => a.rejectionStage === 'PHONE_SCREEN').length,
    firstInterview: rejectedApps.filter((a) => a.rejectionStage === 'FIRST_INTERVIEW').length,
    finalRound: rejectedApps.filter((a) => a.rejectionStage === 'FINAL_ROUND').length,
  };

  const prompt = `You are HireIQ's Rejection Intelligence Engine. Analyze rejection data.

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

  const result = await model.generateContent(prompt);
  const raw = result.response.text().trim();
  return parseGeminiResponse(raw);
}

async function generateProactiveBriefing(profile, staleApps, pattern, latestBriefing) {
  const model = getClient().getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { temperature: 0.7, maxOutputTokens: 512 },
  });

  const staleList = staleApps.map((a) => `${a.company} (${a.daysSinceApply}d)`).join(', ');

  const prompt = `You are HireIQ. The user just returned to the app. Write a proactive status briefing — not a greeting, a strategic update. Be specific and direct.

DATA:
- Target role: ${profile.targetRole || 'not set yet'}
- Stale applications (7+ days, no response): ${staleList || 'none'}
- Pattern available: ${pattern ? pattern.dominantPattern : 'none yet'}
- Pattern insight: ${pattern ? pattern.insight : 'not available yet'}
- Momentum score: ${latestBriefing ? latestBriefing.momentumScore : 'not yet calculated'}

Write 2-4 sentences. Lead with the most urgent item. Reference actual application names if available. Be direct.`;

  const result = await model.generateContent(prompt);
  const reply = result.response.text().trim();

  return {
    reply,
    mongoUpdates: null,
    agentAction: 'NONE',
    uiHints: {
      showPatternAlert: !!(pattern && pattern.dominantPattern !== 'INSUFFICIENT_DATA'),
      highlightStaleApplications: staleApps.map((a) => String(a._id)),
    },
  };
}

async function generateWeeklyBriefingContent(profile, applications, pattern) {
  const model = getClient().getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { temperature: 0.5, maxOutputTokens: 1024 },
  });

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const weeklyApps = applications.filter((a) => new Date(a.appliedDate) >= oneWeekAgo);
  const responded = applications.filter((a) => !['APPLIED', 'NO_RESPONSE'].includes(a.status));
  const interviewed = applications.filter((a) => ['INTERVIEW', 'OFFER'].includes(a.status));

  const prompt = `You are HireIQ's weekly briefing generator. Compute a momentum score and write 3 priority actions.

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

  const result = await model.generateContent(prompt);
  const raw = result.response.text().trim();
  return parseGeminiResponse(raw);
}

async function draftFollowUpEmail(profile, application) {
  const model = getClient().getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { temperature: 0.8, maxOutputTokens: 512 },
  });

  const prompt = `You are HireIQ. Draft a professional follow-up email.

Applicant: ${profile.currentRole} targeting ${profile.targetRole}
Applied to: ${application.role} at ${application.company}
Days since applying: ${application.daysSinceApply}

Return ONLY this JSON (no markdown):
{
  "subject": "Email subject line",
  "body": "The full email body — professional, brief (3 short paragraphs), genuine interest",
  "reply": "One sentence confirming the follow-up was drafted"
}`;

  const result = await model.generateContent(prompt);
  const raw = result.response.text().trim();
  return parseGeminiResponse(raw);
}

function parseGeminiResponse(raw) {
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return {
      reply: cleaned,
      mongoUpdates: null,
      agentAction: 'NONE',
      uiHints: { showPatternAlert: false, highlightStaleApplications: [] },
    };
  }
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
};
