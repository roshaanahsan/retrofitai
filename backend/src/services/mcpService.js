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

    const client = new Client({ name: 'hireiq-agent', version: '1.0.0' });
    await client.connect(transport);
    mcpClient = client;
    console.log('MongoDB MCP server connected');
    return client;
  })();

  return connectPromise;
}

async function callTool(toolName, args) {
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
}

// Convenience wrappers matching the MongoDB MCP server tool signatures
async function find(collection, filter = {}, options = {}) {
  return callTool('find', {
    collection,
    database: 'hireiq',
    filter,
    limit: options.limit || 100,
    projection: options.projection || {},
  });
}

async function findOne(collection, filter = {}) {
  const results = await find(collection, filter, { limit: 1 });
  return Array.isArray(results) ? results[0] || null : null;
}

async function insertOne(collection, document) {
  return callTool('insert-one', {
    collection,
    database: 'hireiq',
    document,
  });
}

async function updateOne(collection, filter, update) {
  return callTool('update-one', {
    collection,
    database: 'hireiq',
    filter,
    update,
    upsert: true,
  });
}

async function count(collection, filter = {}) {
  return callTool('count', {
    collection,
    database: 'hireiq',
    query: filter,
  });
}

async function aggregate(collection, pipeline) {
  return callTool('aggregate', {
    collection,
    database: 'hireiq',
    pipeline,
  });
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
    description: 'Read the current rejection pattern analysis from MongoDB. Available after 3+ rejections.',
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
];

// Execute a Gemini tool call via MongoDB MCP
async function executeGeminiTool(toolName, toolArgs) {
  switch (toolName) {
    case 'read_career_profile': {
      const profile = await findOne('career_profiles', { _id: toolArgs.userId });
      return profile || { error: 'Profile not found' };
    }

    case 'read_applications': {
      const filter = { userId: toolArgs.userId };
      if (toolArgs.statusFilter) filter.status = toolArgs.statusFilter;
      const apps = await find('applications', filter);
      return apps || [];
    }

    case 'read_rejection_pattern': {
      const pattern = await findOne('rejection_patterns', { userId: toolArgs.userId });
      return pattern || { error: 'No pattern available yet' };
    }

    case 'update_career_profile': {
      const result = await updateOne(
        'career_profiles',
        { _id: toolArgs.userId },
        { $set: toolArgs.updates }
      );
      return { success: true, result };
    }

    case 'save_rejection_pattern': {
      const { userId, pattern } = toolArgs;
      const result = await updateOne(
        'rejection_patterns',
        { userId },
        {
          $set: {
            ...pattern,
            userId,
            _id: `pattern_${userId}`,
            lastCalculated: new Date().toISOString(),
          },
        }
      );
      return { success: true, result };
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
  count,
  aggregate,
  GEMINI_TOOL_DECLARATIONS,
  executeGeminiTool,
};
