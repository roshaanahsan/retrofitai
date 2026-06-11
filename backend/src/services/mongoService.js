const CareerProfile = require('../models/CareerProfile');
const JobAnalysis = require('../models/JobAnalysis');
const Application = require('../models/Application');
const RejectionPattern = require('../models/RejectionPattern');
const WeeklyBriefing = require('../models/WeeklyBriefing');
const AgentDraft = require('../models/AgentDraft');
const AgentRun = require('../models/AgentRun');

async function getOrCreateProfile(userId) {
  let profile = await CareerProfile.findById(userId);
  if (!profile) {
    profile = await CareerProfile.create({ _id: userId });
  }
  return profile;
}

async function updateProfile(userId, updates) {
  return CareerProfile.findByIdAndUpdate(userId, { $set: updates }, { new: true });
}

async function pushConversationEntry(userId, role, text) {
  return CareerProfile.findByIdAndUpdate(
    userId,
    {
      $push: { conversationHistory: { role, text, timestamp: new Date() } },
      $set: { lastActive: new Date() },
    },
    { new: true }
  );
}

async function saveJobAnalysis(doc) {
  return JobAnalysis.findByIdAndUpdate(doc._id, doc, { upsert: true, new: true });
}

async function getJobAnalysis(jobId) {
  return JobAnalysis.findById(jobId);
}

async function getJobAnalysesForUser(userId, batchId = null) {
  // Allow batchId-only lookup when userId is null (handles session store failures)
  if (batchId && !userId) {
    return JobAnalysis.find({ batchId }).sort({ analyzedAt: -1 });
  }
  const query = batchId ? { userId, batchId } : { userId };
  return JobAnalysis.find(query).sort({ analyzedAt: -1 });
}

async function saveApplication(doc) {
  return Application.findByIdAndUpdate(doc._id, doc, { upsert: true, new: true });
}

async function updateApplication(appId, updates) {
  return Application.findByIdAndUpdate(appId, { $set: updates }, { new: true });
}

async function deleteApplication(appId, userId) {
  return Application.findOneAndDelete({ _id: appId, userId });
}

async function getApplicationsForUser(userId) {
  return Application.find({ userId }).sort({ appliedDate: -1 });
}

async function getStaleApplications(userId, thresholdDays = 7) {
  const apps = await Application.find({
    userId,
    status: { $in: ['APPLIED', 'NO_RESPONSE'] },
  });
  return apps.filter((a) => a.daysSinceApply >= thresholdDays);
}

async function getRejectionPattern(userId) {
  return RejectionPattern.findOne({ userId });
}

async function saveRejectionPattern(doc) {
  return RejectionPattern.findByIdAndUpdate(doc._id, doc, { upsert: true, new: true });
}

async function getLatestWeeklyBriefing(userId) {
  return WeeklyBriefing.findOne({ userId }).sort({ weekNumber: -1 });
}

async function saveWeeklyBriefing(doc) {
  return WeeklyBriefing.findByIdAndUpdate(doc._id, doc, { upsert: true, new: true });
}

async function findApplicationByCompany(userId, companyName) {
  const apps = await Application.find({ userId });
  const needle = companyName.toLowerCase().replace(/[^a-z0-9]/g, '');
  return (
    apps.find((a) => {
      const hay = a.company.toLowerCase().replace(/[^a-z0-9]/g, '');
      return hay.includes(needle) || needle.includes(hay);
    }) || null
  );
}

async function applyMongoUpdate(mongoUpdate) {
  if (!mongoUpdate || !mongoUpdate.collection) return;
  const models = {
    career_profiles: CareerProfile,
    job_analyses: JobAnalysis,
    applications: Application,
    rejection_patterns: RejectionPattern,
    weekly_briefings: WeeklyBriefing,
  };
  const Model = models[mongoUpdate.collection];
  if (!Model) return;

  if (mongoUpdate.operation === 'update') {
    await Model.findOneAndUpdate(mongoUpdate.filter, { $set: mongoUpdate.data }, { upsert: true });
  } else if (mongoUpdate.operation === 'insert') {
    await Model.create(mongoUpdate.data);
  }
}

// ─── Agent Drafts ─────────────────────────────────────────────────────────────

async function saveFollowUpDraft(userId, applicationId, company, role, subject, body, runId) {
  const crypto = require('crypto');
  const id = `draft_${crypto.randomBytes(6).toString('hex')}`;
  return AgentDraft.create({ _id: id, userId, applicationId, company, role, subject, body, runId, status: 'pending' });
}

async function getAgentDrafts(userId, status = 'pending') {
  return AgentDraft.find({ userId, status }).sort({ createdAt: -1 });
}

async function updateDraftStatus(draftId, status) {
  return AgentDraft.findByIdAndUpdate(draftId, { $set: { status } }, { new: true });
}

async function clearOldFollowUpDrafts(userId) {
  return AgentDraft.updateMany({ userId, status: 'pending' }, { $set: { status: 'dismissed' } });
}

// ─── Agent Runs ───────────────────────────────────────────────────────────────

async function saveAgentRun(doc) {
  return AgentRun.findByIdAndUpdate(doc._id, doc, { upsert: true, new: true });
}

async function getLatestAgentRun(userId) {
  return AgentRun.findOne({ userId }).sort({ startedAt: -1 });
}

module.exports = {
  getOrCreateProfile,
  updateProfile,
  pushConversationEntry,
  saveJobAnalysis,
  getJobAnalysis,
  getJobAnalysesForUser,
  saveApplication,
  updateApplication,
  getApplicationsForUser,
  findApplicationByCompany,
  deleteApplication,
  getStaleApplications,
  getRejectionPattern,
  saveRejectionPattern,
  getLatestWeeklyBriefing,
  saveWeeklyBriefing,
  applyMongoUpdate,
  saveFollowUpDraft,
  getAgentDrafts,
  updateDraftStatus,
  clearOldFollowUpDrafts,
  saveAgentRun,
  getLatestAgentRun,
};
