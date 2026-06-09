import { type NextRequest } from 'next/server';
import { verifySessionToken, SESSION_COOKIE } from '@/lib/utils/session';

export interface Actor {
  actorId: string | null;
  actorEmail: string | null;
}

/**
 * Extracts actor identity from the session cookie for audit logging.
 * Never throws — returns nulls on any failure.
 */
export async function getRequestActor(req: NextRequest): Promise<Actor> {
  try {
    const token = req.cookies.get(SESSION_COOKIE)?.value ?? '';
    const secret = process.env.JWT_SECRET ?? process.env.NEXTAUTH_SECRET ?? 'fallback-secret';
    if (!token.startsWith('v2|')) return { actorId: null, actorEmail: null };
    const payload = await verifySessionToken(token, secret);
    if (!payload) return { actorId: null, actorEmail: null };
    return { actorId: payload.userId === 'legacy' ? null : payload.userId, actorEmail: null };
  } catch {
    return { actorId: null, actorEmail: null };
  }
}
