const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const env = require('../config/env');

function signAccessToken(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
    issuer: 'psyfusion-ai',
  });
}

function signRefreshToken(user) {
  // jti lets us identify/revoke this specific refresh token independent of its hash
  const jti = crypto.randomUUID();
  const token = jwt.sign({ sub: user._id.toString(), jti }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
    issuer: 'psyfusion-ai',
  });
  return { token, jti };
}

/**
 * Short-lived token proving "this user's password was just verified" -
 * NOT an access token. Signed with a completely separate secret
 * (MFA_CHALLENGE_SECRET) specifically so it can never be mistaken for one
 * by authenticate() (see the comment on MFA_CHALLENGE_SECRET in config/env.js).
 */
function signMfaChallengeToken(user) {
  return jwt.sign({ sub: user._id.toString(), typ: 'mfa_challenge' }, env.MFA_CHALLENGE_SECRET, {
    expiresIn: env.MFA_CHALLENGE_EXPIRES_IN,
    issuer: 'psyfusion-ai',
  });
}

function verifyMfaChallengeToken(token) {
  const payload = jwt.verify(token, env.MFA_CHALLENGE_SECRET, { issuer: 'psyfusion-ai' });
  if (payload.typ !== 'mfa_challenge') {
    throw new Error('Not an MFA challenge token');
  }
  return payload;
}

function hashToken(token) {
  // Store only a SHA-256 hash of refresh tokens server-side, never the raw token.
  return crypto.createHash('sha256').update(token).digest('hex');
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: 'psyfusion-ai' });
}

function verifyRefreshToken(token) {
  return jwt.verify(token, env.JWT_REFRESH_SECRET, { issuer: 'psyfusion-ai' });
}

const REFRESH_COOKIE_NAME = 'psyfusion_rt';

function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    domain: env.COOKIE_DOMAIN,
    path: '/api/auth',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  signMfaChallengeToken,
  verifyMfaChallengeToken,
  hashToken,
  verifyAccessToken,
  verifyRefreshToken,
  REFRESH_COOKIE_NAME,
  refreshCookieOptions,
};
