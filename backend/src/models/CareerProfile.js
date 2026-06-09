const mongoose = require('mongoose');

const conversationEntrySchema = new mongoose.Schema({
  role: { type: String, enum: ['user', 'agent'], required: true },
  text: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
}, { _id: false });

const careerProfileSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  lastActive: { type: Date, default: Date.now },
  currentRole: { type: String, default: '' },
  targetRole: { type: String, default: '' },
  targetIndustry: { type: String, default: '' },
  yearsExperience: { type: Number, default: 0 },
  resumeText: { type: String, default: '' },
  skills: { type: [String], default: [] },
  salaryMin: { type: Number, default: 0 },
  salaryMax: { type: Number, default: 0 },
  location: { type: String, default: '' },
  urgency: {
    type: String,
    enum: ['immediate', 'moderate', 'exploring'],
    default: 'moderate',
  },
  searchStartDate: { type: String, default: '' },
  agentMode: {
    type: String,
    enum: ['NEW_USER', 'PROFILE_COMPLETE', 'ACTIVE_SEARCH', 'RETURNING_USER'],
    default: 'NEW_USER',
  },
  intakeStep: { type: Number, default: 0 },
  conversationHistory: { type: [conversationEntrySchema], default: [] },
}, { _id: false, versionKey: false });

careerProfileSchema.set('id', false);

module.exports = mongoose.model('CareerProfile', careerProfileSchema, 'career_profiles');
