const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const mongo = require('../services/mongoService');
const mcp = require('../services/mcpService');
const gemini = require('../services/geminiService');

const ALLOWED_VERDICTS = ['APPLY_NOW', 'APPLY_WITH_EDITS', 'SKIP'];

function normalizeVerdict(raw) {
  const verdict = raw || 'APPLY_WITH_EDITS';
  if (ALLOWED_VERDICTS.includes(verdict)) return verdict;
  console.warn(`[jobs/analyze] Invalid verdict "${raw}", defaulting to APPLY_WITH_EDITS`);
  return 'APPLY_WITH_EDITS';
}

router.post('/analyze', async (req, res) => {
  try {
    const userId = req.session.userId;
    const { jobDescription, bio = '', batchId = '' } = req.body;
    if (!jobDescription) return res.status(400).json({ error: 'jobDescription required' });

    const profile = await mongo.getOrCreateProfile(userId);
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
      verdict: normalizeVerdict(analysis.verdict),
      coverLetterGenerated: false,
      coverLetterText: '',
      coverLetterStrategy: '',
      batchId,
    };

    // Mongoose save is primary — reliable for onboarding batch; MCP mirror is best-effort
    await mongo.saveJobAnalysis(doc);
    if (!batchId) {
      try {
        await mcp.agentPushConversation(userId, 'agent', analysis.reply || 'Job analysis complete.', 'POST /api/jobs/analyze');
      } catch (mcpErr) {
        console.warn('[jobs/analyze] conversation push skipped:', mcpErr.message);
      }
    }
    mcp.agentUpsertJobAnalysis(doc, 'POST /api/jobs/analyze').catch((mcpErr) => {
      console.warn('[jobs/analyze] MCP mirror failed (non-fatal):', mcpErr.message);
    });

    const saved = await mongo.getJobAnalysis(jobId);
    const jobObj = saved?.toObject ? saved.toObject() : { ...doc, analyzedAt: doc.analyzedAt?.toISOString?.() || doc.analyzedAt };
    res.json({ jobAnalysis: jobObj, reply: analysis.reply });
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

    const jobObj = typeof jobAnalysis.toObject === 'function' ? jobAnalysis.toObject() : { ...jobAnalysis };
    await mcp.agentUpsertJobAnalysis({
      ...jobObj,
      coverLetterGenerated: true,
      coverLetterText: result.coverLetterText || '',
      coverLetterStrategy: result.coverLetterStrategy || '',
    }, 'POST /api/jobs/cover-letter');

    await mcp.agentPushConversation(userId, 'agent', result.reply || 'Cover letter generated.', 'POST /api/jobs/cover-letter');

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
    for (let i = 0; i < analyses.length; i += 3) {
      const chunk = analyses.slice(i, i + 3);
      await Promise.allSettled(
        chunk.map(async (job) => {
          if (!job.jobDescriptionRaw) return;
          try {
            const fresh = await gemini.analyzeJob(profile, job.jobDescriptionRaw, '');
            const jobObj = typeof job.toObject === 'function' ? job.toObject() : { ...job };
            await mcp.agentUpsertJobAnalysis({
              ...jobObj,
              matchScore: fresh.matchScore || 0,
              strongMatches: fresh.strongMatches || [],
              gaps: fresh.gaps || [],
              missingKeywords: fresh.missingKeywords || [],
              verdict: normalizeVerdict(fresh.verdict) || job.verdict,
              analyzedAt: new Date(),
            }, 'POST /api/jobs/reanalyze-all');
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

router.get('/resume-gaps', async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) return res.status(401).json({ error: 'No session' });

    const analyses = await mcp.find('job_analyses', { userId });
    const analysisList = Array.isArray(analyses) ? analyses : [];

    const keywordCounts = {};
    const relevant = analysisList.filter((a) => ['APPLY_NOW', 'APPLY_WITH_EDITS'].includes(a.verdict));
    for (const analysis of relevant) {
      for (const kw of (analysis.missingKeywords || [])) {
        keywordCounts[kw] = (keywordCounts[kw] || 0) + 1;
      }
    }
    const topKeywords = Object.entries(keywordCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([keyword, count]) => ({ keyword, count }));

    res.json({ topKeywords, analysisCount: relevant.length });
  } catch (err) {
    console.error('[resume-gaps] error:', err);
    res.status(500).json({ error: 'Failed to get resume gaps' });
  }
});

module.exports = router;
