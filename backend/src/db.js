const mongoose = require('mongoose');

let connected = false;

async function connectDB() {
  if (connected) return;
  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: 'retrofitai',
  });
  connected = true;
  console.log('MongoDB connected — retrofitai database');
}

module.exports = { connectDB };
