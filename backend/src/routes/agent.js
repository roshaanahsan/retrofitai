const express = require('express');
const router = express.Router();
const mongo = require('../services/mongoService');
const gemini = require('../services/geminiService');

router.post('/chat', async (req, res) => {
  try {
    const userId = req.session.userId;
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'message required' });

    const profile = await mongo.getOrCreateProfile(userId);
    await mongo.pushConversationEntry(userId, 'user', message);

    let geminiResponse;

    if (profile.agentMode === 'NEW_USER' || profile.agentMode === 'PROFILE_COMPLETE') {
      geminiResponse = await gemini.runIntake(profile, message);

      // Re-read profile to pick up any tool-driven updates before checking completion
      const refreshed = await mongo.getOrCreateProfile(userId);
      if (isIntakeComplete(refreshed)) {
        await mongo.updateProfile(userId, { agentMode: 'ACTIVE_SEARCH' });
      }
    } else {
      // ACTIVE_SEARCH, RETURNING_USER, PATTERN_DETECTED — load live pipeline data
      const [applications, pattern] = await Promise.all([
        mongo.getApplicationsForUser(userId),
        mongo.getRejectionPattern(userId),
      ]);
      geminiResponse = await gemini.runActiveSearch(profile, message, applications, pattern);

      // If agent signals pattern analysis should run, trigger it
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
    });
  } catch (err) {
    console.error('Agent chat error:', err);
    res.status(500).json({ error: 'Agent error — please try again' });
  }
});

router.get('/demo-login', async (req, res) => {
  req.session.userId = 'demo-user';
  req.session.save((err) => {
    if (err) return res.status(500).json({ error: 'Session save failed' });
    res.json({ ok: true, userId: 'demo-user' });
  });
});

router.post('/builder-chat', async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    if (!message) return res.status(400).json({ error: 'message required' });

    // Use provided sessionId or fall back to the user's session
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
    // Demo mode: override userId in this session before doing any lookups
    if (req.query.demo === 'true') {
      req.session.userId = 'demo-user';
      await new Promise((resolve, reject) =>
        req.session.save((err) => (err ? reject(err) : resolve()))
      );
      console.log('[session-init] demo mode — userId set to demo-user');
    }

    const userId = req.session.userId;
    console.log('[session-init] userId:', userId);

    const profile = await mongo.getOrCreateProfile(userId);
    console.log('[session-init] profile.agentMode:', profile.agentMode, '| currentRole:', profile.currentRole);

    const [staleApps, pattern, latestBriefing] = await Promise.all([
      mongo.getStaleApplications(userId, 7),
      mongo.getRejectionPattern(userId),
      mongo.getLatestWeeklyBriefing(userId),
    ]);
    console.log('[session-init] staleApps:', staleApps.length, '| pattern:', pattern?.dominantPattern ?? 'none');

    // Proactive briefing is best-effort — a Gemini failure must not crash the session
    let proactiveBriefing = null;
    if (profile.agentMode === 'ACTIVE_SEARCH' || profile.agentMode === 'RETURNING_USER') {
      try {
        const geminiResponse = await gemini.generateProactiveBriefing(
          profile,
          staleApps,
          pattern,
          latestBriefing
        );
        proactiveBriefing = geminiResponse.reply;
        if (proactiveBriefing) {
          await mongo.pushConversationEntry(userId, 'agent', proactiveBriefing);
        }
        await mongo.updateProfile(userId, { agentMode: 'RETURNING_USER', lastActive: new Date() });
        console.log('[session-init] proactive briefing generated OK');
      } catch (geminiErr) {
        console.error('[session-init] proactive briefing failed (non-fatal):', geminiErr.message);
      }
    }

    res.json({
      userId,
      agentMode: profile.agentMode,
      profile: sanitizeProfile(profile),
      proactiveBriefing,
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

module.exports = router;
