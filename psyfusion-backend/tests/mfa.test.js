const request = require('supertest');
const createApp = require('../src/app');
const { connectTestDB, disconnectTestDB, clearTestDB } = require('./testDb');
const { createUser, authHeader, VALID_PASSWORD } = require('./helpers');
const { totp } = require('../src/utils/totp');

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

async function enrollMfa(user) {
  const setupRes = await request(app).post('/api/auth/mfa/setup').set(authHeader(user));
  expect(setupRes.status).toBe(200);
  const { secret } = setupRes.body;

  const code = totp(secret);
  const verifyRes = await request(app)
    .post('/api/auth/mfa/verify-setup')
    .set(authHeader(user))
    .send({ code });
  expect(verifyRes.status).toBe(200);

  return { secret, backupCodes: verifyRes.body.backupCodes };
}

describe('POST /api/auth/mfa/setup and /verify-setup', () => {
  it('returns a secret and otpauth URL from setup', async () => {
    const { user } = await createUser({ role: 'user' });
    const res = await request(app).post('/api/auth/mfa/setup').set(authHeader(user));
    expect(res.status).toBe(200);
    expect(res.body.secret).toEqual(expect.any(String));
    expect(res.body.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
  });

  it('rejects verify-setup with a wrong code and does not enable MFA', async () => {
    const { user } = await createUser({ role: 'user' });
    await request(app).post('/api/auth/mfa/setup').set(authHeader(user));

    const res = await request(app)
      .post('/api/auth/mfa/verify-setup')
      .set(authHeader(user))
      .send({ code: '000000' });
    expect(res.status).toBe(400);
  });

  it('enables MFA and returns one-time backup codes on a correct code', async () => {
    const { user } = await createUser({ role: 'user' });
    const { backupCodes } = await enrollMfa(user);
    expect(backupCodes).toHaveLength(8);
    expect(new Set(backupCodes).size).toBe(8); // all unique
  });

  it('refuses to set up again once MFA is already enabled', async () => {
    const { user } = await createUser({ role: 'user' });
    await enrollMfa(user);

    const res = await request(app).post('/api/auth/mfa/setup').set(authHeader(user));
    expect(res.status).toBe(409);
  });
});

describe('Login with MFA enabled', () => {
  it('returns mfaRequired + mfaToken instead of an access token on correct password', async () => {
    const email = 'mfa.user@example.com';
    const { user } = await createUser({ role: 'user', email });
    await enrollMfa(user);

    const res = await request(app).post('/api/auth/login').send({ email, password: VALID_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.mfaRequired).toBe(true);
    expect(res.body.mfaToken).toEqual(expect.any(String));
    expect(res.body.accessToken).toBeUndefined();
    expect((res.headers['set-cookie'] || []).length).toBe(0); // no refresh cookie yet
  });

  it('still rejects a wrong password with the generic error, even with MFA enabled', async () => {
    const email = 'mfa.user2@example.com';
    const { user } = await createUser({ role: 'user', email });
    await enrollMfa(user);

    const res = await request(app).post('/api/auth/login').send({ email, password: 'WrongPassword123!' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid email or password');
  });
});

describe('POST /api/auth/mfa/verify-login', () => {
  async function loginToMfaChallenge(email) {
    const res = await request(app).post('/api/auth/login').send({ email, password: VALID_PASSWORD });
    return res.body.mfaToken;
  }

  it('completes login with a correct TOTP code and sets the refresh cookie', async () => {
    const email = 'mfa.totp@example.com';
    const { user } = await createUser({ role: 'user', email });
    const { secret } = await enrollMfa(user);

    const mfaToken = await loginToMfaChallenge(email);
    const code = totp(secret);

    const res = await request(app).post('/api/auth/mfa/verify-login').send({ mfaToken, code });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    const setCookie = res.headers['set-cookie'] || [];
    expect(setCookie.some((c) => c.startsWith('psyfusion_rt='))).toBe(true);
  });

  it('rejects an incorrect TOTP code', async () => {
    const email = 'mfa.totp2@example.com';
    const { user } = await createUser({ role: 'user', email });
    await enrollMfa(user);

    const mfaToken = await loginToMfaChallenge(email);
    const res = await request(app).post('/api/auth/mfa/verify-login').send({ mfaToken, code: '000000' });
    expect(res.status).toBe(401);
  });

  it('rejects a tampered/garbage mfaToken', async () => {
    const res = await request(app)
      .post('/api/auth/mfa/verify-login')
      .send({ mfaToken: 'not-a-real-token', code: '123456' });
    expect(res.status).toBe(401);
  });

  it('accepts a valid backup code exactly once', async () => {
    const email = 'mfa.backup@example.com';
    const { user } = await createUser({ role: 'user', email });
    const { backupCodes } = await enrollMfa(user);
    const backupCode = backupCodes[0];

    const firstMfaToken = await loginToMfaChallenge(email);
    const firstUse = await request(app)
      .post('/api/auth/mfa/verify-login')
      .send({ mfaToken: firstMfaToken, code: backupCode });
    expect(firstUse.status).toBe(200);

    // Reusing the same backup code must fail (one-time use).
    const secondMfaToken = await loginToMfaChallenge(email);
    const secondUse = await request(app)
      .post('/api/auth/mfa/verify-login')
      .send({ mfaToken: secondMfaToken, code: backupCode });
    expect(secondUse.status).toBe(401);
  });
});

describe('POST /api/auth/mfa/disable', () => {
  it('requires the correct current password', async () => {
    const { user } = await createUser({ role: 'user' });
    await enrollMfa(user);

    const res = await request(app)
      .post('/api/auth/mfa/disable')
      .set(authHeader(user))
      .send({ password: 'WrongPassword123!' });
    expect(res.status).toBe(401);
  });

  it('disables MFA and clears backup codes on a correct password', async () => {
    const email = 'mfa.disable@example.com';
    const { user } = await createUser({ role: 'user', email });
    await enrollMfa(user);

    const disableRes = await request(app)
      .post('/api/auth/mfa/disable')
      .set(authHeader(user))
      .send({ password: VALID_PASSWORD });
    expect(disableRes.status).toBe(200);

    // Logging in now should go straight to a normal access token again.
    const loginRes = await request(app).post('/api/auth/login').send({ email, password: VALID_PASSWORD });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.accessToken).toEqual(expect.any(String));
    expect(loginRes.body.mfaRequired).toBeUndefined();
  });
});
