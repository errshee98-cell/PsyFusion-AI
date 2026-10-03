const helmet = require('helmet');
const cors = require('cors');
const hpp = require('hpp');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const rateLimit = require('express-rate-limit');
const env = require('../config/env');
const logger = require('../utils/logger');

// Strict, locked-down Content Security Policy. Adjust only if the frontend
// genuinely needs another source - never widen with 'unsafe-inline' for scripts.
const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // relax only if a CSS-in-JS lib needs it
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  crossOriginResourcePolicy: { policy: 'same-site' },
  referrerPolicy: { policy: 'no-referrer' },
  hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
  hidePoweredBy: true,
  noSniff: true,
  frameguard: { action: 'deny' },
});

const corsMiddleware = cors({
  origin(origin, callback) {
    // allow same-origin / server-to-server calls with no Origin header
    if (!origin) return callback(null, true);
    if (env.CORS_ORIGINS.includes(origin)) return callback(null, true);
    logger.warn(`Blocked CORS request from disallowed origin: ${origin}`);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 600,
});

// General API rate limit
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

// Tighter limiter for auth endpoints to slow credential stuffing / brute force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many authentication attempts. Please try again later.' },
});

// Very tight limiter for community post creation to blunt spam/flood abuse
const postLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'You are posting too quickly. Please slow down.' },
});

// Limiter for screening submissions - each one triggers a real ML inference
// call (and possibly audio/video processing), so this is tighter than the
// general limiter but looser than postLimiter since legitimate use involves
// back-and-forth, not a single flood-prone action.
const screeningLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many screening submissions. Please try again later.' },
});

function applySecurityMiddleware(app) {
  app.set('trust proxy', 1); // required for correct IPs/rate-limiting behind a reverse proxy
  app.use(helmetMiddleware);
  app.use(corsMiddleware);
  app.use(hpp()); // protect against HTTP parameter pollution
  app.use(mongoSanitize()); // strip $ and . operators from user input (NoSQL injection)
  app.use(xss()); // sanitize user input against XSS
  app.use(generalLimiter);
}

module.exports = {
  applySecurityMiddleware,
  authLimiter,
  postLimiter,
  screeningLimiter,
};
