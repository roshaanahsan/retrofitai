const mongoose = require('mongoose');

const AgentDraftSchema = new mongoose.Schema({
  _id: String,
  userId: { type: String, required: true, index: true },
  type: { type: String, enum: ['followup', 'pattern', 'briefing'], default: 'followup' },
  applicationId: { type: String, default: null },
  company: { type: String, default: '' },
  role: { type: String, default: '' },
  subject: { type: String, default: '' },
  body: { type: String, default: '' },
  payload: { type: mongoose.Schema.Types.Mixed, default: null },
  status: { type: String, enum: ['pending', 'sent', 'dismissed'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
  runId: { type: String, default: null },
}, { versionKey: false });

module.exports = mongoose.model('AgentDraft', AgentDraftSchema, 'agent_drafts');
