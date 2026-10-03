const request = require('supertest');
const createApp = require('../src/app');
const { connectTestDB, disconnectTestDB, clearTestDB } = require('./testDb');
const { createUser, authHeader } = require('./helpers');

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

describe('authenticate middleware', () => {
  it('rejects a request with no Authorization header', async () => {
    const res = await request(app).get('/api/community/posts');
    expect(res.status).toBe(401);
  });

  it('rejects a malformed Authorization header', async () => {
    const res = await request(app).get('/api/community/posts').set('Authorization', 'NotBearer abc123');
    expect(res.status).toBe(401);
  });

  it('rejects a syntactically invalid token', async () => {
    const res = await request(app)
      .get('/api/community/posts')
      .set('Authorization', 'Bearer this.is.not.a.valid.jwt');
    expect(res.status).toBe(401);
  });

  it('accepts a validly signed token for an existing user', async () => {
    const { user } = await createUser({ role: 'user' });
    const res = await request(app).get('/api/community/posts').set(authHeader(user));
    expect(res.status).toBe(200);
  });
});

describe('authorize middleware (role gating)', () => {
  it('denies a plain user access to the moderation queue', async () => {
    const { user } = await createUser({ role: 'user' });
    const res = await request(app).get('/api/community/moderation/queue').set(authHeader(user));
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/insufficient permissions/i);
  });

  it('allows a clinician access to the moderation queue', async () => {
    const { user } = await createUser({ role: 'clinician' });
    const res = await request(app).get('/api/community/moderation/queue').set(authHeader(user));
    expect(res.status).toBe(200);
  });

  it('allows an admin access to the moderation queue', async () => {
    const { user } = await createUser({ role: 'admin' });
    const res = await request(app).get('/api/community/moderation/queue').set(authHeader(user));
    expect(res.status).toBe(200);
  });

  it('denies a plain user from reviewing a post', async () => {
    const { user } = await createUser({ role: 'user' });
    // a well-formed but nonexistent id - authorize() must reject before the
    // route handler ever looks the post up, so a 403 here (not a 404) is
    // itself the thing under test
    const res = await request(app)
      .patch('/api/community/moderation/507f1f77bcf86cd799439011')
      .set(authHeader(user))
      .send({ decision: 'approve' });
    expect(res.status).toBe(403);
  });
});
