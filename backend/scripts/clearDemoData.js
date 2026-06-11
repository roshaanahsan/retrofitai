// Run once: node scripts/clearDemoData.js
// Deletes all demo-user documents so the pipeline/insights show clean state.
require('dotenv').config();
const mongoose = require('mongoose');

const COLLECTIONS = [
  'job_analyses',
  'applications',
  'rejection_patterns',
  'weekly_briefings',
];

async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: 'retrofitai' });
  console.log('Connected to retrofitai');

  for (const col of COLLECTIONS) {
    const result = await mongoose.connection.collection(col).deleteMany({ userId: 'demo-user' });
    console.log(`${col}: deleted ${result.deletedCount} demo-user documents`);
  }

  // Also clear demo-user's conversation history from career_profiles
  const profileResult = await mongoose.connection.collection('career_profiles').updateOne(
    { userId: 'demo-user' },
    { $set: { conversationHistory: [] } },
  );
  console.log(`career_profiles: cleared conversationHistory for ${profileResult.matchedCount} demo-user doc(s)`);

  await mongoose.disconnect();
  console.log('Done.');
}

main().catch((err) => { console.error(err); process.exit(1); });
