import crypto from 'node:crypto';

const SCRYPT_KEY_LENGTH = 64;

export function createPasswordHash(password) {
  validatePassword(password);
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEY_LENGTH).toString('hex');
  return { salt, hash };
}

export function verifyPassword(password, salt, expectedHash) {
  const actual = crypto.scryptSync(password, salt, SCRYPT_KEY_LENGTH);
  const expected = Buffer.from(expectedHash, 'hex');
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

export function validatePassword(password) {
  if (String(password || '').length < 10) {
    throw new Error('Password must be at least 10 characters.');
  }
}

export function sessionExpiry(days = 14) {
  const expires = new Date();
  expires.setUTCDate(expires.getUTCDate() + days);
  return expires.toISOString();
}
