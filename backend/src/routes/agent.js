const express = require('express');
const router = express.Router();
const { MIN_REJECTIONS_FOR_PATTERN } = require('../config');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const mongo = require('../services/mongoService');
const mcp = require('../services/mcpService');
const gemini = require('../services/geminiService');
const { getISOWeek } = gemini;

// ─── Intent Detection ────────────────────────────────────────────────────────

function detectIntent(message) {
  const lower = message.toLowerCase().trim();

  // 1. Job analysis: pasted JD (with or without "analyze" keyword)
  const looksLikeJd = message.length > 200 && (
    lower.includes('responsibilities') ||
    lower.includes('requirements') ||
    lower.includes('qualifications') ||
    lower.includes('job description') ||
    lower.includes('what you\'ll do') ||
    lower.includes('what you will do')
  );
  if (((lower.includes('analyze') || lower.includes('analyse')) && message.length > 200) || looksLikeJd) {
    const firstLineEnd = message.indexOf('\n');
    const jd =
      firstLineEnd > -1 && firstLineEnd < 100
        ? message.slice(firstLineEnd + 1).trim()
        : message;
    return { type: 'JOB_ANALYSIS', jd: jd || message };
  }

  // 2. Follow-up email: "draft/write follow up for [company]" or "follow up for [company]"
  const fuPatterns = [
    /(?:draft|write|generate|create)\s+(?:a\s+)?follow[\s-]?up(?:\s+email)?\s+(?:for|to)\s+(.+)/,
    /follow[\s-]?up(?:\s+email)?\s+(?:for|to|with)\s+(.+)/,
  ];
  for (const pat of fuPatterns) {
    const m = lower.match(pat);
    if (m) {
      return { type: 'FOLLOW_UP', company: m[1].replace(/[.!?,].*$/, '').trim() };
    }
  }

  // 3. Weekly report
  if (
    lower.includes('weekly report') ||
    lower.includes('weekly briefing') ||
    lower.match(/generate\s+(?:my\s+)?(?:weekly\s+)?(?:report|briefing)/) ||
    lower.match(/(?:show|get)\s+(?:my\s+)?weekly/)
  ) {
    return { type: 'WEEKLY_REPORT' };
  }

  // 4. Rejection pattern analysis
  if (
    lower.includes('pattern analysis') ||
    lower.includes('run pattern') ||
    lower.includes('rejection pattern') ||
    lower.match(/analyze\s+(?:my\s+)?(?:rejections|rejection)/)
  ) {
    return { type: 'PATTERN_ANALYSIS' };
  }

  // 5. Cover letter — "generate cover letter for Stripe"
  if (lower.includes('cover letter') || lower.match(/(?:write|draft|generate)\s+(?:a\s+)?cover/)) {
    const companyPatterns = [
      /cover\s+letter\s+for\s+(.+)/,
      /(?:write|draft|generate)\s+(?:a\s+)?cover\s+letter\s+for\s+(.+)/,
      /cover\s+letter\s+(?:at|to)\s+(.+)/,
    ];
    for (const pat of companyPatterns) {
      const m = lower.match(pat);
      if (m) {
        return { type: 'COVER_LETTER', company: m[1].replace(/[.!?,].*$/, '').trim() };
      }
    }
    return { type: 'COVER_LETTER', company: null };
  }

  return null;
}

// ─── Action Handlers ─────────────────────────────────────────────────────────

