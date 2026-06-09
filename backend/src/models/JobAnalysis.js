const mongoose = require('mongoose');

const jobAnalysisSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  userId: { type: String, required: true, index: true },
  analyzedAt: { type: Date, default: Date.now },
  jobTitle: { type: String, default: '' },
  company: { type: String, default: '' },
  jobDescriptionRaw: { type: String, required: true },
  matchScore: { type: Number, min: 0, max: 100, default: 0 },
  strongMatches: { type: [String], default: [] },
  gaps: { type: [String], default: [] },
  missingKeywords: { type: [String], default: [] },
  postingAge: { type: Number, default: null },
  verdict: {
    type: String,
    enum: ['APPLY_NOW', 'APPLY_WITH_EDITS', 'SKIP'],
    required: true,
  },
  coverLetterGenerated: { type: Boolean, default: false },
  coverLetterText: { type: String, default: '' },
  coverLetterStrategy: { type: String, default: '' },
}, { _id: false, versionKey: false });

jobAnalysisSchema.set('id', false);

module.exports = mongoose.model('JobAnalysis', jobAnalysisSchema, 'job_analyses');
