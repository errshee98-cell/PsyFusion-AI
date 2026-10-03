const crypto = require('crypto');
const User = require('../models/User');
const env = require('../config/env');
const logger = require('../utils/logger');
const {
  signAccessToken,
  signRefreshToken,
  signMfaChallengeToken,
  hashToken,
  verifyRefreshToken,
  REFRESH_COOKIE_NAME,
  refreshCookieOptions,
} = require('../services/tokenService');
const { sendMail, buildVerificationEmail } = require('../services/emailService');

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

function issueVerificationToken() {
  const rawToken = crypto.randomBytes(32).toString('hex');
  return { rawToken, tokenHash: hashToken(rawToken) };
}

async function register(req, res, next) {
  try {
    const { email, password, displayName } = req.body;

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      // Same response whether or not the email exists, to avoid user enumeration.
      return res.status(201).json({
        message: 'If that email is available, an account has been created. Please check your inbox.',
      });
    }

    const user = new User({ email: email.toLowerCase(), displayName });
    await user.setPassword(password);

    const { rawToken, tokenHash } = issueVerificationToken();
    user.emailVerificationTokenHash = tokenHash;
    user.emailVerificationExpires = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS);
    await user.save();

    logger.audit('user_registered', { userId: user._id.toString() });

    const verifyUrl = `${env.FRONTEND_URL}/verify-email?token=${rawToken}`;
    sendMail(buildVerificationEmail({ email: user.email, verifyUrl })).catch((err) =>
      logger.error(`Failed to send verification email: ${err.message}`)
    );

    return res.status(201).json({
      message: 'If that email is available, an account has been created. Please check your inbox.',
    });
  } catch (err) {
    return next(err);
  }
}

async function verifyEmail(req, res, next) {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'token is required' });
    }

    const tokenHash = hashToken(token);
    const user = await User.findOne({ emailVerificationTokenHash: tokenHash }).select(
      '+emailVerificationTokenHash +emailVerificationExpires'
    );

    if (!user || !user.emailVerificationExpires || user.emailVerificationExpires < new Date()) {
      return res.status(400).json({ error: 'Invalid or expired verification link' });
    }

    user.isEmailVerified = true;
    user.emailVerificationTokenHash = null;
    user.emailVerificationExpires = null;
    await user.save();

    logger.audit('email_verified', { userId: user._id.toString() });

    return res.json({ message: 'Email verified. You can now sign in.' });
  } catch (err) {
    return next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() }).select(
      '+passwordHash +failedLoginAttempts +lockUntil +refreshTokenHashes'
    );

    // Constant-shape response to avoid leaking which emails exist.
    const genericFail = () => res.status(401).json({ error: 'Invalid email or password' });

    if (!user) return genericFail();

    if (user.isLocked()) {
      logger.audit('login_blocked_locked', { userId: user._id.toString() });
      return res.status(423).json({
        error: `Account temporarily locked due to repeated failed attempts. Try again later.`,
      });
    }

    const validPassword = await user.comparePassword(password);
    if (!validPassword) {
      user.failedLoginAttempts += 1;
      if (user.failedLoginAttempts >= env.MAX_LOGIN_ATTEMPTS) {
        user.lockUntil = new Date(Date.now() + env.LOCKOUT_DURATION_MINUTES * 60 * 1000);
        user.failedLoginAttempts = 0;
        logger.audit('account_locked', { userId: user._id.toString() });
      }
      await user.save();
      return genericFail();
    }

    // success: reset lockout counters
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    user.lastLoginAt = new Date();

    if (user.mfaEnabled) {
      // Password was correct, but don't issue real tokens yet - the client
      // must complete /api/auth/mfa/verify-login with this short-lived
      // challenge token plus a TOTP/backup code first.
      await user.save();
      const mfaToken = signMfaChallengeToken(user);
      logger.audit('login_mfa_challenge_issued', { userId: user._id.toString() });
      return res.json({ mfaRequired: true, mfaToken });
    }

    const accessToken = signAccessToken(user);
    const { token: refreshToken, jti } = signRefreshToken(user);
    user.addRefreshTokenHash(hashToken(refreshToken));
    await user.save();

    res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());
    logger.audit('login_success', { userId: user._id.toString(), jti });

    return res.json({ accessToken, user: user.toSafeJSON() });
  } catch (err) {
    return next(err);
  }
}

async function refresh(req, res, next) {
  try {
    const token = req.cookies?.[REFRESH_COOKIE_NAME];
    if (!token) {
      return res.status(401).json({ error: 'Missing refresh token' });
    }

    let payload;
    try {
      payload = verifyRefreshToken(token);
    } catch (err) {
      res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions());
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    const user = await User.findById(payload.sub).select('+refreshTokenHashes');
    if (!user) {
      return res.status(401).json({ error: 'User no longer exists' });
    }

    const incomingHash = hashToken(token);
    if (!user.refreshTokenHashes.includes(incomingHash)) {
      // Token not in the known-good list: either already rotated out or stolen.
      // Revoke all sessions for this user as a precaution.
      user.refreshTokenHashes = [];
      await user.save();
      logger.audit('refresh_reuse_detected', { userId: user._id.toString() });
      res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions());
      return res.status(401).json({ error: 'Session invalid. Please log in again.' });
    }

    // Rotate: remove the used token, issue a new one
    user.removeRefreshTokenHash(incomingHash);
    const accessToken = signAccessToken(user);
    const { token: newRefreshToken } = signRefreshToken(user);
    user.addRefreshTokenHash(hashToken(newRefreshToken));
    await user.save();

    res.cookie(REFRESH_COOKIE_NAME, newRefreshToken, refreshCookieOptions());
    return res.json({ accessToken });
  } catch (err) {
    return next(err);
  }
}

async function logout(req, res, next) {
  try {
    const token = req.cookies?.[REFRESH_COOKIE_NAME];
    if (token) {
      try {
        const payload = verifyRefreshToken(token);
        const user = await User.findById(payload.sub).select('+refreshTokenHashes');
        if (user) {
          user.removeRefreshTokenHash(hashToken(token));
          await user.save();
        }
      } catch (err) {
        // token already invalid/expired - nothing to revoke, fall through to clear cookie
      }
    }
    res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions());
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}

async function me(req, res, next) {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(401).json({ error: 'User no longer exists' });
    }
    return res.json({ user: user.toSafeJSON() });
  } catch (err) {
    return next(err);
  }
}

module.exports = { register, login, verifyEmail, refresh, logout, me };