async function handleAgentIntent(userId, intent, profile) {
  if (intent.type === 'JOB_ANALYSIS') {
    const analysis = await gemini.analyzeJob(profile, intent.jd);
    const jobId = `job_${crypto.randomBytes(6).toString('hex')}`;
    const doc = {
      _id: jobId,
      userId,
      analyzedAt: new Date(),
      jobTitle: analysis.jobTitle || '',
      company: analysis.company || '',
      jobDescriptionRaw: intent.jd,
      matchScore: analysis.matchScore || 0,
      strongMatches: analysis.strongMatches || [],
      gaps: analysis.gaps || [],
      missingKeywords: analysis.missingKeywords || [],
      postingAge: analysis.postingAge || null,
      verdict: analysis.verdict || 'APPLY_WITH_EDITS',
      coverLetterGenerated: false,
      coverLetterText: '',
      coverLetterStrategy: '',
    };
    await mongo.saveJobAnalysis(doc);
    await mcp.agentUpsertJobAnalysis(doc, 'chat:JOB_ANALYSIS');
    const reply =
      analysis.reply ||
      `Analysis complete for ${doc.company || 'this role'}: ${doc.matchScore}/100 — ${doc.verdict}.`;
    return {
      reply,
      agentAction: 'NONE',
      uiHints: { showPatternAlert: false, highlightStaleApplications: [] },
      actionType: 'JOB_ANALYSIS_RESULT',
      actionData: { jobAnalysis: doc },
    };
  }

  if (intent.type === 'FOLLOW_UP') {
    const app = await mongo.findApplicationByCompany(userId, intent.company);
    if (!app) {
      return {
        reply: `I couldn't find an application for "${intent.company}" in your pipeline. Add it first, then I can draft the follow-up.`,
        agentAction: 'NONE',
        uiHints: {},
        actionType: null,
        actionData: null,
      };
    }
    const result = await gemini.draftFollowUpEmail(profile, app);
    return {
      reply: result.reply || `Follow-up drafted for ${app.company}.`,
      agentAction: 'NONE',
      uiHints: {},
      actionType: 'FOLLOW_UP_EMAIL',
      actionData: {
        company: app.company,
        role: app.role,
        subject: result.subject,
        body: result.body,
      },
    };
  }

  if (intent.type === 'WEEKLY_REPORT') {
    const [apps, pattern] = await Promise.all([
      mongo.getApplicationsForUser(userId),
      mongo.getRejectionPattern(userId),
    ]);
    const result = await gemini.generateWeeklyBriefingContent(profile, apps, pattern);
    const now = new Date();
    const weekNumber = getISOWeek(now);
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(now.getDate() - 7);
    const weeklyApps = apps.filter((a) => new Date(a.appliedDate) >= oneWeekAgo);
    const responded = apps.filter((a) => !['APPLIED', 'NO_RESPONSE'].includes(a.status));
    const interviewed = apps.filter((a) => ['INTERVIEW', 'OFFER'].includes(a.status));
    const briefingDoc = {
      _id: `brief_${userId}_week${weekNumber}`,
      userId,
      weekNumber,
      generatedAt: now,
      applicationsSentThisWeek: weeklyApps.length,
      responseRate: apps.length > 0 ? responded.length / apps.length : 0,
      interviewRate: apps.length > 0 ? interviewed.length / apps.length : 0,
      industryAvgResponseRate: 0.15,
      momentumScore: result.momentumScore || 0,
      momentumTrend: result.momentumTrend || 'STABLE',
      bestPerformingCategory: result.bestPerformingCategory || '',
      worstPerformingCategory: result.worstPerformingCategory || '',
      priorityActions: result.priorityActions || [],
      pdfGenerated: false,
      pdfPath: null,
    };
    const briefingDraft = {
      _id: `draft_briefing_chat_${userId}_week${weekNumber}`,
      userId,
      type: 'briefing',
      company: 'Weekly Briefing',
      role: `Week ${weekNumber}`,
      subject: `Week ${weekNumber} briefing — momentum ${briefingDoc.momentumScore}/100`,
      body: [
        `Trend: ${briefingDoc.momentumTrend}`,
        `Applications this week: ${briefingDoc.applicationsSentThisWeek}`,
        '',
        'Priority actions:',
        ...(briefingDoc.priorityActions || []).map((a) => `• ${a.action || a}`),
      ].filter(Boolean).join('\n'),
      payload: briefingDoc,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    console.log('[MCP] agent write via chat:WEEKLY_REPORT → agent_drafts briefing draft');
    await mcp.insertOne('agent_drafts', briefingDraft);
    return {
      reply: result.reply || `Week ${weekNumber} briefing draft ready — approve below to save it.`,
      agentAction: 'GENERATE_BRIEFING',
      uiHints: {},
      actionType: 'WEEKLY_BRIEFING_RESULT',
      actionData: { briefing: briefingDoc, draftId: briefingDraft._id, pendingApproval: true },
    };
  }

  if (intent.type === 'PATTERN_ANALYSIS') {
    const apps = await mongo.getApplicationsForUser(userId);
    const rejections = apps.filter((a) => a.status === 'REJECTED' || a.status === 'NO_RESPONSE');
    if (rejections.length < MIN_REJECTIONS_FOR_PATTERN) {
      return {
        reply: `You need at least ${MIN_REJECTIONS_FOR_PATTERN} rejections for pattern analysis. You have ${rejections.length} so far — update job outcomes in the left panel, then try again.`,
        agentAction: 'NONE',
        uiHints: {},
        actionType: null,
        actionData: null,
      };
    }
    const patternResult = await gemini.analyzeRejectionPattern(profile, apps);
    const patternDoc = {
      _id: `pattern_${userId}`,
      userId,
      lastCalculated: new Date(),
      totalApplications: apps.length,
      totalRejections: rejections.length,
      rejectionBreakdown: {
        noResponse: rejections.filter((a) => a.rejectionStage === 'NO_RESPONSE' || a.status === 'NO_RESPONSE').length,
        phoneScreen: rejections.filter((a) => a.rejectionStage === 'PHONE_SCREEN').length,
        firstInterview: rejections.filter((a) => a.rejectionStage === 'FIRST_INTERVIEW').length,
        finalRound: rejections.filter((a) => a.rejectionStage === 'FINAL_ROUND').length,
      },
      dominantPattern: patternResult.dominantPattern || 'INSUFFICIENT_DATA',
      patternConfidence: patternResult.patternConfidence || 'LOW',
      insight: patternResult.insight || '',
      recommendedActions: patternResult.recommendedActions || [],
      missingKeywordsAcrossRejections: patternResult.missingKeywordsAcrossRejections || [],
    };
    const draft = await mcp.agentInsertPatternDraft(userId, patternDoc, 'chat:PATTERN_ANALYSIS');
    return {
      reply: patternResult.reply || 'Rejection pattern detected — review and approve the draft below.',
      agentAction: 'TRIGGER_REJECTION_ANALYSIS',
      uiHints: { showPatternAlert: true, highlightStaleApplications: [] },
      actionType: 'PATTERN_ANALYSIS_RESULT',
      actionData: { pattern: patternDoc, draftId: draft._id },
    };
  }

  if (intent.type === 'COVER_LETTER') {
    const profileFull = await mongo.getProfileForAgent(userId);
    const jobAnalyses = await mongo.getJobAnalysesForAgent(userId);
    const eligible = [...jobAnalyses]
      .filter((a) => ['APPLY_NOW', 'APPLY_WITH_EDITS'].includes(a.verdict))
      .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));

    if (!eligible.length) {
      return {
        reply: 'No scored jobs yet — complete job analysis first, then ask for a cover letter.',
        agentAction: 'NONE',
        uiHints: {},
        actionType: null,
        actionData: null,
      };
    }

    let targetJob = null;
    if (intent.company) {
      const needle = intent.company.toLowerCase().replace(/[^a-z0-9]/g, '');
      targetJob = eligible.find((j) => {
        const hay = (j.company || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        return hay.includes(needle) || needle.includes(hay);
      }) || null;
      if (!targetJob) {
        return {
          reply: `I couldn't find "${intent.company}" in your analyzed jobs. Try: ${eligible.map((j) => j.company).join(', ')}.`,
          agentAction: 'NONE',
          uiHints: {},
          actionType: null,
          actionData: null,
        };
      }
    } else if (eligible.length > 1) {
      const options = eligible.slice(0, 5).map((j) => ({
        company: j.company,
        jobTitle: j.jobTitle,
        matchScore: j.matchScore,
        verdict: j.verdict,
      }));
      const list = options.map((j) => `• ${j.company} — ${j.jobTitle} (${j.matchScore}/100)`).join('\n');
      return {
        reply: `Which role should I write for? Pick one below:\n\n${list}`,
        agentAction: 'NONE',
        uiHints: {},
        actionType: 'MISSION_DEBRIEF',
        actionData: { result: { type: 'cover_letter_pick', jobs: options } },
      };
    } else {
      targetJob = eligible[0];
    }

    const result = await gemini.generateCoverLetter(profileFull, targetJob);
    const coverUpdates = {
      ...targetJob,
      coverLetterGenerated: true,
      coverLetterText: result.coverLetterText || '',
      coverLetterStrategy: result.coverLetterStrategy || '',
    };
    await mongo.saveJobAnalysis(coverUpdates);

    return {
      reply: `Cover letter ready for ${targetJob.company} (${targetJob.matchScore}/100 match).`,
      agentAction: 'NONE',
      uiHints: {},
      actionType: 'MISSION_DEBRIEF',
      actionData: {
        result: {
          type: 'cover_letter',
          company: targetJob.company,
          jobTitle: targetJob.jobTitle,
          matchScore: targetJob.matchScore,
          coverLetterText: result.coverLetterText,
          coverLetterStrategy: result.coverLetterStrategy,
        },
      },
    };
  }

  return null;
}

