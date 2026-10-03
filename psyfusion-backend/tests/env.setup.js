// Runs before the test framework and any application module is loaded.
// config/env.js reads these via process.env at require time, so they must
// be set here, not in a beforeAll.

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-not-for-real-use';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-not-for-real-use';
process.env.MFA_CHALLENGE_SECRET = 'test-mfa-challenge-secret-not-for-real-use';
process.env.COOKIE_SECRET = 'test-cookie-secret';
process.env.CORS_ORIGINS = 'http://localhost:5173';
process.env.MAX_LOGIN_ATTEMPTS = '3'; // small, so the lockout test doesn't need 5 requests
process.env.LOCKOUT_DURATION_MINUTES = '15';

// Placeholder - real tests connect mongoose themselves to an in-memory
// mongodb-memory-server instance (see tests/testDb.js) rather than using
// this value, but config/env.js's required() check needs something present
// at module-load time.
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/psyfusion-test-placeholder';
