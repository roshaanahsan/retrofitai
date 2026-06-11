const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const path = require('path');

let mcpClient = null;
let connecting = false;
let connectPromise = null;

const MCP_SERVER_PATH = path.join(
  __dirname,
  '../../node_modules/@mongodb-js/mongodb-mcp-server/dist/index.js'
);

async function getClient() {
  if (mcpClient) return mcpClient;
  if (connectPromise) return connectPromise;

  connectPromise = (async () => {
    const transport = new StdioClientTransport({
      command: 'node',
      args: [MCP_SERVER_PATH],
      env: {
        ...process.env,
        MDB_MCP_CONNECTION_STRING: process.env.MONGODB_URI,
      },
    });

    const client = new Client({ name: 'retrofitai-agent', version: '1.0.0' });
    await client.connect(transport);
    mcpClient = client;
    console.log('MongoDB MCP server connected');
    return client;
  })();

  return connectPromise;
}

let mcpQueue = Promise.resolve();

function enqueueMcp(task) {
  const run = mcpQueue.then(task, task);
  mcpQueue = run.catch(() => {});
  return run;
}

async function callTool(toolName, args) {
  return enqueueMcp(async () => {
    const client = await getClient();
    const result = await client.callTool({ name: toolName, arguments: args });
    if (result.isError) {
      throw new Error(`MCP tool error: ${JSON.stringify(result.content)}`);
    }
    const text = result.content?.find((c) => c.type === 'text')?.text;
    try {
      return JSON.parse(text || '[]');
    } catch {
      return text;
    }
  });
}

// Convenience wrappers matching the MongoDB MCP server tool signatures
async function find(collection, filter = {}, options = {}) {
  console.log(`[MCP] find → ${collection}`, JSON.stringify(filter));
  const result = await callTool('find', {
    collection,
    database: 'retrofitai',
    filter,
    limit: options.limit || 100,
    projection: options.projection || {},
  });
  console.log(`[MCP] find ← ${collection}: ${Array.isArray(result) ? result.length : 0} doc(s)`);
  return result;
}

async function findOne(collection, filter = {}) {
  const doc = await find(collection, filter, { limit: 1 });
  return Array.isArray(doc) ? doc[0] || null : null;
}

async function insertOne(collection, document) {
  console.log(`[MCP] insert-one → ${collection}`, document._id || '(new doc)');
  const result = await callTool('insert-one', {
    collection,
    database: 'retrofitai',
    document,
  });
  console.log(`[MCP] insert-one ← ${collection}: ok`);
  return result;
}

async function updateOne(collection, filter, update, options = {}) {
  console.log(`[MCP] update-one → ${collection}`, JSON.stringify(filter));
  const result = await callTool('update-one', {
    collection,
    database: 'retrofitai',
    filter,
    update,
    upsert: options.upsert !== false,
  });
  console.log(`[MCP] update-one ← ${collection}: ok`);
  return result;
}

async function deleteOne(collection, filter) {
  console.log(`[MCP] delete-one → ${collection}`, JSON.stringify(filter));
  const result = await callTool('delete-one', {
    collection,
    database: 'retrofitai',
    filter,
  });
  console.log(`[MCP] delete-one ← ${collection}: ok`);
  return result;
}

async function count(collection, filter = {}) {
  console.log(`[MCP] count → ${collection}`, JSON.stringify(filter));
  return callTool('count', {
    collection,
    database: 'retrofitai',
    query: filter,
  });
}

async function aggregate(collection, pipeline) {
  console.log(`[MCP] aggregate → ${collection}`);
  return callTool('aggregate', {
    collection,
    database: 'retrofitai',
    pipeline,
  });
}

// ─── Agent write helpers (all agent-triggered persistence goes through MCP) ───

function serializeDoc(doc) {
  const out = { ...doc };
  for (const key of Object.keys(out)) {
    if (out[key] instanceof Date) out[key] = out[key].toISOString();
  }
  return out;
}

async function ensureProfile(userId, via) {
  const existing = await findOne('career_profiles', { _id: userId });
  if (existing) return existing;
  console.log(`[MCP] agent write via ${via} → career_profiles create`);
  const doc = {
    _id: userId,
    agentMode: 'NEW_USER',
    skills: [],
    conversationHistory: [],
    createdAt: new Date().toISOString(),
    lastActive: new Date().toISOString(),
  };
  await insertOne('career_profiles', doc);
  return doc;
}

async function agentUpdateProfile(userId, updates, via) {
  await ensureProfile(userId, via);
  console.log(`[MCP] agent write via ${via} → career_profiles update`);
  await updateOne('career_profiles', { _id: userId }, { $set: serializeDoc(updates) });
  return findOne('career_profiles', { _id: userId });
}

