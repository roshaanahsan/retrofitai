const mongoose = require('mongoose');

const priorityActionSchema = new mongoose.Schema({
  action: { type: String, required: true },
  impact: { type: String, enum: ['HIGH', 'MEDIUM', 'LOW'], default: 'MEDIUM' },
  dueDate: { type: String, default: null },
}, { _id: false });

const weeklyBriefingSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  userId: { type: String, required: true, index: true },
  weekNumber: { type: Number, required: true },
  generatedAt: { type: Date, default: Date.now },
  applicationsSentThisWeek: { type: Number, default: 0 },
  responseRate: { type: Number, default: 0 },
  interviewRate: { type: Number, default: 0 },
  industryAvgResponseRate: { type: Number, default: 0.15 },
  momentumScore: { type: Number, min: 0, max: 100, default: 0 },
  momentumTrend: {
    type: String,
    enum: ['UP', 'DOWN', 'STABLE'],
    default: 'STABLE',
  },
  bestPerformingCategory: { type: String, default: '' },
  worstPerformingCategory: { type: String, default: '' },
  priorityActions: { type: [priorityActionSchema], default: [] },
  pdfGenerated: { type: Boolean, default: false },
  pdfPath: { type: String, default: null },
}, { _id: false, versionKey: false });

weeklyBriefingSchema.set('id', false);

module.exports = mongoose.model('WeeklyBriefing', weeklyBriefingSchema, 'weekly_briefings');
