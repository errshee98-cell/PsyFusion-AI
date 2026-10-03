const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const SALT_ROUNDS = 12;

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email address'],
    },
    passwordHash: {
      type: String,
      required: true,
      select: false, // never returned by default queries
    },
    displayName: {
      type: String,
      trim: true,
      maxlength: 60,
    },
    // Stable, random handle used ONLY in the anonymous community module.
    // Never render email/displayName next to community content.
    anonymousHandle: {
      type: String,
      unique: true,
      default: () => `anon_${crypto.randomBytes(5).toString('hex')}`,
    },
    role: {
      type: String,
      enum: ['user', 'clinician', 'admin'],
      default: 'user',
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    // Hashed (SHA-256) email verification token + expiry - same pattern as
    // refresh tokens: never store the raw token server-side.
    emailVerificationTokenHash: { type: String, select: false, default: null },
    emailVerificationExpires: { type: Date, select: false, default: null },

    // MFA (TOTP, RFC 6238). `mfaSecret` is set as soon as setup starts but
    // `mfaEnabled` only flips to true once the user proves possession with
    // a valid code in /mfa/verify-setup - so a secret sitting unconfirmed
    // never silently protects (or locks out) the account.
    mfaEnabled: { type: Boolean, default: false },
    mfaSecret: { type: String, select: false, default: null },
    mfaBackupCodeHashes: { type: [String], select: false, default: [] },
    // Hashed refresh tokens currently valid for this user (rotation support:
    // issuing a new refresh token removes the old one from this list).
    refreshTokenHashes: {
      type: [String],
      select: false,
      default: [],
    },
    failedLoginAttempts: {
      type: Number,
      default: 0,
      select: false,
    },
    lockUntil: {
      type: Date,
      default: null,
      select: false,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
    // Clinician-only: license/credential reference checked during onboarding,
    // kept out of the default projection.
    clinicianCredentialRef: {
      type: String,
      select: false,
    },
  },
  { timestamps: true }
);

userSchema.methods.setPassword = async function setPassword(plainPassword) {
  this.passwordHash = await bcrypt.hash(plainPassword, SALT_ROUNDS);
};

userSchema.methods.comparePassword = function comparePassword(plainPassword) {
  return bcrypt.compare(plainPassword, this.passwordHash);
};

userSchema.methods.isLocked = function isLocked() {
  return Boolean(this.lockUntil && this.lockUntil > Date.now());
};

userSchema.methods.addRefreshTokenHash = function addRefreshTokenHash(hash) {
  this.refreshTokenHashes.push(hash);
};

userSchema.methods.removeRefreshTokenHash = function removeRefreshTokenHash(hash) {
  this.refreshTokenHashes = this.refreshTokenHashes.filter((h) => h !== hash);
};

userSchema.methods.consumeBackupCodeHash = function consumeBackupCodeHash(hash) {
  const index = this.mfaBackupCodeHashes.indexOf(hash);
  if (index === -1) return false;
  this.mfaBackupCodeHashes.splice(index, 1); // one-time use
  return true;
};

userSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: this._id,
    email: this.email,
    displayName: this.displayName,
    anonymousHandle: this.anonymousHandle,
    role: this.role,
    isEmailVerified: this.isEmailVerified,
    mfaEnabled: this.mfaEnabled,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model('User', userSchema);
