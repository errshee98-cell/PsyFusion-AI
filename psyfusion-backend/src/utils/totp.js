/**
 * TOTP (RFC 6238, built on HOTP / RFC 4226) implemented with only Node's
 * built-in `crypto` - no `speakeasy`/`otplib` dependency. Those packages
 * couldn't be installed in the sandbox this was built in (no npm registry
 * access - see the backend README), and TOTP is simple enough, with a
 * well-specified RFC, to hand-roll correctly rather than leave MFA
 * unimplemented. Verified against the official RFC 6238 Appendix B test
 * vectors (SHA-1, 8-digit codes, 30s step) - see tests/totp.test.js.
 *
 * Defaults match what every mainstream authenticator app (Google
 * Authenticator, Authy, 1Password, etc.) assumes: SHA-1, 6 digits, 30s step.
 */

const crypto = require('crypto');

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer) {
  let bits = '';
  for (const byte of buffer) bits += byte.toString(2).padStart(8, '0');

  let output = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    output += BASE32_ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  }
  const remainder = bits.length % 5;
  if (remainder !== 0) {
    const lastChunk = bits.slice(bits.length - remainder).padEnd(5, '0');
    output += BASE32_ALPHABET[parseInt(lastChunk, 2)];
  }
  return output;
}

function base32Decode(encoded) {
  const clean = encoded.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) continue;
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

/** Generates a random base32 secret suitable for an authenticator app. */
function generateSecret(byteLength = 20) {
  return base32Encode(crypto.randomBytes(byteLength));
}

/** HOTP per RFC 4226. `counter` is the 8-byte moving factor. */
function hotp(secretBase32, counter, { digits = 6, algorithm = 'sha1' } = {}) {
  const key = base32Decode(secretBase32);
  const counterBuffer = Buffer.alloc(8);
  // Node has no writeBigUInt64BE on older versions in some environments;
  // counter values here are always small enough (Unix time / step), so
  // split into two 32-bit writes instead of relying on BigInt support.
  counterBuffer.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  counterBuffer.writeUInt32BE(counter >>> 0, 4);

  const hmac = crypto.createHmac(algorithm, key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binCode =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(binCode % 10 ** digits).padStart(digits, '0');
}

/** TOTP per RFC 6238: HOTP with counter = floor(unixTime / step). */
function totp(secretBase32, { step = 30, digits = 6, algorithm = 'sha1', timestamp = Date.now() } = {}) {
  const counter = Math.floor(Math.floor(timestamp / 1000) / step);
  return hotp(secretBase32, counter, { digits, algorithm });
}

/**
 * Verifies a user-supplied code, tolerating +/- `window` steps of clock
 * drift (default 1 step = up to ~30s either side) - without this, a device
 * clock that's a few seconds off locks the user out intermittently.
 */
function verifyTotp(secretBase32, code, { step = 30, digits = 6, algorithm = 'sha1', window = 1, timestamp = Date.now() } = {}) {
  if (!/^\d+$/.test(String(code))) return false;
  const counter = Math.floor(Math.floor(timestamp / 1000) / step);
  for (let errorWindow = -window; errorWindow <= window; errorWindow++) {
    const candidate = hotp(secretBase32, counter + errorWindow, { digits, algorithm });
    if (crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(String(code).padStart(digits, '0')))) {
      return true;
    }
  }
  return false;
}

/** Builds the otpauth:// URI an authenticator app's QR scanner expects. */
function buildOtpAuthUrl({ secret, accountName, issuer = 'PsyFusion AI' }) {
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  const params = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: '6', period: '30' });
  return `otpauth://totp/${label}?${params.toString()}`;
}

module.exports = { generateSecret, totp, verifyTotp, buildOtpAuthUrl, base32Encode, base32Decode };
