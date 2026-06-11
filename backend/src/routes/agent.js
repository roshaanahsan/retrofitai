const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const mongo = require('../services/mongoService');
const gemini = require('../services/geminiService');
const { getISOWeek } = gemini;

// ─── Intent Detection ────────────────────────────────────────────────────────

function detectIntent(message) {
  const lower = message.toLowerCase().trim();

  // 1. Job analysis: "analyze" keyword + substantial text (JD pasted)
  if ((lower.includes('analyze') || lower.includes('analyse')) && message.length > 200) {
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
    await mongo.saveWeeklyBriefing(briefingDoc);
    return {
      reply: result.reply || 'Weekly briefing generated.',
      agentAction: 'GENERATE_BRIEFING',
      uiHints: {},
      actionType: 'WEEKLY_BRIEFING_RESULT',
      actionData: { briefing: briefingDoc },
    };
  }

  return null;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

router.post('/chat', async (req, res) => {
  try {
    const userId = req.session.userId;
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'message required' });

    const profile = await mongo.getOrCreateProfile(userId);
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

    if (profile.agentMode === 'NEW_USER' || profile.agentMode === 'PROFILE_COMPLETE') {
      geminiResponse = await gemini.runIntake(profile, message);

      const refreshed = await mongo.getOrCreateProfile(userId);
      if (isIntakeComplete(refreshed)) {
        await mongo.updateProfile(userId, { agentMode: 'ACTIVE_SEARCH' });
      }
    } else {
      const [applications, pattern] = await Promise.all([
        mongo.getApplicationsForUser(userId),
        mongo.getRejectionPattern(userId),
      ]);
      geminiResponse = await gemini.runActiveSearch(profile, message, applications, pattern);

      if (geminiResponse.agentAction === 'TRIGGER_REJECTION_ANALYSIS') {
        await mongo.updateProfile(userId, { agentMode: 'PATTERN_DETECTED' });
      }
    }

    if (geminiResponse.mongoUpdates) {
      await mongo.applyMongoUpdate(geminiResponse.mongoUpdates);
    }

    await mongo.pushConversationEntry(userId, 'agent', geminiResponse.reply);

    res.json({
      reply: geminiResponse.reply,
      agentAction: geminiResponse.agentAction || 'NONE',
      uiHints: geminiResponse.uiHints || {},
      actionType: null,
      actionData: null,
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

    const profile = await mongo.getOrCreateProfile(userId);
    console.log('[session-init] profile.agentMode:', profile.agentMode, '| currentRole:', profile.currentRole);

    const [staleApps, pattern, latestBriefing, allApps] = await Promise.all([
      mongo.getStaleApplications(userId, 7),
      mongo.getRejectionPattern(userId),
      mongo.getLatestWeeklyBriefing(userId),
      mongo.getApplicationsForUser(userId),
    ]);
    console.log('[session-init] staleApps:', staleApps.length, '| pattern:', pattern?.dominantPattern ?? 'none');

    let proactiveBriefing = null;
    let proactiveActions = [];

    if (profile.agentMode === 'ACTIVE_SEARCH' || profile.agentMode === 'RETURNING_USER') {
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
      if (rejections.length >= 3 && patternStale) {
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
        // NOTE: Do NOT push proactiveBriefing to conversationHistory here —
        // it is returned in the API response and shown in the UI as a transient
        // message. Storing it on every session-init pollutes the chat history.
        await mongo.updateProfile(userId, { agentMode: 'RETURNING_USER', lastActive: new Date() });
        console.log('[session-init] proactive briefing generated OK');
      } catch (geminiErr) {
        console.error('[session-init] proactive briefing failed (non-fatal):', geminiErr.message);
        // Fallback text so buttons still appear even without Gemini
        if (proactiveActions.length > 0) {
          const parts = [];
          if (staleApps.length > 0)
            parts.push(
              `${staleApps.length} application${staleApps.length > 1 ? 's' : ''} waiting on a response (${staleApps.map((a) => `${a.company} ${a.daysSinceApply}d`).join(', ')})`
            );
          if (rejections.length >= 3 && patternStale)
            parts.push(`${rejections.length} rejections ready for pattern analysis`);
          proactiveBriefing = parts.length > 0
            ? `Quick status: ${parts.join('; ')}. Select an action below.`
            : "Here's what needs your attention today.";
        }
      }
    }

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
      return found;
    };
    let analyses = await fetchAnalyses();
    while (analyses.length < expectedCount && Date.now() - startTime < maxWaitMs) {
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

    const today = new Date().toISOString().split('T')[0];
    const newApps = [];
    for (const job of ranked) {
      if (existingJobIds.has(String(job._id))) continue;
      // Skip analyses where Gemini failed to extract basic job info
      if (!job.company && !job.jobTitle) continue;
      const doc = {
        _id: `app_${uuidv4().replace(/-/g, '').slice(0, 12)}`,
        userId: effectiveUserId,
        jobAnalysisId: job._id,
        company: job.company,
        role: job.jobTitle,
        appliedDate: today,
        status: 'APPLIED',
        statusHistory: [{ status: 'APPLIED', date: today }],
        rejectionStage: null,
        followUpSent: false,
        followUpDate: null,
        daysSinceApply: 0,
        notes: `Auto-tracked by RetrofitAI agent. Match score: ${job.matchScore}%`,
      };
      await mongo.saveApplication(doc);
      newApps.push(doc);
    }

    // 3. Generate cover letter for top job if not already done (skip during setup to save time)
    let coverLetterReady = !!(topJob.coverLetterGenerated && topJob.coverLetterText);
    if (!coverLetterReady && !skipCoverLetter) {
      try {
        const profile = await mongo.getOrCreateProfile(effectiveUserId);
        const jobObj = topJob.toObject ? topJob.toObject() : { ...topJob._doc || topJob };
        const result = await gemini.generateCoverLetter(profile, jobObj);
        await mongo.saveJobAnalysis({
          ...jobObj,
          coverLetterGenerated: true,
          coverLetterText: result.coverLetterText || '',
          coverLetterStrategy: result.coverLetterStrategy || '',
        });
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
    const profile = await mongo.getOrCreateProfile(userId);
    if (!['ACTIVE_SEARCH', 'RETURNING_USER', 'PATTERN_DETECTED'].includes(profile.agentMode)) {
      emit({ type: 'pipeline_skip', reason: 'Profile setup not complete' });
      return res.end();
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
    const { status } = req.body;
    if (!['sent', 'dismissed'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
    await mongo.updateDraftStatus(req.params.id, status);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
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

// ─── Reset session (called when landing=true to ensure clean state) ───────────

router.post('/new-session', async (req, res) => {
  try {
    const userId = req.session.userId;
    // Wipe this user's job data so the new session starts with a clean pipeline
    if (userId) {
      const JobAnalysis = require('../models/JobAnalysis');
      const Application = require('../models/Application');
      const RejectionPattern = require('../models/RejectionPattern');
      await Promise.all([
        JobAnalysis.deleteMany({ userId }),
        Application.deleteMany({ userId }),
        RejectionPattern.deleteMany({ userId }),
      ]);
    }
    req.session.destroy((err) => {
      if (err) return res.status(500).json({ error: 'Failed to reset session' });
      res.clearCookie('connect.sid');
      res.json({ ok: true });
    });
  } catch (err) {
    console.error('[new-session] cleanup error (non-fatal):', err.message);
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.json({ ok: true });
    });
  }
});

module.exports = router;
