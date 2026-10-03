# PsyFusion AI — Backend

Secure Node.js/Express/MongoDB backend for the PsyFusion AI multimodal mental
health screening platform. Covers authentication, RBAC, and the anonymous
community module with crisis-detection-backed moderation.

## Stack

- Node.js 18+, Express 4
- MongoDB + Mongoose
- JWT access/refresh tokens (refresh tokens rotated and stored hashed)
- bcrypt password hashing, helmet, rate limiting, mongo-sanitize, xss-clean, hpp

## Setup

```bash
cp .env.example .env
# generate real secrets:
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
# paste into JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, COOKIE_SECRET (three DIFFERENT values)

npm install
npm run dev     # nodemon, requires MongoDB running locally (or set MONGO_URI)
```

> **Note:** this scaffold was built in a sandboxed environment with no access
> to the npm registry, so `npm install` has not been run or verified here.
> Every file passed `node --check` (syntax validation), but you should run
> `npm install && npm run dev` locally and fix anything that surfaces before
> treating this as working end to end.

## Testing

```bash
npm install
npm test
```

Covers: registration (including the anti-enumeration behavior), login +
account lockout, refresh token rotation + stolen-token reuse detection,
`/me`, logout, `authenticate`/`authorize` middleware (missing/malformed/invalid
tokens, role gating on the moderation routes), the full community post →
crisis-flag → moderation-queue → approve/remove flow, a dedicated suite
for `crisisDetectionService.scanText` covering every imminent/elevated
pattern plus a documented false-negative (figurative language like "this
traffic is killing me"), the screening flow (auth required, validation,
persistence, never returning the raw text snapshot, the text-scanner safety
net firing independently of the ML service's own decision, the ML-service-down
degraded path, and the clinician flagged-queue/review flow), email
verification (valid/invalid/expired tokens), and the full MFA flow (setup →
verify-setup with a real computed TOTP code → login returning a challenge
instead of tokens → verify-login with a correct/incorrect code → backup-code
one-time use → disable requiring the current password). The screening tests
mock `mlServiceClient.requestPrediction` (the real ML service is a separate
Python process, out of scope for a Jest run) but keep the real
`MlServiceError` class, and otherwise exercise the actual Express app the
same way the other suites do. `tests/totp.test.js` is a standalone unit
suite for `src/utils/totp.js` against the **official RFC 6238 Appendix B
test vectors** — independently run with plain `node -e` in this sandbox
before being written in as expectations (same verification discipline as
`crisisDetection.test.js`), all 5 match exactly.

Uses `mongodb-memory-server` so no real MongoDB instance is needed — each
test file spins up its own ephemeral instance.

> **Status:** these tests were written and syntax-checked (`node --check`
> passes on all 8 files) in a sandboxed environment with no npm registry
> access, so `mongodb-memory-server` was never actually installed or run
> here — the auth/RBAC/community suites have NOT been executed. The one
> exception: every phrase used in `crisisDetection.test.js` and in the
> community tests' crisis-flagging cases was independently run against the
> real `scanText` function in this environment first (not through Jest, but
> `node -e` directly) to confirm each expectation is accurate before being
> written into a test — see the comment at the top of that file. Run
> `npm test` locally as the first step; if `mongodb-memory-server` can't
> download its MongoDB binary in your environment either (some corporate
> networks block it), point `MONGO_URI` in `tests/testDb.js` at a real local
> MongoDB instead.

## What's implemented

