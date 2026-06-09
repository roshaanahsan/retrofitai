const session = require('express-session');
const MongoStore = require('connect-mongo');
const { v4: uuidv4 } = require('uuid');

function configureSession(app) {
  app.use(
    session({
      secret: process.env.SESSION_SECRET || 'hireiq-dev-secret-change-in-prod',
      resave: false,
      saveUninitialized: false,
      store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI,
        dbName: 'hireiq',
        collectionName: 'sessions',
        ttl: 30 * 24 * 60 * 60,
      }),
      cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60 * 1000,
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      },
    })
  );

  app.use((req, _res, next) => {
    if (!req.session.userId) {
      req.session.userId = `user_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    }
    next();
  });
}

module.exports = { configureSession };
