const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const mongo = require('../services/mongoService');
const gemini = require('../services/geminiService');

router.get('/', async (req, res) => {
  try {
    const apps = await mongo.getApplicationsForUser(req.session.userId);
    const updated = apps.map((a) => {
      const obj = a.toObject();
      obj.daysSinceApply = Math.floor(
        (Date.now() - new Date(a.appliedDate).getTime()) / (1000 * 60 * 60 * 24)
      );
      return obj;
    });
    res.json(updated);
  } catch (err) {
    console.error('Applications GET error:', err);
    res.status(500).json({ error: 'Failed to load applications' });
  }
});

router.post('/', async (req, res) => {
  try {
    const userId = req.session.userId;
    const { company, role, jobAnalysisId, appliedDate } = req.body;
    if (company === undefined || company === null || role === undefined || role === null) {
      return res.status(400).json({ error: 'company and role required' });
    }

    const appId = `app_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const today = appliedDate || new Date().toISOString().split('T')[0];

    const doc = {
      _id: appId,
      userId,
      jobAnalysisId: jobAnalysisId || null,
      company,
      role,
      appliedDate: today,
      status: 'APPLIED',
      statusHistory: [{ status: 'APPLIED', date: today }],
      rejectionStage: null,
      followUpSent: false,
      followUpDate: null,
      daysSinceApply: 0,
      notes: '',
    };

    await mongo.saveApplication(doc);
    res.status(201).json(doc);
  } catch (err) {
    console.error('Application POST error:', err);
    res.status(500).json({ error: 'Failed to create application' });
  }
});

router.patch('/:appId', async (req, res) => {
  try {
    const userId = req.session.userId;
    const { appId } = req.params;
    const allowed = ['status', 'rejectionStage', 'followUpSent', 'followUpDate', 'notes'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    if (updates.status) {
      const today = new Date().toISOString().split('T')[0];
      const app = await mongo.getApplicationsForUser(userId);
      const existing = app.find((a) => a._id === appId);
      if (existing) {
        const history = [...existing.statusHistory, { status: updates.status, date: today }];
        updates.statusHistory = history;
      }
    }

    updates.daysSinceApply = req.body.daysSinceApply;

    const updated = await mongo.updateApplication(appId, updates);

    const apps = await mongo.getApplicationsForUser(userId);
    const rejections = apps.filter(
      (a) => a.status === 'REJECTED' || a.status === 'NO_RESPONSE'
    );
    if (rejections.length >= 3) {
      const profile = await mongo.getOrCreateProfile(userId);
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
      await mongo.saveRejectionPattern(patternDoc);
    }

    res.json(updated);
  } catch (err) {
    console.error('Application PATCH error:', err);
    res.status(500).json({ error: 'Failed to update application' });
  }
});

router.delete('/:appId', async (req, res) => {
  try {
    const userId = req.session.userId;
    const { appId } = req.params;
    // Idempotent delete — always return 200 even if already gone or userId mismatch
    await mongo.deleteApplication(appId, userId);
    res.json({ success: true });
  } catch (err) {
    console.error('Application DELETE error:', err);
    res.status(500).json({ error: 'Failed to delete application' });
  }
});

router.post('/:appId/follow-up', async (req, res) => {
  try {
    const userId = req.session.userId;
    const { appId } = req.params;
    const apps = await mongo.getApplicationsForUser(userId);
    const app = apps.find((a) => a._id === appId);
    if (!app) return res.status(404).json({ error: 'Application not found' });

    const profile = await mongo.getOrCreateProfile(userId);
    const result = await gemini.draftFollowUpEmail(profile, app);

    await mongo.pushConversationEntry(userId, 'agent', `${result.reply}\n\nSubject: ${result.subject}\n\n${result.body}`);

    res.json({
      subject: result.subject,
      body: result.body,
      reply: result.reply,
    });
  } catch (err) {
    console.error('Follow-up error:', err);
    res.status(500).json({ error: 'Failed to generate follow-up email' });
  }
});

module.exports = router;