// ─── Chat MCP activity (shown in frontend MCP panel) ─────────────────────────

function buildChatMcpActivity({ profile, applications, jobAnalyses, pattern, briefing }) {
  const top = [...(jobAnalyses || [])].sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0))[0];
  let t = Date.now();
  const bump = () => { t += 120; return t; };

  const events = [
    { type: 'agent_start', message: 'Loading full context for chat…', ts: bump() },
    { type: 'tool_call', op: 'FIND', collection: 'career_profiles', detail: String(profile._id), ts: bump() },
    {
      type: 'tool_result',
      result: `${profile.targetRole || profile.currentRole || 'Profile'} · ${(profile.skills || []).length} skills`,
      ts: bump(),
    },
    { type: 'tool_call', op: 'FIND', collection: 'applications', detail: `userId: ${profile._id}`, ts: bump() },
    { type: 'tool_result', result: `${applications.length} application(s) with status`, ts: bump() },
    { type: 'tool_call', op: 'FIND', collection: 'job_analyses', detail: `userId: ${profile._id}`, ts: bump() },
    {
      type: 'tool_result',
      result: top
        ? `${jobAnalyses.length} analyses · top: ${top.company} (${top.matchScore}/100)`
        : `${jobAnalyses.length} analyses`,
      ts: bump(),
    },
  ];

  if (pattern) {
    events.push(
      { type: 'tool_call', op: 'FIND', collection: 'rejection_patterns', detail: String(profile._id), ts: bump() },
      { type: 'tool_result', result: pattern.dominantPattern || 'Pattern loaded', ts: bump() },
    );
  }

  if (briefing) {
    const b = typeof briefing.toObject === 'function' ? briefing.toObject() : briefing;
    events.push(
      { type: 'tool_call', op: 'FIND', collection: 'weekly_briefings', detail: `week ${b.weekNumber}`, ts: bump() },
      { type: 'tool_result', result: `Momentum ${b.momentumScore}/100 (${b.momentumTrend})`, ts: bump() },
    );
  }

  events.push({
    type: 'tool_call',
    op: 'GEMINI',
    collection: 'active_search_chat',
    detail: 'Answer from full MongoDB context',
    ts: bump(),
  });
  events.push({
    type: 'step_complete',
    message: top ? `Reply built from ${top.company} match data` : 'Chat reply ready',
    ts: bump(),
  });

  return events;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