async function agentPushConversation(userId, role, text, via) {
  await ensureProfile(userId, via);
  console.log(`[MCP] agent write via ${via} → career_profiles conversationHistory`);
  await updateOne('career_profiles', { _id: userId }, {
    $push: { conversationHistory: { role, text, timestamp: new Date().toISOString() } },
    $set: { lastActive: new Date().toISOString() },
  });
}

async function agentUpsertJobAnalysis(doc, via) {
  const serialized = serializeDoc(doc);
  console.log(`[MCP] agent write via ${via} → job_analyses upsert`);
  await updateOne('job_analyses', { _id: doc._id }, { $set: serialized }, { upsert: true });
  return serialized;
}

async function agentInsertApplication(doc, via) {
  const serialized = serializeDoc(doc);
  console.log(`[MCP] agent write via ${via} → applications insert`);
  await insertOne('applications', serialized);
  return serialized;
}

async function agentInsertPatternDraft(userId, patternDoc, via, runId = null) {
  const payload = serializeDoc(patternDoc);
  const draft = {
    _id: `draft_pattern_${Date.now()}_${userId.slice(-8)}`,
    userId,
    type: 'pattern',
    company: 'Rejection Analysis',
    role: payload.dominantPattern || '',
    subject: `Pattern: ${String(payload.dominantPattern || 'analysis').replace(/_/g, ' ')}`,
    body: [
      payload.insight,
      '',
      'Recommended actions:',
      ...(payload.recommendedActions || []).map((a) => `• ${a}`),
    ].filter(Boolean).join('\n'),
    payload,
    status: 'pending',
    runId,
    createdAt: new Date().toISOString(),
  };
  console.log(`[MCP] agent write via ${via} → agent_drafts pattern draft`);
  await insertOne('agent_drafts', draft);
  return draft;
}

// Gemini tool definitions — these are what Gemini "sees" as available tools
const GEMINI_TOOL_DECLARATIONS = [
  {
    name: 'read_career_profile',
    description: 'Read the user\'s career profile from MongoDB. Use this to get current role, target role, skills, experience, and search status.',
    parameters: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'The user ID to fetch profile for' },
      },
      required: ['userId'],
    },
  },
  {
    name: 'read_applications',
    description: 'Read all job applications for the user from MongoDB. Returns application status, company, role, and days since applying.',
    parameters: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'The user ID' },
        statusFilter: { type: 'string', description: 'Optional status filter (APPLIED, NO_RESPONSE, PHONE_SCREEN, INTERVIEW, OFFER, REJECTED)' },
      },
      required: ['userId'],
    },
  },
  {
    name: 'read_rejection_pattern',
    description: 'Read the current rejection pattern analysis from MongoDB. Available after 2+ rejections.',
    parameters: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'The user ID' },
      },
      required: ['userId'],
    },
  },
  {
    name: 'read_job_analyses',
    description: 'Read all job analyses for the user from MongoDB — match scores, gaps, verdicts, missing keywords.',
    parameters: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'The user ID' },
      },
      required: ['userId'],
    },
  },
  {
    name: 'read_weekly_briefing',
    description: 'Read the latest weekly momentum briefing from MongoDB — momentum score, trends, priority actions.',
    parameters: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'The user ID' },
      },
      required: ['userId'],
    },
  },
  {
    name: 'update_career_profile',
    description: 'Update the user\'s career profile in MongoDB with new information collected during intake or updates.',
    parameters: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'The user ID' },
        updates: {
          type: 'object',
          description: 'Fields to update: currentRole, targetRole, targetIndustry, yearsExperience, skills (array), salaryMin, salaryMax, location, urgency, resumeText, agentMode',
        },
      },
      required: ['userId', 'updates'],
    },
  },
  {
    name: 'save_rejection_pattern',
    description: 'Save or update the rejection pattern analysis in MongoDB.',
    parameters: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'The user ID' },
        pattern: {
          type: 'object',
          description: 'Pattern data: dominantPattern, patternConfidence, insight, recommendedActions, missingKeywordsAcrossRejections',
        },
      },
      required: ['userId', 'pattern'],
    },
  },
  {
    name: 'save_weekly_briefing',
    description: 'Save a weekly briefing as a pending agent draft (requires user approval).',
    parameters: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'The user ID' },
        briefing: {
          type: 'object',
          description: 'Briefing data: weekNumber, momentumScore, momentumTrend, priorityActions, etc.',
        },
      },
      required: ['userId', 'briefing'],
    },
  },
  {
    name: 'save_job_analysis',
    description: 'Save or update a job analysis document in MongoDB.',
    parameters: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'The user ID' },
        jobAnalysis: { type: 'object', description: 'Full job analysis document' },
      },
      required: ['userId', 'jobAnalysis'],
    },
  },
  {
    name: 'save_application',
    description: 'Insert a job application record in MongoDB.',
    parameters: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'The user ID' },
        application: { type: 'object', description: 'Application document' },
      },
      required: ['userId', 'application'],
    },
  },
  {
    name: 'append_conversation_entry',
    description: 'Append a message to the user conversation history on their career profile.',
    parameters: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'The user ID' },
        role: { type: 'string', description: 'user or agent' },
        text: { type: 'string', description: 'Message text' },
      },
      required: ['userId', 'role', 'text'],
    },
  },
];

