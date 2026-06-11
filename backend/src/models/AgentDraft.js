const mongoose = require('mongoose');

const AgentDraftSchema = new mongoose.Schema({
  _id: String,
  userId: { type: String, required: true, index: true },
  applicationId: { type: String, default: null },
  company: { type: String, required: true },
  role: { type: String, default: '' },
  subject: { type: String, required: true },
  body: { type: String, required: true },
  status: { type: String, enum: ['pending', 'sent', 'dismissed'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
  runId: { type: String, default: null },
}, { versionKey: false });

module.exports = mongoose.model('AgentDraft', AgentDraftSchema, 'agent_drafts');
