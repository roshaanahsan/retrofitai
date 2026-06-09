const mongoose = require('mongoose');

const rejectionBreakdownSchema = new mongoose.Schema({
  noResponse: { type: Number, default: 0 },
  phoneScreen: { type: Number, default: 0 },
  firstInterview: { type: Number, default: 0 },
  finalRound: { type: Number, default: 0 },
}, { _id: false });

const rejectionPatternSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  userId: { type: String, required: true, unique: true },
  lastCalculated: { type: Date, default: Date.now },
  totalApplications: { type: Number, default: 0 },
  totalRejections: { type: Number, default: 0 },
  rejectionBreakdown: { type: rejectionBreakdownSchema, default: () => ({}) },
  dominantPattern: {
    type: String,
    enum: ['PRE_INTERVIEW', 'POST_INTERVIEW', 'FINAL_ROUND', 'INSUFFICIENT_DATA'],
    default: 'INSUFFICIENT_DATA',
  },
  patternConfidence: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH'],
    default: 'LOW',
  },
  insight: { type: String, default: '' },
  recommendedActions: { type: [String], default: [] },
  missingKeywordsAcrossRejections: { type: [String], default: [] },
}, { _id: false, versionKey: false });

rejectionPatternSchema.set('id', false);

module.exports = mongoose.model('RejectionPattern', rejectionPatternSchema, 'rejection_patterns');
