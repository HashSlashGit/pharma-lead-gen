export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE } from '@/lib/utils/session';
import { connectDB } from '@/lib/db/mongoose';
import User from '@/lib/models/User';

async function legacyTokenValue(password: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(password));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** GET /api/auth/me — returns authenticated user info from current session cookie. */
export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value ?? '';
  const jwtSecret = process.env.JWT_SECRET ?? process.env.NEXTAUTH_SECRET ?? 'fallback-secret';
  const appPassword = process.env.APP_PASSWORD;

  // Dev mode (no APP_PASSWORD configured)
  if (!appPassword) {
    return NextResponse.json({
      authenticated: true,
      user: { id: null, name: 'Admin', email: null, role: 'admin' },
    });
  }

  if (!token) {
    return NextResponse.json({ authenticated: false });
  }

  if (token.startsWith('v2|')) {
    const payload = await verifySessionToken(token, jwtSecret);
    if (!payload) return NextResponse.json({ authenticated: false });

    // Legacy v2 session (userId = 'legacy') created from APP_PASSWORD login
    if (payload.userId === 'legacy') {
      return NextResponse.json({
        authenticated: true,
        user: { id: null, name: 'Admin', email: null, role: 'admin' },
      });
    }

    // DB-backed user session
    try {
      await connectDB();
      const user = await User.findById(payload.userId, { passwordHash: 0 }).lean() as {
        _id: unknown;
        name: string;
        email: string;
        role: 'admin' | 'user';
        active: boolean;
      } | null;

      if (!user || !user.active) return NextResponse.json({ authenticated: false });

      return NextResponse.json({
        authenticated: true,
        user: { id: String(user._id), name: user.name, email: user.email, role: user.role },
      });
    } catch {
      // DB unavailable — fall back to token payload so UI still works
      return NextResponse.json({
        authenticated: true,
        user: { id: payload.userId, name: null, email: null, role: payload.role },
      });
    }
  }

  // Pre-v2 legacy HMAC hex token
  const expected = await legacyTokenValue(appPassword, jwtSecret);
  if (token === expected) {
    return NextResponse.json({
      authenticated: true,
      user: { id: null, name: 'Admin', email: null, role: 'admin' },
    });
  }

  return NextResponse.json({ authenticated: false });
}