### Auth (`/api/auth`)
- `POST /register` — email + strong password (12+ chars, mixed case, number, symbol). Enumeration-safe response.
- `POST /login` — bcrypt check, account lockout after `MAX_LOGIN_ATTEMPTS` failures, issues access token (body) + refresh token (httpOnly cookie, scoped to `/api/auth`).
- `POST /refresh` — rotates the refresh token; reuse of an already-rotated token revokes **all** sessions for that user (stolen-token detection).
- `POST /logout` — revokes the current refresh token.
- `GET /me` — authenticated. Returns the current user (added for the frontend's session-restore flow: it calls `/refresh` then `/me` on load to turn a valid refresh cookie back into a usable session without the user re-entering credentials).
- `POST /verify-email` — body `{ token }`. Verifies the token issued at registration (SHA-256-hashed server-side, 24h expiry — same pattern as refresh tokens). `isEmailVerified` is tracked but **not yet enforced** anywhere (e.g. login doesn't currently require it) — add that check in `authController.login` once the team decides what an unverified user should/shouldn't be able to do.
- **MFA** (`/mfa/setup`, `/mfa/verify-setup`, `/mfa/verify-login`, `/mfa/disable`) — TOTP (RFC 6238), hand-rolled on Node's built-in `crypto` (see `src/utils/totp.js` — no `speakeasy`/`otplib` dependency, verified against the official RFC 6238 Appendix B test vectors in `tests/totp.test.js`) plus one-time backup codes. `login` returns `{ mfaRequired: true, mfaToken }` instead of real tokens when a user has MFA enabled; the client then calls `/mfa/verify-login` with that token and a 6-digit code (or a backup code) to get the real access token + refresh cookie. The `mfaToken` is signed with a **separate secret** (`MFA_CHALLENGE_SECRET`) from the real JWT secrets specifically so it can never be mistaken for a real access token by `authenticate()` — see the comment in `src/config/env.js`.

### RBAC
- Roles: `user`, `clinician`, `admin`.
- `authenticate` middleware verifies the JWT; `authorize('clinician', 'admin')` gates routes by role.

### Screening (`/api/screening`)
- `POST /` — authenticated. Accepts `text` (required) plus optional `audio`/`video` file uploads (multipart, `multer`, in-memory only). Runs the same `crisisDetectionService.scanText` safety net used by the community module *in addition to* calling the ML inference service, then persists a `ScreeningResult` and returns a summary (never the raw text) plus crisis resources whenever either signal fires — the text scanner, or the model's own elevated/abstain decision. If the ML service is unreachable, a text-pattern crisis match still returns resources (503, but with `crisisFlag`/`resources` set) rather than silently dropping it.
- `GET /history` — the current user's own past screenings (summaries only).
- `GET /flagged` (clinician/admin) — screenings awaiting review (imminent text match, or the model abstaining/elevated-plus-flagged), oldest first.
- `PATCH /flagged/:id` (clinician/admin) — mark a flagged screening reviewed, with an optional note.
- Calls out to the ML inference service over HTTP via `src/services/mlServiceClient.js` — see `psyfusion-ml/service/app.py` for that side. Configured with `ML_SERVICE_URL`/`ML_SERVICE_API_KEY`/`ML_SERVICE_TIMEOUT_MS`.

### Anonymous community (`/api/community`)
- Posts are shown under a stable `anonymousHandle`, never the real email/displayName.
- Every post body is scanned by `services/crisisDetectionService.js` (keyword/pattern stub — **not** a clinical model, see comments in that file for what to replace it with).
- Flagged posts go to `status: 'under_review'` (not publicly listed) and the poster immediately receives crisis resources in the response.
- `clinician`/`admin` roles review the queue: `GET /moderation/queue`, `PATCH /moderation/:postId` with `{ decision: 'approve' | 'remove' }`.

### Security hardening already in place
- Helmet with a locked-down CSP, HSTS, no-sniff, frameguard.
- CORS allowlist from `CORS_ORIGINS`.
- Rate limiting: general (300/15min), stricter on auth (20/15min), stricter still on community posting (15/10min).
- `express-mongo-sanitize` + `xss-clean` + `hpp` against NoSQL injection, XSS, and parameter pollution.
- All user input validated with `express-validator` before it reaches a controller.
- Refresh tokens stored server-side only as SHA-256 hashes, never in plaintext.
- Structured logging via winston, with a separate `logs/audit.log` stream for auth/moderation events (login, lockout, post flagged, moderation decision) — kept free of raw PHI by design.
- Production boot refuses to start on default/reused JWT secrets.

## What's NOT yet implemented (next steps)

- **Real email delivery.** `src/services/emailService.js` is a drop-in interface (`sendMail`) with a console/log "transport" — no SMTP/SES/SendGrid wired up (couldn't install `nodemailer` or any provider SDK in this sandbox, no npm registry access). Verification tokens and links are real and correct; they're just logged instead of emailed. Swap the body of `sendMail` for a real provider call.
- **Enforcing email verification.** `isEmailVerified`/`/verify-email` exist, but nothing currently *requires* a verified email to log in or use the app — decide the policy (block login? limit community posting?) and add the check.
- **Password reset flow** — not built; would reuse the same hashed-token pattern as email verification.
- **HTTPS termination / reverse proxy config, Docker, CI** — Security/DevOps workstream.
- **Real crisis-detection model** — current implementation is a conservative keyword matcher; swap it for a trained classifier before any real users touch this.
- **Audit log retention/export for compliance** — current audit log is local files only.

## Folder structure

```
src/
  config/       env loading, DB connection
  controllers/  route handlers
  middleware/   auth, RBAC, security headers, validation, error handling
  models/       Mongoose schemas
  routes/       Express routers
  services/     token issuance, crisis detection, ML service client, email
  utils/        logger, TOTP (RFC 6238)
  app.js        Express app assembly
  server.js     process entry point, graceful shutdown
tests/
  env.setup.js        test environment variables (Jest setupFiles)
  testDb.js           in-memory MongoDB connect/disconnect/clear helpers
  helpers.js          test user + auth token factories
  auth.test.js
  rbac.test.js
  community.test.js
  crisisDetection.test.js
  screening.test.js
  mfa.test.js
  totp.test.js
```

## Note on `multer` and the ML service call

`package.json` lists `multer` (for screening's optional audio/video uploads)
and the screening routes/controller/service-client were only syntax-checked
(`node --check`) here, the same as the rest of this backend — `npm install`
was never runnable in this sandbox (see the note at the top of this file).
`src/services/mlServiceClient.js` uses Node's built-in `fetch`/`FormData`/`Blob`
(Node 18+), so it needs no extra dependency, and it was exercised for real
against a running `psyfusion-ml/service/app.py` instance with plain `curl`
(see that project's README) — just not from inside this Node process, since
this backend itself could not be started here.