router.post('/chat', async (req, res) => {
  try {
    const userId = req.session.userId;
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'message required' });

    let profile = await mongo.getProfileForAgent(userId);

    const [applications, pattern, jobAnalyses, briefing] = await Promise.all([
      mongo.getApplicationsForAgent(userId),
      mongo.getRejectionPattern(userId),
      mongo.getJobAnalysesForAgent(userId),
      mongo.getLatestWeeklyBriefing(userId),
    ]);
    const hasPipeline = applications.length > 0 || jobAnalyses.length > 0;
    const useActiveSearch = shouldRunActiveSearch(profile) || hasPipeline;

    if (useActiveSearch && !['ACTIVE_SEARCH', 'RETURNING_USER', 'PATTERN_DETECTED'].includes(profile.agentMode)) {
      await mongo.updateProfile(userId, { agentMode: 'ACTIVE_SEARCH', conversationHistory: [] });
      profile = await mongo.getProfileForAgent(userId);
    }

    // Backfill profile from resume if onboarding saved bio but infer failed
    if (useActiveSearch && profile.resumeText?.trim() && !profile.skills?.length && !profile.currentRole?.trim()) {
      try {
        const fields = await gemini.extractProfileFromResume(profile.resumeText);
        const updates = {};
        if (fields.currentRole) updates.currentRole = fields.currentRole;
        if (fields.targetRole) updates.targetRole = fields.targetRole;
        if (fields.targetIndustry) updates.targetIndustry = fields.targetIndustry;
        if (fields.yearsExperience) updates.yearsExperience = fields.yearsExperience;
        if (fields.skills?.length) updates.skills = fields.skills;
        if (Object.keys(updates).length) {
          await mongo.updateProfile(userId, updates);
          profile = await mongo.getProfileForAgent(userId);
        }
      } catch (err) {
        console.warn('[chat] resume backfill skipped:', err.message);
      }
    }

    await mongo.pushConversationEntry(userId, 'user', message);

    // Check for autonomous agent actions before hitting Gemini
    const intent = detectIntent(message);
    if (intent) {
      try {
        const result = await handleAgentIntent(userId, intent, profile);
        if (result) {
          await mongo.pushConversationEntry(userId, 'agent', result.reply);
          return res.json(result);
        }
      } catch (intentErr) {
        console.error('[agent] intent handler error:', intentErr.message);
        // Fall through to Gemini on error
      }
    }

    // Standard Gemini conversation flow
    let geminiResponse;

    if (useActiveSearch) {
      console.log('[chat] active-search', {
        agentMode: profile.agentMode,
        apps: applications.length,
        jobs: jobAnalyses.length,
        skills: profile.skills?.length ?? 0,
        targetRole: profile.targetRole || '(empty)',
      });
      geminiResponse = await gemini.runActiveSearch(
        profile, message, applications, pattern, jobAnalyses, briefing
      );

      if (geminiResponse.agentAction === 'TRIGGER_REJECTION_ANALYSIS') {
        await mongo.updateProfile(userId, { agentMode: 'PATTERN_DETECTED' });
      }
    } else {
      console.log('[chat] intake', { agentMode: profile.agentMode });
      geminiResponse = await gemini.runIntake(profile, message);

      const refreshed = await mongo.getProfileForAgent(userId);
      if (isIntakeComplete(refreshed)) {
        await mongo.updateProfile(userId, { agentMode: 'ACTIVE_SEARCH' });
      }
    }

    if (geminiResponse.mongoUpdates) {
      await mongo.applyMongoUpdate(geminiResponse.mongoUpdates);
    }

    await mongo.pushConversationEntry(userId, 'agent', geminiResponse.reply);

    const mcpActivity = useActiveSearch
      ? buildChatMcpActivity({
        profile,
        applications,
        jobAnalyses,
        pattern,
        briefing,
      })
      : [];

    res.json({
      reply: geminiResponse.reply,
      agentAction: geminiResponse.agentAction || 'NONE',
      uiHints: geminiResponse.uiHints || {},
      actionType: null,
      actionData: null,
      mcpActivity,
    });
  } catch (err) {
    console.error('Agent chat error:', err);
    res.status(500).json({ error: 'Agent error — please try again' });
  }
});

router.post('/builder-chat', async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    if (!message) return res.status(400).json({ error: 'message required' });

    const resolvedSessionId = sessionId || req.session.userId;
    const result = await gemini.callAgentBuilder(message, resolvedSessionId);
    res.json(result);
  } catch (err) {
    console.error('Agent Builder error:', err);
    res.status(500).json({ error: err.message || 'Agent Builder error' });
  }
});

