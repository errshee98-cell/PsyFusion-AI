const express = require('express');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const env = require('./config/env');
const logger = require('./utils/logger');
const { applySecurityMiddleware } = require('./middleware/security');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/authRoutes');
const communityRoutes = require('./routes/communityRoutes');
const screeningRoutes = require('./routes/screeningRoutes');

function createApp() {
  const app = express();

  applySecurityMiddleware(app);

  app.use(express.json({ limit: '100kb' })); // small limit: this API shouldn't need large bodies
  app.use(cookieParser(env.COOKIE_SECRET));
  app.use(
    morgan('combined', {
      stream: { write: (message) => logger.info(message.trim()) },
    })
  );

  app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

  app.use('/api/auth', authRoutes);
  app.use('/api/community', communityRoutes);
  app.use('/api/screening', screeningRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
