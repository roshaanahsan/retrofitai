require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { connectDB } = require('./db');
const { configureSession } = require('./middleware/session');

const agentRoutes = require('./routes/agent');
const profileRoutes = require('./routes/profile');
const jobRoutes = require('./routes/jobs');
const applicationRoutes = require('./routes/applications');
const insightRoutes = require('./routes/insights');
const briefingRoutes = require('./routes/briefings');

const app = express();
const PORT = process.env.PORT || 3001;

// Cloud Run terminates TLS at the load balancer; trust X-Forwarded-Proto so
// req.secure = true and express-session sends the Set-Cookie header.
app.set('trust proxy', 1);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.FRONTEND_URL
    : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000'],
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));

configureSession(app);

app.use('/api/agent', agentRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/insights', insightRoutes);
app.use('/api/briefings', briefingRoutes);

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'hireiq-backend' }));

app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

async function start() {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`HireIQ backend running on port ${PORT}`);
  });
}

start().catch(console.error);
