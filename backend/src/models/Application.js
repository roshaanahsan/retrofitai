const mongoose = require('mongoose');

const statusHistorySchema = new mongoose.Schema({
  status: { type: String, required: true },
  date: { type: String, required: true },
}, { _id: false });

const applicationSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  userId: { type: String, required: true, index: true },
  jobAnalysisId: { type: String, default: null },
  company: { type: String, required: true },
  role: { type: String, required: true },
  appliedDate: { type: String, required: true },
  status: {
    type: String,
    enum: ['APPLIED', 'NO_RESPONSE', 'PHONE_SCREEN', 'INTERVIEW', 'OFFER', 'REJECTED'],
    default: 'APPLIED',
  },
  statusHistory: { type: [statusHistorySchema], default: [] },
  rejectionStage: {
    type: String,
    enum: ['NO_RESPONSE', 'PHONE_SCREEN', 'FIRST_INTERVIEW', 'FINAL_ROUND', null],
    default: null,
  },
  followUpSent: { type: Boolean, default: false },
  followUpDate: { type: String, default: null },
  daysSinceApply: { type: Number, default: 0 },
  notes: { type: String, default: '' },
}, { _id: false, versionKey: false });

applicationSchema.set('id', false);

module.exports = mongoose.model('Application', applicationSchema, 'applications');
