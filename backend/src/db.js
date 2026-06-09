const mongoose = require('mongoose');

let connected = false;

async function connectDB() {
  if (connected) return;
  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: 'hireiq',
  });
  connected = true;
  console.log('MongoDB connected — hireiq database');
}

module.exports = { connectDB };