router.get('/session-init', async (req, res) => {
  try {
    const userId = req.session.userId;
    console.log('[session-init] userId:', userId);

    const profile = await mongo.getProfileForAgent(userId);
    console.log('[session-init] profile.agentMode:', profile.agentMode, '| currentRole:', profile.currentRole);

    const [staleApps, pattern, latestBriefing, allApps, jobAnalyses] = await Promise.all([
      mongo.getStaleApplications(userId, 7),
      mongo.getRejectionPattern(userId),
      mongo.getLatestWeeklyBriefing(userId),
      mongo.getApplicationsForAgent(userId),
      mongo.getJobAnalysesForAgent(userId),
    ]);
    console.log('[session-init] staleApps:', staleApps.length, '| pattern:', pattern?.dominantPattern ?? 'none');

    let proactiveBriefing = null;
    let proactiveActions = [];

    if (['ACTIVE_SEARCH', 'RETURNING_USER', 'PATTERN_DETECTED'].includes(profile.agentMode)) {
      // Build proactive action buttons based on live data
      // Follow-up buttons — up to 3 stale apps
      staleApps.slice(0, 3).forEach((app) => {
        proactiveActions.push({
          id: `followup_${String(app._id)}`,
          label: `Draft Follow-up for ${app.company}`,
          intent: 'FOLLOW_UP',
          company: app.company,
        });
      });

      // Pattern analysis — only if 3+ rejections and pattern is missing/stale (>3 days old)
      const rejections = allApps.filter(
        (a) => a.status === 'REJECTED' || a.status === 'NO_RESPONSE'
      );
      const patternStale =
        !pattern ||
        !pattern.lastCalculated ||
        Date.now() - new Date(pattern.lastCalculated).getTime() > 3 * 24 * 60 * 60 * 1000;
      if (rejections.length >= MIN_REJECTIONS_FOR_PATTERN && patternStale) {
        proactiveActions.push({
          id: 'pattern_analysis',
          label: 'Run Pattern Analysis',
          intent: 'PATTERN_ANALYSIS',
        });
      }

      // Weekly briefing — only if no briefing for the current ISO week
      const currentWeek = getISOWeek(new Date());
      if (!latestBriefing || latestBriefing.weekNumber !== currentWeek) {
        proactiveActions.push({
          id: 'weekly_briefing',
          label: "Generate This Week's Briefing",
          intent: 'WEEKLY_REPORT',
        });
      }

      // Generate the proactive briefing text (best-effort)
      try {
        const geminiResponse = await gemini.generateProactiveBriefing(
          profile,
          staleApps,
          pattern,
          latestBriefing
        );
        proactiveBriefing = geminiResponse.reply;
        if (!proactiveBriefing?.trim()) {
          proactiveBriefing = buildProactiveFallback(staleApps, allApps, rejections.length, pattern, latestBriefing);
        }
        // NOTE: Do NOT push proactiveBriefing to conversationHistory here —
        // it is returned in the API response and shown in the UI as a transient
        // message. Storing it on every session-init pollutes the chat history.
        await mongo.updateProfile(userId, { agentMode: 'RETURNING_USER', lastActive: new Date() });
        console.log('[session-init] proactive briefing generated OK');
      } catch (geminiErr) {
        console.error('[session-init] proactive briefing failed (non-fatal):', geminiErr.message);
        proactiveBriefing = buildProactiveFallback(staleApps, allApps, rejections.length, pattern, latestBriefing);
      }
    }

    const rejections = allApps.filter((a) => a.status === 'REJECTED' || a.status === 'NO_RESPONSE');
    const responded = allApps.filter((a) => !['APPLIED', 'NO_RESPONSE'].includes(a.status));

    res.json({
      userId,
      agentMode: profile.agentMode,
      profile: sanitizeProfile(profile),
      proactiveBriefing,
      proactiveActions,
      uiHints: {
        showPatternAlert: !!(pattern && pattern.dominantPattern !== 'INSUFFICIENT_DATA'),
        highlightStaleApplications: staleApps.map((a) => a._id),
        staleCount: staleApps.length,
      },
      dashboard: buildDashboard(profile, allApps, jobAnalyses, pattern, latestBriefing, staleApps, rejections, responded),
    });
  } catch (err) {
    console.error('[session-init] fatal error:', err);
    res.status(500).json({ error: 'Session initialization failed' });
  }
});

// ─── Finalize Analysis (agent autonomous actions post-batch) ─────────────────

