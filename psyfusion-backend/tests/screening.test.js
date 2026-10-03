const request = require('supertest');

// The real ML service (psyfusion-ml/service) is a separate Python process -
// out of scope for a Node/Jest test run. We mock the client module at the
// boundary instead, so these tests verify everything this backend is
// actually responsible for: auth, validation, persistence, the independent
// text-based crisis safety net, and the clinician review queue - without
// depending on a Python process being up.
// Mock only `requestPrediction`; keep the real `MlServiceError` class so
// `instanceof` checks and its `.status`/`.message` fields behave exactly as
// they would in production.
jest.mock('../src/services/mlServiceClient', () => {
  const actual = jest.requireActual('../src/services/mlServiceClient');
  return { ...actual, requestPrediction: jest.fn() };
});
const { requestPrediction, MlServiceError } = require('../src/services/mlServiceClient');

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
  jest.clearAllMocks();
});

afterAll(async () => {
  await disconnectTestDB(mongod);
});

function lowRiskPrediction(overrides = {}) {
  return {
    risk_score: 0.12,
    decision: 'low_risk',
    modalities_used: ['text'],
    cross_modal_conflict: false,
    conflict_magnitude: null,
    per_modality_scores: { text: 0.12 },
    explanation: 'No elevated risk indicators detected in available modalities.',
    ...overrides,
  };
}

describe('POST /api/screening', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await request(app).post('/api/screening').send({ text: 'hello' });
    expect(res.status).toBe(401);
  });

  it('rejects an empty text field before calling the ML service', async () => {
    const { user } = await createUser({ role: 'user' });
    const res = await request(app).post('/api/screening').set(authHeader(user)).field('text', '');
    expect(res.status).toBe(400);
    expect(requestPrediction).not.toHaveBeenCalled();
  });

  it('persists a low-risk result and does not surface crisis resources', async () => {
    const { user } = await createUser({ role: 'user' });
    requestPrediction.mockResolvedValue(lowRiskPrediction());

    const res = await request(app)
      .post('/api/screening')
      .set(authHeader(user))
      .field('text', 'things have been pretty steady lately');

    expect(res.status).toBe(201);
    expect(res.body.result.decision).toBe('low_risk');
    expect(res.body.resources).toBeUndefined();
    expect(requestPrediction).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'things have been pretty steady lately' })
    );
  });

  it('never returns the raw text snapshot in the response body', async () => {
    const { user } = await createUser({ role: 'user' });
    requestPrediction.mockResolvedValue(lowRiskPrediction());

    const res = await request(app).post('/api/screening').set(authHeader(user)).field('text', 'a private detail');

    expect(JSON.stringify(res.body)).not.toMatch(/a private detail/);
  });

  it('surfaces crisis resources when the ML model abstains, even without text-pattern match', async () => {
    const { user } = await createUser({ role: 'user' });
    requestPrediction.mockResolvedValue(
      lowRiskPrediction({ decision: 'abstain_review_needed', risk_score: 0.5 })
    );

    const res = await request(app)
      .post('/api/screening')
      .set(authHeader(user))
      .field('text', 'a fairly neutral sentence the model is unsure about');

    expect(res.status).toBe(201);
    expect(res.body.resources).toBeDefined();
    expect(res.body.result.needsClinicianReview).toBe(true);
  });

  it('flags for clinician review and returns resources even if the ML service is down, when the text itself is a crisis phrase', async () => {
    const { user } = await createUser({ role: 'user' });
    requestPrediction.mockRejectedValue(new MlServiceError('ML service is unreachable.', { status: 503 }));

    const res = await request(app)
      .post('/api/screening')
      .set(authHeader(user))
      .field('text', 'i want to kill myself');

    expect(res.status).toBe(503);
    expect(res.body.crisisFlag).toBe(true);
    expect(res.body.resources).toBeDefined();
  });

  it('returns 503 (not 500) when the ML service is down and there is no text-pattern flag', async () => {
    const { user } = await createUser({ role: 'user' });
    requestPrediction.mockRejectedValue(new MlServiceError('ML service is unreachable.', { status: 503 }));

    const res = await request(app).post('/api/screening').set(authHeader(user)).field('text', 'an ordinary update');

    expect(res.status).toBe(503);
    expect(res.body.resources).toBeUndefined();
  });

  it('marks needsClinicianReview when the text scanner finds imminent-severity language, regardless of model score', async () => {
    const { user } = await createUser({ role: 'user' });
    requestPrediction.mockResolvedValue(lowRiskPrediction()); // model disagrees, text pattern still wins

    const res = await request(app)
      .post('/api/screening')
      .set(authHeader(user))
      .field('text', 'i have a suicide plan');

    expect(res.status).toBe(201);
    expect(res.body.result.needsClinicianReview).toBe(true);
    expect(res.body.result.crisisTextSeverity).toBe('imminent');
  });
});

describe('GET /api/screening/history', () => {
  it("only returns the requesting user's own screenings, newest first, without text", async () => {
    const { user } = await createUser({ role: 'user' });
    const { user: otherUser } = await createUser({ role: 'user' });
    requestPrediction.mockResolvedValue(lowRiskPrediction());

    await request(app).post('/api/screening').set(authHeader(otherUser)).field('text', 'someone elses entry');
    await request(app).post('/api/screening').set(authHeader(user)).field('text', 'first');
    await request(app).post('/api/screening').set(authHeader(user)).field('text', 'second');

    const res = await request(app).get('/api/screening/history').set(authHeader(user));
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(2);
    expect(JSON.stringify(res.body)).not.toMatch(/someone elses entry/);
  });
});

describe('GET /api/screening/flagged and PATCH /api/screening/flagged/:id', () => {
  it('denies non-clinician/admin roles', async () => {
    const { user } = await createUser({ role: 'user' });
    const res = await request(app).get('/api/screening/flagged').set(authHeader(user));
    expect(res.status).toBe(403);
  });

  it('lists an imminent-flagged screening for a clinician, including the text, and allows marking it reviewed', async () => {
    const { user } = await createUser({ role: 'user' });
    const { user: clinician } = await createUser({ role: 'clinician' });
    requestPrediction.mockResolvedValue(lowRiskPrediction());

    await request(app).post('/api/screening').set(authHeader(user)).field('text', 'i have a suicide plan');

    const queue = await request(app).get('/api/screening/flagged').set(authHeader(clinician));
    expect(queue.status).toBe(200);
    expect(queue.body.results).toHaveLength(1);
    expect(queue.body.results[0].textSnapshot).toBe('i have a suicide plan');

    const id = queue.body.results[0].id;
    const review = await request(app)
      .patch(`/api/screening/flagged/${id}`)
      .set(authHeader(clinician))
      .send({ note: 'Reached out, safety plan confirmed.' });
    expect(review.status).toBe(200);
    expect(review.body.reviewed).toBe(true);

    const queueAfter = await request(app).get('/api/screening/flagged').set(authHeader(clinician));
    expect(queueAfter.body.results).toHaveLength(0);
  });
});
