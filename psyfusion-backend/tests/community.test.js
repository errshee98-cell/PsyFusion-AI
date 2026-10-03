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

describe('POST /api/community/posts', () => {
  it('publishes an ordinary post immediately, under the anonymous handle', async () => {
    const { user } = await createUser({ role: 'user' });

    const res = await request(app)
      .post('/api/community/posts')
      .set(authHeader(user))
      .send({ body: 'Had a genuinely good day today, small wins add up.' });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('visible');
    expect(res.body.post.authorAnonymousHandle).toBe(user.anonymousHandle);
    expect(res.body.post.body).toMatch(/good day/);
  });

  it('never exposes the author email or real name in the response', async () => {
    const { user } = await createUser({ role: 'user', email: 'realname@example.com' });

    const res = await request(app)
      .post('/api/community/posts')
      .set(authHeader(user))
      .send({ body: 'Just checking in with the community.' });

    const raw = JSON.stringify(res.body);
    expect(raw).not.toMatch(/realname@example\.com/);
  });

  it('routes crisis-language posts to review instead of publishing them', async () => {
    const { user } = await createUser({ role: 'user' });

    const res = await request(app)
      .post('/api/community/posts')
      .set(authHeader(user))
      .send({ body: "I've been feeling suicidal and don't know what to do." });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('under_review');
    expect(res.body.resources).toBeInstanceOf(Array);
    expect(res.body.resources.length).toBeGreaterThan(0);
    // The flagged post must not be returned as a publishable post object.
    expect(res.body.post).toBeUndefined();
  });

  it('does not list an under-review post in the public feed', async () => {
    const { user } = await createUser({ role: 'user' });

    await request(app)
      .post('/api/community/posts')
      .set(authHeader(user))
      .send({ body: 'no reason to live anymore' });

    const feed = await request(app).get('/api/community/posts').set(authHeader(user));
    expect(feed.body.posts).toHaveLength(0);
  });

  it('rejects an empty post body', async () => {
    const { user } = await createUser({ role: 'user' });
    const res = await request(app).post('/api/community/posts').set(authHeader(user)).send({ body: '' });
    expect(res.status).toBe(400);
  });

  it('rejects a post over the length limit', async () => {
    const { user } = await createUser({ role: 'user' });
    const res = await request(app)
      .post('/api/community/posts')
      .set(authHeader(user))
      .send({ body: 'x'.repeat(2001) });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/community/posts', () => {
  it('only returns visible posts, newest first', async () => {
    const { user } = await createUser({ role: 'user' });

    await request(app).post('/api/community/posts').set(authHeader(user)).send({ body: 'first post' });
    await request(app).post('/api/community/posts').set(authHeader(user)).send({ body: 'second post' });

    const res = await request(app).get('/api/community/posts').set(authHeader(user));
    expect(res.status).toBe(200);
    expect(res.body.posts).toHaveLength(2);
    expect(res.body.posts[0].body).toBe('second post'); // newest first
  });
});

describe('Moderation queue and review', () => {
  async function createFlaggedPost() {
    const { user } = await createUser({ role: 'user' });
    const res = await request(app)
      .post('/api/community/posts')
      .set(authHeader(user))
      .send({ body: 'i want to end my life' });
    return { authorUser: user, createResponse: res };
  }

  it('shows a flagged post in the clinician queue', async () => {
    await createFlaggedPost();
    const { user: clinician } = await createUser({ role: 'clinician' });

    const res = await request(app).get('/api/community/moderation/queue').set(authHeader(clinician));
    expect(res.status).toBe(200);
    expect(res.body.posts).toHaveLength(1);
    expect(res.body.posts[0].crisisFlag).toBe(true);
  });

  it('approving a queued post makes it visible in the public feed', async () => {
    await createFlaggedPost();
    const { user: clinician } = await createUser({ role: 'clinician' });
    const { user: reader } = await createUser({ role: 'user' });

    const queue = await request(app).get('/api/community/moderation/queue').set(authHeader(clinician));
    const postId = queue.body.posts[0]._id;

    const review = await request(app)
      .patch(`/api/community/moderation/${postId}`)
      .set(authHeader(clinician))
      .send({ decision: 'approve' });
    expect(review.status).toBe(200);
    expect(review.body.status).toBe('visible');

    const feed = await request(app).get('/api/community/posts').set(authHeader(reader));
    expect(feed.body.posts).toHaveLength(1);
  });

  it('removing a queued post keeps it out of the public feed permanently', async () => {
    await createFlaggedPost();
    const { user: clinician } = await createUser({ role: 'clinician' });
    const { user: reader } = await createUser({ role: 'user' });

    const queue = await request(app).get('/api/community/moderation/queue').set(authHeader(clinician));
    const postId = queue.body.posts[0]._id;

    const review = await request(app)
      .patch(`/api/community/moderation/${postId}`)
      .set(authHeader(clinician))
      .send({ decision: 'remove', note: 'Escalated externally' });
    expect(review.status).toBe(200);
    expect(review.body.status).toBe('removed');

    const feed = await request(app).get('/api/community/posts').set(authHeader(reader));
    expect(feed.body.posts).toHaveLength(0);

    const queueAfter = await request(app).get('/api/community/moderation/queue').set(authHeader(clinician));
    expect(queueAfter.body.posts).toHaveLength(0);
  });

  it('rejects an invalid decision value', async () => {
    await createFlaggedPost();
    const { user: clinician } = await createUser({ role: 'clinician' });
    const queue = await request(app).get('/api/community/moderation/queue').set(authHeader(clinician));
    const postId = queue.body.posts[0]._id;

    const res = await request(app)
      .patch(`/api/community/moderation/${postId}`)
      .set(authHeader(clinician))
      .send({ decision: 'ignore' });
    expect(res.status).toBe(400);
  });
});