router.post('/finalize-analysis', async (req, res) => {
  try {
    const userId = req.session.userId;
    const { batchId, expectedCount = 1, skipCoverLetter = false } = req.body;
    if (!batchId) return res.status(400).json({ error: 'batchId required' });

    // 1. Fetch analyses — poll up to 60s for fire-and-forget analyzeJob calls to complete.
    //    Fall back to batchId-only search if session userId is stale/missing (connect-mongo failures).
    const maxWaitMs = 60000;
    const pollMs = 4000;
    const startTime = Date.now();
    const fetchAnalyses = async () => {
      let found = await mongo.getJobAnalysesForUser(userId, batchId);
      if (!found.length) found = await mongo.getJobAnalysesForUser(null, batchId);
      if (!found.length) {
        try {
          const filter = userId ? { userId, batchId } : { batchId };
          const mcpDocs = await mcp.find('job_analyses', filter);
          found = Array.isArray(mcpDocs) ? mcpDocs : [];
        } catch (mcpErr) {
          console.warn('[finalize-analysis] MCP find fallback failed:', mcpErr.message);
        }
      }
      return found;
    };
    let analyses = await fetchAnalyses();
    const targetCount = Math.max(1, expectedCount || 1);
    while (analyses.length < targetCount && Date.now() - startTime < maxWaitMs) {
      await new Promise(r => setTimeout(r, pollMs));
      analyses = await fetchAnalyses();
    }
    if (!analyses.length) return res.status(404).json({ error: 'No analyses found for batch' });

    const ranked = [...analyses].sort((a, b) => b.matchScore - a.matchScore);
    const topJob = ranked[0];
    // Use userId from the analysis documents themselves (handles session store failures)
    const effectiveUserId = topJob.userId || userId;

    // 2. Create Application records — skip any already linked to a jobAnalysisId in this batch
    const existingApps = await mongo.getApplicationsForUser(effectiveUserId);
    const existingJobIds = new Set(existingApps.map((a) => String(a.jobAnalysisId)).filter(Boolean));

    const staggerDays = [14, 10, 3];
    const newApps = [];
    let newAppIndex = 0;
    for (const job of ranked) {
      if (existingJobIds.has(String(job._id))) continue;
      // Skip analyses where Gemini failed to extract basic job info
      if (!job.company && !job.jobTitle) continue;
      const daysAgo = staggerDays[newAppIndex % staggerDays.length] || 0;
      const applied = new Date();
      applied.setDate(applied.getDate() - daysAgo);
      const appliedDate = applied.toISOString().split('T')[0];
      newAppIndex += 1;
      const doc = {
        _id: `app_${uuidv4().replace(/-/g, '').slice(0, 12)}`,
        userId: effectiveUserId,
        jobAnalysisId: job._id,
        company: job.company,
        role: job.jobTitle,
        appliedDate,
        status: 'APPLIED',
        statusHistory: [{ status: 'APPLIED', date: appliedDate }],
        rejectionStage: null,
        followUpSent: false,
        followUpDate: null,
        daysSinceApply: daysAgo,
        notes: `Auto-tracked by RetrofitAI agent. Match score: ${job.matchScore}%`,
      };
      try {
        await mongo.saveApplication(doc);
        mcp.agentInsertApplication(doc, 'POST /api/agent/finalize-analysis').catch((e) => {
          console.warn('[finalize-analysis] MCP app mirror failed:', e.message);
        });
        newApps.push(doc);
      } catch (appErr) {
        console.error('[finalize-analysis] save application failed:', appErr.message);
      }
    }

    // 3. Generate cover letter for top job if not already done (skip during setup to save time)
    let coverLetterReady = !!(topJob.coverLetterGenerated && topJob.coverLetterText);
    if (!coverLetterReady && !skipCoverLetter) {
      try {
        const profile = await mongo.getOrCreateProfile(effectiveUserId);
        const jobObj = topJob.toObject ? topJob.toObject() : { ...topJob._doc || topJob };
        const result = await gemini.generateCoverLetter(profile, jobObj);
        const coverUpdates = {
          ...jobObj,
          coverLetterGenerated: true,
          coverLetterText: result.coverLetterText || '',
          coverLetterStrategy: result.coverLetterStrategy || '',
        };
        await mongo.saveJobAnalysis(coverUpdates);
        mcp.agentUpsertJobAnalysis(coverUpdates, 'POST /api/agent/finalize-analysis').catch(() => {});
        coverLetterReady = true;
      } catch (err) {
        console.error('[finalize-analysis] cover letter generation failed (non-fatal):', err.message);
      }
    }

    // 4. Find the most repeated missing keyword across all analyses
    const gapCounts = {};
    ranked.forEach((j) =>
      (j.missingKeywords || []).forEach((kw) => {
        const k = (kw || '').toLowerCase().trim();
        if (k) gapCounts[k] = (gapCounts[k] || 0) + 1;
      })
    );
    const gapEntries = Object.entries(gapCounts).sort((a, b) => b[1] - a[1]);
    const criticalGap = gapEntries[0]?.[0] || null;
    const criticalGapCount = gapEntries[0]?.[1] || 0;

    res.json({
      rankedJobs: ranked.map((j) => ({
        _id: j._id,
        jobTitle: j.jobTitle,
        company: j.company,
        matchScore: j.matchScore,
        verdict: j.verdict,
        strongMatches: (j.strongMatches || []).slice(0, 2),
        gaps: (j.gaps || []).slice(0, 2),
      })),
      topJob: {
        _id: topJob._id,
        jobTitle: topJob.jobTitle,
        company: topJob.company,
        matchScore: topJob.matchScore,
      },
      criticalGap,
      criticalGapCount,
      totalJobs: ranked.length,
      newApplicationsCreated: newApps.length,
      coverLetterReady,
      coverLetterJobId: topJob._id,
    });
  } catch (err) {
    console.error('[finalize-analysis] error:', err);
    res.status(500).json({ error: 'Failed to finalize analysis' });
  }
});

