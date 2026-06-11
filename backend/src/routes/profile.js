const express = require('express');
const router = express.Router();
const mongo = require('../services/mongoService');
const mcp = require('../services/mcpService');
const gemini = require('../services/geminiService');

router.get('/', async (req, res) => {
  try {
    const profile = await mongo.getProfileForAgent(req.session.userId);
    res.json(profile);
  } catch (err) {
    console.error('Profile GET error:', err);
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

router.patch('/', async (req, res) => {
  try {
    const userId = req.session.userId;
    const allowed = [
      'currentRole', 'targetRole', 'targetIndustry', 'yearsExperience',
      'resumeText', 'skills', 'salaryMin', 'salaryMax', 'location',
      'urgency', 'searchStartDate', 'agentMode',
    ];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    const profile = await mongo.updateProfile(userId, updates);
    mcp.agentUpdateProfile(userId, updates, 'PATCH /api/profile').catch((e) => {
      console.warn('[profile PATCH] MCP mirror failed:', e.message);
    });
    res.json(profile);
  } catch (err) {
    console.error('Profile PATCH error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// AI-powered profile extraction from resume text
router.post('/infer-from-resume', async (req, res) => {
  const userId = req.session.userId;
  const { resumeText } = req.body;
  if (!resumeText) return res.status(400).json({ error: 'resumeText required' });
  try {
    const fields = await gemini.extractProfileFromResume(resumeText);
    const updates = { resumeText };
    if (fields.currentRole) updates.currentRole = fields.currentRole;
    if (fields.targetRole) updates.targetRole = fields.targetRole;
    if (fields.targetIndustry) updates.targetIndustry = fields.targetIndustry;
    if (fields.yearsExperience) updates.yearsExperience = fields.yearsExperience;
    if (fields.skills?.length) updates.skills = fields.skills;
    const profile = await mongo.updateProfile(userId, updates);
    mcp.agentUpdateProfile(userId, updates, 'POST /api/profile/infer-from-resume').catch((e) => {
      console.warn('[infer-from-resume] MCP mirror failed:', e.message);
    });
    res.json(profile);
  } catch (err) {
    console.error('Resume inference error:', err);
    res.status(500).json({ error: 'Failed to analyze resume' });
  }
});

module.exports = router;
