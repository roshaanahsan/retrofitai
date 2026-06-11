const mongoose = require('mongoose');

const AgentRunSchema = new mongoose.Schema({
  _id: String,
  userId: { type: String, required: true, index: true },
  startedAt: { type: Date, default: Date.now },
  completedAt: { type: Date, default: null },
  durationMs: { type: Number, default: 0 },
  summary: {
    appsScanned: { type: Number, default: 0 },
    staleFound: { type: Number, default: 0 },
    draftsCreated: { type: Number, default: 0 },
    patternUpdated: { type: Boolean, default: false },
    patternConfidence: { type: String, default: null },
    dominantPattern: { type: String, default: null },
    briefingGenerated: { type: Boolean, default: false },
    momentumScore: { type: Number, default: null },
    momentumTrend: { type: String, default: null },
  },
}, { versionKey: false });

module.exports = mongoose.model('AgentRun', AgentRunSchema, 'agent_runs');
