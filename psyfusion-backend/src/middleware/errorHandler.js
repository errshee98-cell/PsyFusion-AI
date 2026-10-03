const logger = require('../utils/logger');
const env = require('../config/env');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;

  // Never leak stack traces or internal messages to the client in production.
  const payload = {
    error: status === 500 ? 'Internal server error' : err.message,
  };

  if (env.NODE_ENV !== 'production') {
    payload.stack = err.stack;
  }

  if (status >= 500) {
    logger.error(err.message, { stack: err.stack, path: req.path, method: req.method });
  } else {
    logger.warn(err.message, { path: req.path, method: req.method, status });
  }

  res.status(status).json(payload);
}

function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Route not found' });
}

module.exports = { errorHandler, notFoundHandler };
