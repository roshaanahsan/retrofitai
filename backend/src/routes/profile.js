const express = require('express');
const router = express.Router();
const mongo = require('../services/mongoService');

router.get('/', async (req, res) => {
  try {
    const profile = await mongo.getOrCreateProfile(req.session.userId);
    res.json(profile);
  } catch (err) {
    console.error('Profile GET error:', err);
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

router.patch('/', async (req, res) => {
  try {
    const allowed = [
      'currentRole', 'targetRole', 'targetIndustry', 'yearsExperience',
      'resumeText', 'skills', 'salaryMin', 'salaryMax', 'location',
      'urgency', 'searchStartDate', 'agentMode',
    ];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    const profile = await mongo.updateProfile(req.session.userId, updates);
    res.json(profile);
  } catch (err) {
    console.error('Profile PATCH error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

module.exports = router;
