const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const mongo = require('../services/mongoService');
const gemini = require('../services/geminiService');

router.post('/analyze', async (req, res) => {
  try {
    const userId = req.session.userId;
    const { jobDescription } = req.body;
    if (!jobDescription) return res.status(400).json({ error: 'jobDescription required' });

    const profile = await mongo.getOrCreateProfile(userId);
    const analysis = await gemini.analyzeJob(profile, jobDescription);

    const jobId = `job_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const doc = {
      _id: jobId,
      userId,
      analyzedAt: new Date(),
      jobTitle: analysis.jobTitle || '',
      company: analysis.company || '',
      jobDescriptionRaw: jobDescription,
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
    await mongo.pushConversationEntry(userId, 'agent', analysis.reply || 'Job analysis complete.');

    res.json({ jobAnalysis: doc, reply: analysis.reply });
  } catch (err) {
    console.error('Job analyze error:', err);
    res.status(500).json({ error: 'Job analysis failed' });
  }
});

router.post('/:jobId/cover-letter', async (req, res) => {
  try {
    const userId = req.session.userId;
    const { jobId } = req.params;

    const [profile, jobAnalysis] = await Promise.all([
      mongo.getOrCreateProfile(userId),
      mongo.getJobAnalysis(jobId),
    ]);

    if (!jobAnalysis || jobAnalysis.userId !== userId) {
      return res.status(404).json({ error: 'Job analysis not found' });
    }

    const result = await gemini.generateCoverLetter(profile, jobAnalysis);

    await mongo.saveJobAnalysis({
      ...jobAnalysis.toObject(),
      coverLetterGenerated: true,
      coverLetterText: result.coverLetterText || '',
      coverLetterStrategy: result.coverLetterStrategy || '',
    });

    await mongo.pushConversationEntry(userId, 'agent', result.reply || 'Cover letter generated.');

    res.json({
      coverLetterText: result.coverLetterText,
      coverLetterStrategy: result.coverLetterStrategy,
      reply: result.reply,
    });
  } catch (err) {
    console.error('Cover letter error:', err);
    res.status(500).json({ error: 'Cover letter generation failed' });
  }
});

router.get('/', async (req, res) => {
  try {
    const analyses = await mongo.getJobAnalysesForUser(req.session.userId);
    res.json(analyses);
  } catch (err) {
    console.error('Jobs GET error:', err);
    res.status(500).json({ error: 'Failed to load job analyses' });
  }
});

module.exports = router;