// ─── Autonomous Pipeline (NDJSON streaming) ───────────────────────────────────

router.post('/autonomous-run', async (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ error: 'No session' });

  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const emit = (event) => {
    try {
      res.write(JSON.stringify({ ...event, ts: Date.now() }) + '\n');
    } catch { /* client disconnected */ }
  };

  try {
    const profile = await mongo.getProfileForAgent(userId);
    if (!['ACTIVE_SEARCH', 'RETURNING_USER', 'PATTERN_DETECTED'].includes(profile.agentMode)) {
      emit({ type: 'pipeline_skip', reason: 'Profile setup not complete' });
      return res.end();
    }
    const latestRun = await mongo.getLatestAgentRun(userId);
    if (latestRun?.startedAt) {
      const ageMs = Date.now() - new Date(latestRun.startedAt).getTime();
      if (ageMs < 20 * 60 * 1000) {
        emit({
          type: 'pipeline_skip',
          reason: 'Pipeline already ran recently',
          summary: latestRun.summary || { draftsCreated: 0, appsScanned: 0, staleFound: 0 },
        });
        return res.end();
      }
    }
    await gemini.runAutonomousPipeline(userId, profile, emit);
  } catch (err) {
    console.error('[autonomous-run] error:', err.message);
    emit({ type: 'pipeline_error', message: err.message });
  }
  res.end();
});

// ─── Agent Drafts ─────────────────────────────────────────────────────────────

