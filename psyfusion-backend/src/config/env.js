require('dotenv').config();

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '5000', 10),
  MONGO_URI: required('MONGO_URI'),
  JWT_ACCESS_SECRET: required('JWT_ACCESS_SECRET'),
  JWT_REFRESH_SECRET: required('JWT_REFRESH_SECRET'),
  JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  COOKIE_SECRET: required('COOKIE_SECRET'),
  COOKIE_DOMAIN: process.env.COOKIE_DOMAIN || 'localhost',
  CORS_ORIGINS: (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  MAX_LOGIN_ATTEMPTS: parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5', 10),
  LOCKOUT_DURATION_MINUTES: parseInt(process.env.LOCKOUT_DURATION_MINUTES || '15', 10),
  MODERATION_REVIEW_WEBHOOK: process.env.MODERATION_REVIEW_WEBHOOK || null,

  // ML inference service (psyfusion-ml/service) - internal-only HTTP service,
  // never exposed directly to the frontend. See src/services/mlServiceClient.js.
  ML_SERVICE_URL: process.env.ML_SERVICE_URL || 'http://127.0.0.1:8000',
  ML_SERVICE_API_KEY: process.env.ML_SERVICE_API_KEY || null,
  ML_SERVICE_TIMEOUT_MS: parseInt(process.env.ML_SERVICE_TIMEOUT_MS || '15000', 10),

  // MUST be a distinct secret from JWT_ACCESS_SECRET/JWT_REFRESH_SECRET: an
  // MFA challenge token proves only "password was correct", not "this user
  // is authenticated" - if it were signed with JWT_ACCESS_SECRET it would
  // also pass as a real access token and silently defeat MFA entirely (see
  // middleware/auth.js's authenticate(), which trusts anything that verifies
  // against JWT_ACCESS_SECRET).
  MFA_CHALLENGE_SECRET: required('MFA_CHALLENGE_SECRET'),
  MFA_CHALLENGE_EXPIRES_IN: process.env.MFA_CHALLENGE_EXPIRES_IN || '5m',

  // Used to build links in outgoing emails (see services/emailService.js).
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
};

if (env.NODE_ENV === 'production') {
  const insecureDefaults = ['replace_me_with_a_64_byte_random_hex_string'];
  const secrets = [env.JWT_ACCESS_SECRET, env.JWT_REFRESH_SECRET, env.MFA_CHALLENGE_SECRET];
  const hasDefault = secrets.some((s) => insecureDefaults.includes(s));
  const hasDuplicate = new Set(secrets).size !== secrets.length;
  if (hasDefault || hasDuplicate) {
    throw new Error(
      'Refusing to start in production with default or reused secrets (JWT_ACCESS_SECRET, ' +
        'JWT_REFRESH_SECRET, MFA_CHALLENGE_SECRET must all be distinct, real values).'
    );
  }
}

module.exports = env;
