import { scryptSync, randomBytes, timingSafeEqual } from 'crypto';

const KEYLEN = 32;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, KEYLEN, SCRYPT_PARAMS);
  return `${salt}:${hash.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const colonIdx = stored.indexOf(':');
  if (colonIdx === -1) return false;
  const salt = stored.slice(0, colonIdx);
  const storedHash = stored.slice(colonIdx + 1);
  try {
    const hash = scryptSync(password, salt, KEYLEN, SCRYPT_PARAMS);
    const storedBuf = Buffer.from(storedHash, 'hex');
    if (hash.length !== storedBuf.length) return false;
    return timingSafeEqual(hash, storedBuf);
  } catch {
    return false;
  }
}