router.get('/drafts', async (req, res) => {
  try {
    const drafts = await mongo.getAgentDrafts(req.session.userId, 'pending');
    res.json({ data: drafts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/drafts/:id', async (req, res) => {
  try {
    const userId = req.session.userId;
    const { status } = req.body;
    if (!['sent', 'dismissed'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
    await mongo.updateDraftStatus(req.params.id, status, userId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/confirm-draft/:draftId', async (req, res) => {
  try {
    const userId = req.session.userId;
    const { draftId } = req.params;
    const draft = await mongo.getAgentDraftById(draftId, userId);
    if (!draft) return res.status(404).json({ error: 'Draft not found' });
    if (draft.status !== 'pending') return res.status(400).json({ error: 'Draft already processed' });

    const mcp = require('../services/mcpService');
    const draftType = draft.type || 'followup';

    if (draftType === 'pattern' && draft.payload) {
      console.log('[MCP] confirm-draft → rejection_patterns upsert');
      await mcp.updateOne(
        'rejection_patterns',
        { userId },
        { $set: { ...draft.payload, userId } },
      );
    } else if (draftType === 'briefing' && draft.payload) {
      console.log('[MCP] confirm-draft → weekly_briefings insert');
      await mcp.insertOne('weekly_briefings', { ...draft.payload, userId });
    } else if (draftType === 'followup') {
      console.log('[MCP] confirm-draft → followup acknowledged');
    }

    console.log('[MCP] confirm-draft → delete agent_drafts', draftId);
    await mcp.deleteOne('agent_drafts', { _id: draftId });
    await mongo.updateDraftStatus(draftId, 'sent', userId);

    res.json({ ok: true, type: draftType });
  } catch (err) {
    console.error('[confirm-draft] error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to confirm draft' });
  }
});

router.get('/latest-run', async (req, res) => {
  try {
    const run = await mongo.getLatestAgentRun(req.session.userId);
    res.json({ data: run });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function buildDashboard(profile, allApps, jobAnalyses, pattern, latestBriefing, staleApps, rejections, responded) {
  const statusOrder = { OFFER: 0, INTERVIEW: 1, PHONE_SCREEN: 2, APPLIED: 3, NO_RESPONSE: 4, REJECTED: 5 };
  const applications = [...allApps]
    .sort((a, b) => (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9))
    .slice(0, 8)
    .map((a) => ({
      _id: String(a._id),
      company: a.company || 'Unknown',
      role: a.role || '',
      status: a.status,
      daysSinceApply: a.daysSinceApply || 0,
      rejectionStage: a.rejectionStage || null,
    }));

  const topJobs = [...(jobAnalyses || [])]
    .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0))
    .slice(0, 4)
    .map((j) => ({
      _id: String(j._id),
      company: j.company || '',
      jobTitle: j.jobTitle || '',
      matchScore: j.matchScore || 0,
      verdict: j.verdict || '',
    }));

  return {
    stats: {
      totalApplications: allApps.length,
      rejections: rejections.length,
      interviews: allApps.filter((a) => ['INTERVIEW', 'OFFER', 'PHONE_SCREEN'].includes(a.status)).length,
      staleCount: staleApps.length,
      jobsAnalyzed: (jobAnalyses || []).length,
      responseRate: allApps.length > 0 ? Math.round((responded.length / allApps.length) * 100) : 0,
    },
    pattern: pattern && pattern.dominantPattern !== 'INSUFFICIENT_DATA' ? {
      dominantPattern: pattern.dominantPattern,
      patternConfidence: pattern.patternConfidence,
      insight: pattern.insight || '',
      recommendedActions: (pattern.recommendedActions || []).slice(0, 3),
      totalRejections: pattern.totalRejections || rejections.length,
    } : rejections.length >= MIN_REJECTIONS_FOR_PATTERN ? {
      dominantPattern: null,
      patternConfidence: null,
      insight: null,
      recommendedActions: [],
      totalRejections: rejections.length,
      readyForAnalysis: true,
    } : null,
    briefing: latestBriefing ? {
      weekNumber: latestBriefing.weekNumber,
      momentumScore: latestBriefing.momentumScore,
      momentumTrend: latestBriefing.momentumTrend,
    } : null,
    applications,
    topJobs,
    profileSummary: {
      name: profile.currentRole ? profile.currentRole.split(' ').slice(-2).join(' ') : 'Your profile',
      currentRole: profile.currentRole || '',
      targetRole: profile.targetRole || '',
      yearsExperience: profile.yearsExperience || 0,
      skills: (profile.skills || []).slice(0, 5),
    },
  };
}

function buildProactiveFallback(staleApps, allApps, rejectionCount, pattern, latestBriefing) {
  const parts = [];
  if (allApps.length > 0) {
    parts.push(`${allApps.length} application${allApps.length !== 1 ? 's' : ''} in your pipeline`);
  }
  if (staleApps.length > 0) {
    parts.push(
      `${staleApps.length} stale follow-up${staleApps.length !== 1 ? 's' : ''} (${staleApps.slice(0, 3).map((a) => `${a.company} ${a.daysSinceApply}d`).join(', ')})`
    );
  }
  if (pattern?.dominantPattern && pattern.dominantPattern !== 'INSUFFICIENT_DATA') {
    parts.push(`active rejection pattern: ${pattern.dominantPattern.replace(/_/g, ' ').toLowerCase()}`);
  } else if (rejectionCount >= MIN_REJECTIONS_FOR_PATTERN) {
    parts.push(`${rejectionCount} rejections ready for pattern analysis`);
  }
  if (latestBriefing?.momentumScore != null) {
    parts.push(`momentum ${latestBriefing.momentumScore}/100 (${latestBriefing.momentumTrend || 'STABLE'})`);
  }
  if (parts.length === 0) {
    return "Welcome back. I'm monitoring your pipeline — ask me to analyze jobs, track applications, or review patterns.";
  }
  return `Here's your pipeline status: ${parts.join('; ')}. What should we tackle first?`;
}

function profileHasCareerData(profile) {
  const hasSkills = Array.isArray(profile.skills) && profile.skills.length > 0;
  const hasRole = !!(profile.currentRole?.trim() || profile.targetRole?.trim());
  const hasResume = !!(profile.resumeText?.trim() && profile.resumeText.trim().length > 40);
  return hasSkills || hasRole || hasResume;
}

/** Use active-search brain when onboarding already filled the profile (even if agentMode lagged) */
function shouldRunActiveSearch(profile) {
  if (['ACTIVE_SEARCH', 'RETURNING_USER', 'PATTERN_DETECTED', 'PROFILE_COMPLETE'].includes(profile.agentMode)) {
    return true;
  }
  return profileHasCareerData(profile);
}

function isIntakeComplete(profile) {
  return (
    profile.currentRole &&
    profile.targetRole &&
    profile.skills.length > 0 &&
    (profile.agentMode === 'NEW_USER' || profile.agentMode === 'PROFILE_COMPLETE')
  );
}

function sanitizeProfile(profile) {
  return {
    currentRole: profile.currentRole,
    targetRole: profile.targetRole,
    targetIndustry: profile.targetIndustry,
    yearsExperience: profile.yearsExperience,
    skills: profile.skills,
    salaryMin: profile.salaryMin,
    salaryMax: profile.salaryMax,
    location: profile.location,
    urgency: profile.urgency,
    agentMode: profile.agentMode,
    conversationHistory: profile.conversationHistory.slice(-30),
  };
}

// ─── Mission: user-initiated multi-step agent execution ──────────────────────

router.post('/mission', async (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ error: 'No session' });

  const { goal } = req.body;
  if (!goal || !goal.trim()) return res.status(400).json({ error: 'goal required' });

  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  const send = (obj) => {
    try { res.write(JSON.stringify(obj) + '\n'); } catch { /* client disconnected */ }
  };

  try {
    const profile = await mongo.getProfileForAgent(userId);
    await gemini.planAndExecuteMission(userId, profile, goal.trim(), send);
  } catch (err) {
    console.error('[mission] Error:', err.message);
    send({ type: 'mission_error', message: 'Mission failed: ' + err.message.slice(0, 80), ts: Date.now() });
  } finally {
    res.end();
  }
});

// ─── Reset session (called when landing=true to ensure clean state) ───────────

router.post('/new-session', async (req, res) => {
  const userId = req.session.userId;
  try {
    if (userId) {
      const { deleted } = await mongo.clearAllUserData(userId);
      console.log(`[new-session] wiped ${deleted} document(s) for ${userId}`);
    }
  } catch (err) {
    console.error('[new-session] cleanup error (non-fatal):', err.message);
  }

  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: 'Failed to reset session' });
    res.clearCookie('connect.sid');
    res.json({ ok: true, wiped: !!userId });
  });
});

module.exports = router;
