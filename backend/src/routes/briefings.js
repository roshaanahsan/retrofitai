const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const mongo = require('../services/mongoService');
const gemini = require('../services/geminiService');

router.get('/latest', async (req, res) => {
  try {
    const briefing = await mongo.getLatestWeeklyBriefing(req.session.userId);
    if (!briefing) return res.json({ available: false });
    res.json({ available: true, briefing });
  } catch (err) {
    console.error('Briefing GET error:', err);
    res.status(500).json({ error: 'Failed to load briefing' });
  }
});

router.post('/generate', async (req, res) => {
  try {
    const userId = req.session.userId;
    const [profile, apps, pattern] = await Promise.all([
      mongo.getOrCreateProfile(userId),
      mongo.getApplicationsForUser(userId),
      mongo.getRejectionPattern(userId),
    ]);

    const result = await gemini.generateWeeklyBriefingContent(profile, apps, pattern);

    const now = new Date();
    const weekNumber = getISOWeek(now);
    const briefingId = `brief_${userId}_week${weekNumber}`;

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const weeklyApps = apps.filter((a) => new Date(a.appliedDate) >= oneWeekAgo);
    const responded = apps.filter((a) => !['APPLIED', 'NO_RESPONSE'].includes(a.status));
    const interviewed = apps.filter((a) => ['INTERVIEW', 'OFFER'].includes(a.status));

    const responseRate = apps.length > 0 ? responded.length / apps.length : 0;
    const interviewRate = apps.length > 0 ? interviewed.length / apps.length : 0;
    // Fallback momentum score computed from real data when Gemini returns 0 or fails
    const computedScore = Math.round(
      Math.min(responseRate * 100 * 1.1, 45) +
      Math.min(interviewRate * 100 * 2, 30) +
      Math.min(weeklyApps.length * 5, 20) +
      (apps.length >= 5 ? 5 : 0)
    );
    const aiScore = typeof result.momentumScore === 'number' && result.momentumScore > 0
      ? result.momentumScore
      : computedScore;

    const defaultActions = [
      { action: 'Follow up on applications older than 7 days', impact: 'HIGH', dueDate: null },
      { action: 'Apply to 3–5 new roles matching your target', impact: 'HIGH', dueDate: null },
      { action: 'Update your resume with missing keywords from rejections', impact: 'MEDIUM', dueDate: null },
    ];

    const doc = {
      _id: briefingId,
      userId,
      weekNumber,
      generatedAt: now,
      applicationsSentThisWeek: weeklyApps.length,
      responseRate,
      interviewRate,
      industryAvgResponseRate: 0.15,
      momentumScore: aiScore,
      momentumTrend: result.momentumTrend || 'STABLE',
      bestPerformingCategory: result.bestPerformingCategory || '',
      worstPerformingCategory: result.worstPerformingCategory || '',
      priorityActions: (Array.isArray(result.priorityActions) && result.priorityActions.length > 0)
        ? result.priorityActions
        : defaultActions,
      pdfGenerated: false,
      pdfPath: null,
    };

    await mongo.saveWeeklyBriefing(doc);
    await mongo.pushConversationEntry(userId, 'agent', result.reply || 'Weekly briefing generated.');

    res.json({ briefing: doc, reply: result.reply });
  } catch (err) {
    console.error('Briefing generate error:', err);
    res.status(500).json({ error: 'Briefing generation failed' });
  }
});

router.get('/download/:briefingId', async (req, res) => {
  try {
    const userId = req.session.userId;
    const { briefingId } = req.params;
    const [profile, apps] = await Promise.all([
      mongo.getOrCreateProfile(userId),
      mongo.getApplicationsForUser(userId),
    ]);

    const briefing = await mongo.getLatestWeeklyBriefing(userId);
    if (!briefing) return res.status(404).json({ error: 'Briefing not found' });

    const pdf = new PDFDocument({ margin: 50, size: 'LETTER' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="retrofitai-briefing-week${briefing.weekNumber}.pdf"`);
    pdf.pipe(res);

    pdf.font('Helvetica-Bold').fontSize(22).fillColor('#1a1a2e').text('RetrofitAI', { continued: true });
    pdf.font('Helvetica').fontSize(22).fillColor('#6366f1').text(' Weekly Strategy Briefing');
    pdf.moveDown(0.3);
    pdf.font('Helvetica').fontSize(11).fillColor('#71717a')
      .text(`Week ${briefing.weekNumber} — Generated ${new Date(briefing.generatedAt).toLocaleDateString()}`);
    pdf.moveDown(0.5);
    pdf.moveTo(50, pdf.y).lineTo(560, pdf.y).strokeColor('#3f3f46').lineWidth(1).stroke();
    pdf.moveDown(0.8);

    pdf.font('Helvetica-Bold').fontSize(13).fillColor('#1a1a2e').text('SEARCH OVERVIEW');
    pdf.moveDown(0.4);

    const stats = [
      ['Applications This Week', briefing.applicationsSentThisWeek],
      ['Response Rate', `${(briefing.responseRate * 100).toFixed(0)}% (industry avg: 15%)`],
      ['Interview Rate', `${(briefing.interviewRate * 100).toFixed(0)}%`],
      ['Momentum Score', `${briefing.momentumScore}/100 — ${briefing.momentumTrend}`],
    ];
    for (const [label, value] of stats) {
      pdf.font('Helvetica-Bold').fontSize(11).fillColor('#6366f1').text(`${label}: `, { continued: true });
      pdf.font('Helvetica').fontSize(11).fillColor('#1a1a2e').text(String(value));
    }

    pdf.moveDown(0.8);
    pdf.font('Helvetica-Bold').fontSize(13).fillColor('#1a1a2e').text('PRIORITY ACTIONS THIS WEEK');
    pdf.moveDown(0.4);
    briefing.priorityActions.forEach((action, i) => {
      pdf.font('Helvetica-Bold').fontSize(11).fillColor('#6366f1').text(`${i + 1}. `, { continued: true });
      pdf.font('Helvetica').fontSize(11).fillColor('#1a1a2e').text(action.action, { continued: true });
      pdf.font('Helvetica').fontSize(10).fillColor('#71717a').text(`  [${action.impact}]`);
    });

    pdf.moveDown(0.8);
    pdf.font('Helvetica-Bold').fontSize(13).fillColor('#1a1a2e').text('ACTIVE APPLICATIONS');
    pdf.moveDown(0.4);
    const activeApps = apps.filter((a) => !['REJECTED'].includes(a.status)).slice(0, 10);
    for (const app of activeApps) {
      pdf.font('Helvetica-Bold').fontSize(11).fillColor('#1a1a2e').text(`${app.company} — ${app.role}`, { continued: true });
      pdf.font('Helvetica').fontSize(10).fillColor('#71717a').text(`  ${app.status} (${app.daysSinceApply}d)`);
    }

    pdf.moveDown(1.5);
    pdf.font('Helvetica').fontSize(9).fillColor('#a1a1aa')
      .text('RetrofitAI provides career guidance and organizational assistance. It is not a licensed career counselor or employment advisor.', {
        align: 'center',
      });

    pdf.end();

    await mongo.saveWeeklyBriefing({ ...briefing.toObject(), pdfGenerated: true });
  } catch (err) {
    console.error('PDF download error:', err);
    res.status(500).json({ error: 'PDF generation failed' });
  }
});

function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

module.exports = router;