// Execute a Gemini tool call via MongoDB MCP
async function executeGeminiTool(toolName, toolArgs) {
  switch (toolName) {
    case 'read_career_profile': {
      const mongo = require('./mongoService');
      const profile = await mongo.getProfileForAgent(toolArgs.userId);
      return profile || { error: 'Profile not found' };
    }

    case 'read_applications': {
      const mongo = require('./mongoService');
      let apps = await mongo.getApplicationsForAgent(toolArgs.userId);
      if (toolArgs.statusFilter) {
        apps = apps.filter((a) => a.status === toolArgs.statusFilter);
      }
      return apps;
    }

    case 'read_rejection_pattern': {
      const mongo = require('./mongoService');
      const pattern = await mongo.getRejectionPattern(toolArgs.userId);
      if (!pattern) return { error: 'No pattern available yet' };
      return typeof pattern.toObject === 'function' ? pattern.toObject() : pattern;
    }

    case 'read_job_analyses': {
      const mongo = require('./mongoService');
      const jobs = await mongo.getJobAnalysesForAgent(toolArgs.userId);
      return jobs.map((j) => ({
        company: j.company,
        jobTitle: j.jobTitle,
        matchScore: j.matchScore,
        verdict: j.verdict,
        strongMatches: j.strongMatches || [],
        gaps: j.gaps || [],
        missingKeywords: j.missingKeywords || [],
        coverLetterGenerated: !!j.coverLetterGenerated,
      }));
    }

    case 'read_weekly_briefing': {
      const mongo = require('./mongoService');
      const briefing = await mongo.getLatestWeeklyBriefing(toolArgs.userId);
      if (!briefing) return { error: 'No weekly briefing yet' };
      return typeof briefing.toObject === 'function' ? briefing.toObject() : briefing;
    }

    case 'update_career_profile': {
      const mongo = require('./mongoService');
      const profile = await mongo.updateProfile(toolArgs.userId, toolArgs.updates);
      agentUpdateProfile(toolArgs.userId, toolArgs.updates, 'tool:update_career_profile').catch((e) => {
        console.warn('[update_career_profile] MCP mirror failed:', e.message);
      });
      return { success: true, profile };
    }

    case 'save_rejection_pattern': {
      const { userId, pattern } = toolArgs;
      const draft = await agentInsertPatternDraft(
        userId,
        { ...pattern, userId, _id: pattern._id || `pattern_${userId}` },
        'tool:save_rejection_pattern',
      );
      return { success: true, pendingApproval: true, draftId: draft._id };
    }

    case 'save_weekly_briefing': {
      const { userId, briefing } = toolArgs;
      const payload = serializeDoc({ ...briefing, userId, _id: briefing._id || `brief_${userId}_week${briefing.weekNumber}` });
      const draft = {
        _id: `draft_briefing_tool_${userId}_week${briefing.weekNumber}`,
        userId,
        type: 'briefing',
        company: 'Weekly Briefing',
        role: `Week ${briefing.weekNumber}`,
        subject: `Week ${briefing.weekNumber} briefing`,
        body: (payload.priorityActions || []).map((a) => `• ${a.action || a}`).join('\n'),
        payload,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };
      console.log('[MCP] agent write via tool:save_weekly_briefing → agent_drafts briefing draft');
      await insertOne('agent_drafts', draft);
      return { success: true, pendingApproval: true, draftId: draft._id };
    }

    case 'save_job_analysis': {
      const { jobAnalysis } = toolArgs;
      await agentUpsertJobAnalysis(jobAnalysis, 'tool:save_job_analysis');
      return { success: true };
    }

    case 'save_application': {
      const { application } = toolArgs;
      await agentInsertApplication(application, 'tool:save_application');
      return { success: true };
    }

    case 'append_conversation_entry': {
      const { userId, role, text } = toolArgs;
      await agentPushConversation(userId, role, text, 'tool:append_conversation_entry');
      return { success: true };
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

module.exports = {
  getClient,
  find,
  findOne,
  insertOne,
  updateOne,
  deleteOne,
  count,
  aggregate,
  serializeDoc,
  ensureProfile,
  agentUpdateProfile,
  agentPushConversation,
  agentUpsertJobAnalysis,
  agentInsertApplication,
  agentInsertPatternDraft,
  GEMINI_TOOL_DECLARATIONS,
  executeGeminiTool,
};
