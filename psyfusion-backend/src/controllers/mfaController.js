const crypto = require('crypto');
const User = require('../models/User');
const { generateSecret, verifyTotp, buildOtpAuthUrl } = require('../utils/totp');
const { signAccessToken, signRefreshToken, verifyMfaChallengeToken, hashToken, REFRESH_COOKIE_NAME, refreshCookieOptions } = require('../services/tokenService');
const logger = require('../utils/logger');

const BACKUP_CODE_COUNT = 8;

function generateBackupCodes() {
  const codes = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    codes.push(crypto.randomBytes(5).toString('hex')); // 10 hex chars, easy to type
  }
  return codes;
}

/**
 * POST /api/auth/mfa/setup (authenticated)
 * Generates a new TOTP secret and stores it un-confirmed (mfaEnabled stays
 * false until /verify-setup proves the user actually added it to an
 * authenticator app). Calling this again before confirming just replaces
 * the pending secret.
 */
async function setupMfa(req, res, next) {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(401).json({ error: 'User no longer exists' });

    if (user.mfaEnabled) {
      return res.status(409).json({ error: 'MFA is already enabled. Disable it before setting up again.' });
    }

    const secret = generateSecret();
    user.mfaSecret = secret;
    await user.save();

    const otpauthUrl = buildOtpAuthUrl({ secret, accountName: user.email });

    return res.json({ secret, otpauthUrl });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/auth/mfa/verify-setup (authenticated)
 * Body: { code }. Confirms the pending secret with a real code from the
 * user's authenticator app, flips mfaEnabled on, and returns one-time
 * plaintext backup codes (never retrievable again after this response).
 */
async function verifySetup(req, res, next) {
  try {
    const { code } = req.body;
    const user = await User.findById(req.user.id).select('+mfaSecret');
    if (!user) return res.status(401).json({ error: 'User no longer exists' });

    if (!user.mfaSecret) {
      return res.status(400).json({ error: 'No MFA setup in progress. Call /mfa/setup first.' });
    }

    if (!verifyTotp(user.mfaSecret, code)) {
      return res.status(400).json({ error: 'Invalid code. Check your authenticator app and try again.' });
    }

    const backupCodes = generateBackupCodes();
    user.mfaEnabled = true;
    user.mfaBackupCodeHashes = backupCodes.map((c) => hashToken(c));
    await user.save();

    logger.audit('mfa_enabled', { userId: user._id.toString() });

    return res.json({
      message: 'MFA enabled.',
      backupCodes, // shown once - store these somewhere safe
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/auth/mfa/verify-login (public - this IS the second auth factor)
 * Body: { mfaToken, code }. `mfaToken` is the short-lived challenge issued
 * by /api/auth/login when mfaEnabled is true. `code` may be a 6-digit TOTP
 * code or an unused backup code.
 */
async function verifyLogin(req, res, next) {
  try {
    const { mfaToken, code } = req.body;
    if (!mfaToken || !code) {
      return res.status(400).json({ error: 'mfaToken and code are required' });
    }

    let payload;
    try {
      payload = verifyMfaChallengeToken(mfaToken);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired MFA challenge. Please log in again.' });
    }

    const user = await User.findById(payload.sub).select('+mfaSecret +mfaBackupCodeHashes +refreshTokenHashes');
    if (!user || !user.mfaEnabled) {
      return res.status(401).json({ error: 'Invalid or expired MFA challenge. Please log in again.' });
    }

    const validTotp = verifyTotp(user.mfaSecret, code);
    const validBackup = !validTotp && user.consumeBackupCodeHash(hashToken(code));

    if (!validTotp && !validBackup) {
      logger.audit('mfa_verify_failed', { userId: user._id.toString() });
      return res.status(401).json({ error: 'Invalid code' });
    }

    const accessToken = signAccessToken(user);
    const { token: refreshToken, jti } = signRefreshToken(user);
    user.addRefreshTokenHash(hashToken(refreshToken));
    await user.save();

    res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());
    logger.audit('login_success_mfa', { userId: user._id.toString(), jti, usedBackupCode: validBackup });

    return res.json({ accessToken, user: user.toSafeJSON() });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/auth/mfa/disable (authenticated)
 * Body: { password }. Requires the current password (not just a valid
 * session) so a hijacked-but-still-logged-in session can't silently turn
 * off the user's second factor.
 */
async function disableMfa(req, res, next) {
  try {
    const { password } = req.body;
    const user = await User.findById(req.user.id).select('+passwordHash');
    if (!user) return res.status(401).json({ error: 'User no longer exists' });

    const validPassword = await user.comparePassword(password || '');
    if (!validPassword) {
      return res.status(401).json({ error: 'Incorrect password' });
    }

    user.mfaEnabled = false;
    user.mfaSecret = null;
    user.mfaBackupCodeHashes = [];
    await user.save();

    logger.audit('mfa_disabled', { userId: user._id.toString() });

    return res.json({ message: 'MFA disabled.' });
  } catch (err) {
    return next(err);
  }
}

module.exports = { setupMfa, verifySetup, verifyLogin, disableMfa };
