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

function daysSinceApplied(appliedDate) {
  if (!appliedDate) return 0;
  return Math.floor((Date.now() - new Date(appliedDate).getTime()) / (1000 * 60 * 60 * 24));
}

async function getStaleApplications(userId, thresholdDays = 7) {
  const apps = await getApplicationsForAgent(userId);
  return apps.filter((a) => {
    if (['REJECTED', 'OFFER'].includes(a.status)) return false;
    if (a.followUpSent) return false;
    const days = a.appliedDate ? daysSinceApplied(a.appliedDate) : (a.daysSinceApply || 0);
    return days >= thresholdDays;
  });
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

async function saveAgentDraft(doc) {
  return AgentDraft.findByIdAndUpdate(doc._id, doc, { upsert: true, new: true });
}

function draftDedupeKey(d) {
  if (d.type === 'followup') return `followup:${d.applicationId || d.company || d._id}`;
  if (d.type === 'briefing') return `briefing:${d.role || d._id}`;
  if (d.type === 'pattern') return 'pattern';
  return String(d._id);
}

function dedupeAgentDrafts(drafts) {
  const seen = new Map();
  for (const d of drafts) {
    const key = draftDedupeKey(d);
    const prev = seen.get(key);
    if (!prev || new Date(d.createdAt || 0) > new Date(prev.createdAt || 0)) {
      seen.set(key, d);
    }
  }
  return [...seen.values()].sort(
    (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
  );
}

async function collapseDuplicatePendingDrafts(userId, drafts) {
  const groups = new Map();
  for (const d of drafts) {
    const key = draftDedupeKey(d);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(d);
  }
  const keepIds = new Set();
  const dismissIds = [];
  for (const group of groups.values()) {
    group.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    keepIds.add(String(group[0]._id));
    for (let i = 1; i < group.length; i++) dismissIds.push(String(group[i]._id));
  }
  if (!dismissIds.length) return dedupeAgentDrafts(drafts);
  await AgentDraft.updateMany(
    { _id: { $in: dismissIds }, userId, status: 'pending' },
    { $set: { status: 'dismissed' } },
  );
  try {
    const mcp = require('./mcpService');
    for (const id of dismissIds) {
      await mcp.updateOne('agent_drafts', { _id: id }, { $set: { status: 'dismissed' } }).catch(() => {});
    }
  } catch (err) {
    console.warn('[collapseDuplicatePendingDrafts] MCP cleanup skipped:', err.message);
  }
  return dedupeAgentDrafts(drafts.filter((d) => keepIds.has(String(d._id))));
}

async function getAgentDrafts(userId, status = 'pending') {
  let drafts = await AgentDraft.find({ userId, status }).sort({ createdAt: -1 }).lean();
  try {
    const mcp = require('./mcpService');
    const mcpDrafts = await mcp.find('agent_drafts', { userId, status });
    if (Array.isArray(mcpDrafts) && mcpDrafts.length) {
      const byId = new Map(drafts.map((d) => [String(d._id), d]));
      for (const d of mcpDrafts) byId.set(String(d._id), d);
      drafts = [...byId.values()];
    }
  } catch (err) {
    console.warn('[getAgentDrafts] MCP merge skipped:', err.message);
  }
  if (status === 'pending') {
    return collapseDuplicatePendingDrafts(userId, drafts);
  }
  return dedupeAgentDrafts(drafts);
}

async function getAgentDraftById(draftId, userId) {
  return AgentDraft.findOne({ _id: draftId, userId }).lean();
}

async function updateDraftStatus(draftId, status, userId = null) {
  const updated = await AgentDraft.findByIdAndUpdate(draftId, { $set: { status } }, { new: true });
  try {
    const mcp = require('./mcpService');
    await mcp.updateOne('agent_drafts', { _id: draftId }, { $set: { status } }, { upsert: false });
  } catch (err) {
    console.warn('[updateDraftStatus] MCP mirror failed:', err.message);
  }
  if (status === 'sent' && updated?.type === 'followup' && updated.applicationId) {
    const filter = userId ? { _id: updated.applicationId, userId } : { _id: updated.applicationId };
    await Application.findOneAndUpdate(filter, {
      $set: { followUpSent: true, followUpDate: new Date().toISOString().split('T')[0] },
    });
  }
  return updated;
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

/** Delete all MongoDB data for a user — used when starting a fresh session from landing */
async function clearAllUserData(userId) {
  if (!userId) return { deleted: 0 };

  const results = await Promise.all([
    CareerProfile.deleteOne({ _id: userId }),
    JobAnalysis.deleteMany({ userId }),
    Application.deleteMany({ userId }),
    RejectionPattern.deleteMany({ userId }),
    WeeklyBriefing.deleteMany({ userId }),
    AgentDraft.deleteMany({ userId }),
    AgentRun.deleteMany({ userId }),
  ]);

  const deleted = results.reduce((sum, r) => sum + (r.deletedCount || 0), 0);
  return { deleted };
}

function toPlain(doc) {
  if (!doc) return null;
  return typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
}

/** Merged profile — Mongoose is source of truth; MCP fills gaps if Mongoose doc is sparse */
async function getProfileForAgent(userId) {
  let profile = await getOrCreateProfile(userId);
  let plain = toPlain(profile);
  try {
    const mcp = require('./mcpService');
    const mcpDoc = await mcp.findOne('career_profiles', { _id: userId });
    if (mcpDoc) {
      plain = {
        ...plain,
        ...mcpDoc,
        _id: userId,
        skills: (mcpDoc.skills?.length ? mcpDoc.skills : plain.skills) || [],
        targetRole: mcpDoc.targetRole || plain.targetRole || '',
        currentRole: mcpDoc.currentRole || plain.currentRole || '',
        resumeText: mcpDoc.resumeText || plain.resumeText || '',
      };
      // Sync merged fields back to Mongoose so session-init/dashboard stay consistent
      await CareerProfile.findByIdAndUpdate(userId, {
        $set: {
          skills: plain.skills,
          targetRole: plain.targetRole,
          currentRole: plain.currentRole,
          targetIndustry: mcpDoc.targetIndustry || plain.targetIndustry,
          yearsExperience: mcpDoc.yearsExperience || plain.yearsExperience,
          resumeText: plain.resumeText,
          agentMode: mcpDoc.agentMode || plain.agentMode,
        },
      });
    }
  } catch (err) {
    console.warn('[getProfileForAgent] MCP merge skipped:', err.message);
  }
  return plain;
}

/** Applications for agent — MCP first, Mongoose fallback */
async function getApplicationsForAgent(userId) {
  try {
    const mcp = require('./mcpService');
    const mcpApps = await mcp.find('applications', { userId });
    if (Array.isArray(mcpApps) && mcpApps.length > 0) return mcpApps;
  } catch (err) {
    console.warn('[getApplicationsForAgent] MCP find failed:', err.message);
  }
  const apps = await Application.find({ userId }).sort({ appliedDate: -1 });
  return apps.map(toPlain);
}

/** Job analyses for agent — MCP first, merge Mongoose arrays when MCP docs are sparse */
async function getJobAnalysesForAgent(userId, batchId = null) {
  const mongooseJobs = (await getJobAnalysesForUser(userId, batchId)).map(toPlain);
  const mgById = new Map(mongooseJobs.map((j) => [String(j._id), j]));

  try {
    const mcp = require('./mcpService');
    const filter = batchId ? { userId, batchId } : { userId };
    const mcpJobs = await mcp.find('job_analyses', filter);
    if (Array.isArray(mcpJobs) && mcpJobs.length > 0) {
      return mcpJobs.map((mj) => {
        const mg = mgById.get(String(mj._id));
        if (!mg) return mj;
        const pickArr = (a, b) => (Array.isArray(a) && a.length ? a : (Array.isArray(b) ? b : []));
        return {
          ...mg,
          ...mj,
          strongMatches: pickArr(mj.strongMatches, mg.strongMatches),
          gaps: pickArr(mj.gaps, mg.gaps),
          missingKeywords: pickArr(mj.missingKeywords, mg.missingKeywords),
          matchScore: mj.matchScore ?? mg.matchScore,
          verdict: mj.verdict || mg.verdict,
          company: mj.company || mg.company,
          jobTitle: mj.jobTitle || mg.jobTitle,
        };
      });
    }
  } catch (err) {
    console.warn('[getJobAnalysesForAgent] MCP find failed:', err.message);
  }

  return mongooseJobs;
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
  saveAgentDraft,
  getAgentDrafts,
  getAgentDraftById,
  updateDraftStatus,
  clearOldFollowUpDrafts,
  saveAgentRun,
  getLatestAgentRun,
  getProfileForAgent,
  getApplicationsForAgent,
  getJobAnalysesForAgent,
  clearAllUserData,
  toPlain,
};
