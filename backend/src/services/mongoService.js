const CareerProfile = require('../models/CareerProfile');
const JobAnalysis = require('../models/JobAnalysis');
const Application = require('../models/Application');
const RejectionPattern = require('../models/RejectionPattern');
const WeeklyBriefing = require('../models/WeeklyBriefing');

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

async function getJobAnalysesForUser(userId) {
  return JobAnalysis.find({ userId }).sort({ analyzedAt: -1 });
}

async function saveApplication(doc) {
  return Application.findByIdAndUpdate(doc._id, doc, { upsert: true, new: true });
}

async function updateApplication(appId, updates) {
  return Application.findByIdAndUpdate(appId, { $set: updates }, { new: true });
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
  getStaleApplications,
  getRejectionPattern,
  saveRejectionPattern,
  getLatestWeeklyBriefing,
  saveWeeklyBriefing,
  applyMongoUpdate,
};
