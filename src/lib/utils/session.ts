/**
 * Session token utilities.
 *
 * Token format (v2): v2|{userId}|{role}|{expiry}|{hmac}
 *   - userId:  MongoDB ObjectId string
 *   - role:    'admin' | 'user'
 *   - expiry:  Unix timestamp (ms) as decimal string
 *   - hmac:    HMAC-SHA256(hex) of "v2|userId|role|expiry"
 *
 * Works in both Node.js (login route) and Edge runtime (middleware).
 */

const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8 hours

// ── Build using Web Crypto (works in Edge + Node 18+) ────────────────────────

async function hmacHex(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function verifyHmac(message: string, sig: string, secret: string): Promise<boolean> {
  const expected = await hmacHex(message, secret);
  if (expected.length !== sig.length) return false;
  // Constant-time string comparison
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  return diff === 0;
}

export async function createSessionToken(
  userId: string,
  role: string,
  secret: string
): Promise<string> {
  const expiry = (Date.now() + SESSION_MAX_AGE_MS).toString();
  const message = `v2|${userId}|${role}|${expiry}`;
  const sig = await hmacHex(message, secret);
  return `${message}|${sig}`;
}

export interface SessionPayload {
  userId: string;
  role: 'admin' | 'user';
}

export async function verifySessionToken(
  token: string,
  secret: string
): Promise<SessionPayload | null> {
  if (!token.startsWith('v2|')) return null;

  const lastPipe = token.lastIndexOf('|');
  if (lastPipe === -1) return null;

  const message = token.substring(0, lastPipe);
  const sig = token.substring(lastPipe + 1);

  const parts = message.split('|');
  if (parts.length !== 4) return null;

  const [, userId, role, expiryStr] = parts;
  if (!userId || !role || !expiryStr) return null;

  if (Date.now() > parseInt(expiryStr, 10)) return null;

  const valid = await verifyHmac(message, sig, secret);
  if (!valid) return null;

  if (role !== 'admin' && role !== 'user') return null;

  return { userId, role };
}

export const SESSION_COOKIE = 'pharma_auth';
export const SESSION_MAX_AGE_SECONDS = SESSION_MAX_AGE_MS / 1000;
