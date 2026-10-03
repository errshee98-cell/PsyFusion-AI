const { totp, verifyTotp, generateSecret, base32Encode, base32Decode, buildOtpAuthUrl } = require('../src/utils/totp');

// These are the official RFC 6238 Appendix B test vectors: ASCII secret
// '12345678901234567890' (20 bytes), SHA-1, 8-digit codes, 30s step, T0=0.
// Each value below was independently confirmed against the RFC's published
// table before being written here (see the comment in src/utils/totp.js).
describe('totp - RFC 6238 Appendix B test vectors', () => {
  const secretAscii = Buffer.from('12345678901234567890', 'ascii');
  const secretB32 = base32Encode(secretAscii);

  it.each([
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
  ])('produces %s -> %s', (unixSeconds, expected) => {
    const code = totp(secretB32, { step: 30, digits: 8, algorithm: 'sha1', timestamp: unixSeconds * 1000 });
    expect(code).toBe(expected);
  });
});

describe('base32Encode / base32Decode', () => {
  it('round-trips arbitrary bytes', () => {
    const original = Buffer.from('12345678901234567890', 'ascii');
    const encoded = base32Encode(original);
    expect(encoded).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(base32Decode(encoded).equals(original)).toBe(true);
  });
});

describe('verifyTotp', () => {
  const secret = generateSecret();

  it('accepts the current valid code', () => {
    const code = totp(secret);
    expect(verifyTotp(secret, code)).toBe(true);
  });

  it('rejects an incorrect code', () => {
    const code = totp(secret);
    const wrong = code === '000000' ? '111111' : '000000';
    expect(verifyTotp(secret, wrong)).toBe(false);
  });

  it('tolerates a code from one step (30s) ago, within the default window', () => {
    const past = totp(secret, { timestamp: Date.now() - 20000 });
    expect(verifyTotp(secret, past)).toBe(true);
  });

  it('rejects a code far outside the drift window', () => {
    const farPast = totp(secret, { timestamp: Date.now() - 10 * 60 * 1000 });
    const current = totp(secret);
    if (farPast !== current) {
      expect(verifyTotp(secret, farPast)).toBe(false);
    }
  });

  it('rejects non-numeric input without throwing', () => {
    expect(verifyTotp(secret, 'abcdef')).toBe(false);
  });
});

describe('buildOtpAuthUrl', () => {
  it('builds a valid otpauth:// URI with the expected parameters', () => {
    const url = buildOtpAuthUrl({ secret: 'ABCDEF123456', accountName: 'user@example.com' });
    expect(url).toMatch(/^otpauth:\/\/totp\//);
    expect(url).toContain('secret=ABCDEF123456');
    expect(url).toContain('issuer=PsyFusion');
    expect(url).toContain('digits=6');
    expect(url).toContain('period=30');
  });
});
