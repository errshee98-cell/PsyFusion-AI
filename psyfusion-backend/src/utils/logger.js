const winston = require('winston');
const path = require('path');

const env = process.env.NODE_ENV || 'development';

const logger = winston.createLogger({
  level: env === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'psyfusion-backend' },
  transports: [
    new winston.transports.File({
      filename: path.join(__dirname, '..', '..', 'logs', 'error.log'),
      level: 'error',
    }),
    new winston.transports.File({
      filename: path.join(__dirname, '..', '..', 'logs', 'combined.log'),
    }),
    // Separate append-only audit trail: clinician overrides, moderation actions,
    // auth events. Never write PHI/PII into this stream, only event metadata.
    new winston.transports.File({
      filename: path.join(__dirname, '..', '..', 'logs', 'audit.log'),
      level: 'info',
    }),
  ],
});

if (env !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
    })
  );
}

// Use for security-relevant, non-repudiable events only (login, role change,
// clinician override, moderation decision). Keep payloads free of raw PHI.
logger.audit = (event, meta = {}) => {
  logger.info(event, { audit: true, ...meta });
};

module.exports = logger;
