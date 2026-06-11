const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const mongo = require('../services/mongoService');
const gemini = require('../services/geminiService');

router.post('/analyze', async (req, res) => {
  try {
    const userId = req.session.userId;
    const { jobDescription, bio = '', batchId = '' } = req.body;
    if (!jobDescription) return res.status(400).json({ error: 'jobDescription required' });

    const profile = await mongo.getOrCreateProfile(userId);
    // Pass bio directly — no race condition, no profile pre-population dependency
    const analysis = await gemini.analyzeJob(profile, jobDescription, bio);

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
      batchId,
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

    if (!jobAnalysis) {
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

// Re-score all existing jobs against the current (updated) profile — in-place update
router.post('/reanalyze-all', async (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ error: 'No session' });
  try {
    const [analyses, profile] = await Promise.all([
      mongo.getJobAnalysesForUser(userId),
      mongo.getOrCreateProfile(userId),
    ]);
    if (!analyses.length) return res.json({ count: 0, total: 0 });

    let done = 0;
    // Process in batches of 3 to stay under Gemini rate limits
    for (let i = 0; i < analyses.length; i += 3) {
      const chunk = analyses.slice(i, i + 3);
      await Promise.allSettled(
        chunk.map(async (job) => {
          if (!job.jobDescriptionRaw) return;
          try {
            const fresh = await gemini.analyzeJob(profile, job.jobDescriptionRaw, '');
            const jobObj = typeof job.toObject === 'function' ? job.toObject() : { ...job };
            await mongo.saveJobAnalysis({
              ...jobObj,
              matchScore: fresh.matchScore || 0,
              strongMatches: fresh.strongMatches || [],
              gaps: fresh.gaps || [],
              missingKeywords: fresh.missingKeywords || [],
              verdict: fresh.verdict || job.verdict,
              analyzedAt: new Date(),
            });
            done++;
          } catch { /* skip on error */ }
        })
      );
    }
    res.json({ count: done, total: analyses.length });
  } catch (err) {
    console.error('[reanalyze-all] error:', err);
    res.status(500).json({ error: 'Re-analysis failed' });
  }
});

router.get('/', async (req, res) => {
  try {
    const { batchId } = req.query;
    const analyses = await mongo.getJobAnalysesForUser(req.session.userId, batchId || null);
    res.json(analyses);
  } catch (err) {
    console.error('Jobs GET error:', err);
    res.status(500).json({ error: 'Failed to load job analyses' });
  }
});

module.exports = router;
