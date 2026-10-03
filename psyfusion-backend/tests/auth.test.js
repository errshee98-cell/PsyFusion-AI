const request = require('supertest');
const createApp = require('../src/app');
const { connectTestDB, disconnectTestDB, clearTestDB } = require('./testDb');
const { VALID_PASSWORD } = require('./helpers');

let mongod;
let app;

beforeAll(async () => {
  mongod = await connectTestDB();
  app = createApp();
});

afterEach(async () => {
  await clearTestDB();
});

afterAll(async () => {
  await disconnectTestDB(mongod);
});

describe('POST /api/auth/register', () => {
  it('registers a new user and returns the enumeration-safe message', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'new.user@example.com', password: VALID_PASSWORD });

    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/if that email is available/i);
  });

  it('rejects a password that fails the strength policy', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'weak@example.com', password: 'short1!' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('returns the same response for a duplicate email as for a new one (anti-enumeration)', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'dupe@example.com', password: VALID_PASSWORD });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'dupe@example.com', password: VALID_PASSWORD });

    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/if that email is available/i);
  });
});

describe('POST /api/auth/login', () => {
  const email = 'login.test@example.com';

  beforeEach(async () => {
    await request(app).post('/api/auth/register').send({ email, password: VALID_PASSWORD });
  });

  it('logs in with correct credentials and sets a refresh cookie', async () => {
    const res = await request(app).post('/api/auth/login').send({ email, password: VALID_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user.email).toBe(email);
    expect(res.body.user).not.toHaveProperty('passwordHash');

    const setCookie = res.headers['set-cookie'] || [];
    expect(setCookie.some((c) => c.startsWith('psyfusion_rt='))).toBe(true);
  });

  it('rejects an incorrect password with a generic error', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'WrongPassword123!' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid email or password');
  });

  it('gives the same generic error for a nonexistent email (anti-enumeration)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: VALID_PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid email or password');
  });

  it('locks the account after MAX_LOGIN_ATTEMPTS failed attempts', async () => {
    // env.setup.js sets MAX_LOGIN_ATTEMPTS=3
    for (let i = 0; i < 3; i++) {
      await request(app).post('/api/auth/login').send({ email, password: 'WrongPassword123!' });
    }

    const res = await request(app).post('/api/auth/login').send({ email, password: VALID_PASSWORD });

    expect(res.status).toBe(423);
    expect(res.body.error).toMatch(/locked/i);
  });
});

describe('POST /api/auth/refresh', () => {
  const email = 'refresh.test@example.com';

  async function registerAndLogin() {
    await request(app).post('/api/auth/register').send({ email, password: VALID_PASSWORD });
    const res = await request(app).post('/api/auth/login').send({ email, password: VALID_PASSWORD });
    const cookie = res.headers['set-cookie'].find((c) => c.startsWith('psyfusion_rt='));
    return { accessToken: res.body.accessToken, cookie };
  }

  it('issues a new access token and rotates the refresh cookie', async () => {
    const { cookie } = await registerAndLogin();

    const res = await request(app).post('/api/auth/refresh').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));

    const newCookie = (res.headers['set-cookie'] || []).find((c) => c.startsWith('psyfusion_rt='));
    expect(newCookie).toBeDefined();
    expect(newCookie).not.toBe(cookie);
  });

  it('rejects a request with no refresh cookie', async () => {
    const res = await request(app).post('/api/auth/refresh');
    expect(res.status).toBe(401);
  });

  it('detects reuse of an already-rotated refresh token and revokes the session', async () => {
    const { cookie: firstCookie } = await registerAndLogin();

    // First use rotates it - this succeeds and issues a second cookie.
    const firstRefresh = await request(app).post('/api/auth/refresh').set('Cookie', firstCookie);
    expect(firstRefresh.status).toBe(200);

    // Reusing the ORIGINAL (now-rotated-out) cookie should be treated as
    // potential token theft and rejected.
    const reuse = await request(app).post('/api/auth/refresh').set('Cookie', firstCookie);
    expect(reuse.status).toBe(401);

    // And because reuse revokes all sessions, even the valid rotated cookie
    // from the first refresh should no longer work.
    const secondCookie = (firstRefresh.headers['set-cookie'] || []).find((c) =>
      c.startsWith('psyfusion_rt=')
    );
    const afterRevocation = await request(app).post('/api/auth/refresh').set('Cookie', secondCookie);
    expect(afterRevocation.status).toBe(401);
  });
});

describe('POST /api/auth/verify-email', () => {
  it('verifies the email with a valid token straight from the DB (no email transport in this sandbox)', async () => {
    const email = 'verify.me@example.com';
    await request(app).post('/api/auth/register').send({ email, password: VALID_PASSWORD });

    const User = require('../src/models/User');
    const { hashToken } = require('../src/services/tokenService');
    const user = await User.findOne({ email }).select('+emailVerificationTokenHash');
    expect(user.isEmailVerified).toBe(false);

    // The raw token is only ever in the (unsent, in this sandbox) email body;
    // we can't recover it from the hash, so issue a fresh one the same way
    // the controller does and check it hashes to a value we can exercise
    // end-to-end by going through the same code path register used.
    const crypto = require('crypto');
    const rawToken = crypto.randomBytes(32).toString('hex');
    user.emailVerificationTokenHash = hashToken(rawToken);
    user.emailVerificationExpires = new Date(Date.now() + 1000 * 60 * 60);
    await user.save();

    const res = await request(app).post('/api/auth/verify-email').send({ token: rawToken });
    expect(res.status).toBe(200);

    const updated = await User.findOne({ email });
    expect(updated.isEmailVerified).toBe(true);
  });

  it('rejects an invalid token', async () => {
    const res = await request(app).post('/api/auth/verify-email').send({ token: 'not-a-real-token' });
    expect(res.status).toBe(400);
  });

  it('rejects an expired token', async () => {
    const email = 'verify.expired@example.com';
    await request(app).post('/api/auth/register').send({ email, password: VALID_PASSWORD });

    const User = require('../src/models/User');
    const { hashToken } = require('../src/services/tokenService');
    const crypto = require('crypto');
    const rawToken = crypto.randomBytes(32).toString('hex');
    const user = await User.findOne({ email });
    user.emailVerificationTokenHash = hashToken(rawToken);
    user.emailVerificationExpires = new Date(Date.now() - 1000); // already expired
    await user.save();

    const res = await request(app).post('/api/auth/verify-email').send({ token: rawToken });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/auth/me', () => {
  const email = 'me.test@example.com';

  it('returns the current user for a valid access token', async () => {
    await request(app).post('/api/auth/register').send({ email, password: VALID_PASSWORD });
    const loginRes = await request(app).post('/api/auth/login').send({ email, password: VALID_PASSWORD });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(email);
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('rejects a request with no access token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('revokes the refresh token so it can no longer be used', async () => {
    const email = 'logout.test@example.com';
    await request(app).post('/api/auth/register').send({ email, password: VALID_PASSWORD });
    const loginRes = await request(app).post('/api/auth/login').send({ email, password: VALID_PASSWORD });
    const cookie = loginRes.headers['set-cookie'].find((c) => c.startsWith('psyfusion_rt='));

    const logoutRes = await request(app).post('/api/auth/logout').set('Cookie', cookie);
    expect(logoutRes.status).toBe(204);

    const refreshAfterLogout = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
    expect(refreshAfterLogout.status).toBe(401);
  });
});
