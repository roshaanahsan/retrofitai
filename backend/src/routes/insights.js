const express = require('express');
const { MIN_REJECTIONS_FOR_PATTERN } = require('../config');
const router = express.Router();
const mongo = require('../services/mongoService');
const mcp = require('../services/mcpService');
const gemini = require('../services/geminiService');

router.get('/', async (req, res) => {
  try {
    const userId = req.session.userId;
    const pattern = await mongo.getRejectionPattern(userId);
    if (!pattern) {
      return res.json({ available: false, minimumRequired: 3 });
    }
    res.json({ available: true, pattern });
  } catch (err) {
    console.error('Insights GET error:', err);
    res.status(500).json({ error: 'Failed to load insights' });
  }
});

router.post('/recalculate', async (req, res) => {
  try {
    const userId = req.session.userId;
    const [profile, apps] = await Promise.all([
      mongo.getOrCreateProfile(userId),
      mongo.getApplicationsForUser(userId),
    ]);

    const rejections = apps.filter(
      (a) => a.status === 'REJECTED' || a.status === 'NO_RESPONSE'
    );
    if (rejections.length < MIN_REJECTIONS_FOR_PATTERN) {
      return res.json({ available: false, minimumRequired: MIN_REJECTIONS_FOR_PATTERN, current: rejections.length });
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

    const draft = await mcp.agentInsertPatternDraft(userId, patternDoc, 'POST /api/insights/recalculate');
    await mcp.agentPushConversation(
      userId,
      'agent',
      patternResult.reply || 'Pattern analysis complete — approve the draft to save it.',
      'POST /api/insights/recalculate',
    );

    res.json({ available: true, pattern: patternDoc, draftId: draft._id, reply: patternResult.reply, pendingApproval: true });
  } catch (err) {
    console.error('Recalculate error:', err);
    res.status(500).json({ error: 'Recalculation failed' });
  }
});

module.exports = router;
