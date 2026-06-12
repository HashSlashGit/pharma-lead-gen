import { NextRequest, NextResponse } from 'next/server';
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from '@/lib/utils/session';
import { hashPassword, verifyPassword } from '@/lib/utils/password';
import { connectDB } from '@/lib/db/mongoose';
import User from '@/lib/models/User';

function cookieOpts(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    maxAge,
    path: '/',
  };
}

async function ensureFirstAdmin(): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) return;

  const count = await User.countDocuments();
  if (count > 0) return;

  await User.create({
    name: 'Admin',
    email: adminEmail.toLowerCase().trim(),
    passwordHash: hashPassword(adminPassword),
    role: 'admin',
    active: true,
  });
  console.log('[auth/login] First admin user created from ADMIN_EMAIL env');
}

export async function POST(req: NextRequest) {
  const jwtSecret = process.env.JWT_SECRET ?? process.env.NEXTAUTH_SECRET ?? 'fallback-secret';

  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { email, password } = body;
  if (!password) {
    return NextResponse.json({ error: 'Password is required.' }, { status: 400 });
  }

  // ── User-based authentication ─────────────────────────────────────────────
  if (email) {
    try {
      await connectDB();
      await ensureFirstAdmin();

      const user = await User.findOne({ email: email.toLowerCase().trim() }).lean();
      if (!user) {
        return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
      }
      if (!user.active) {
        return NextResponse.json({ error: 'Account is disabled. Contact an administrator.' }, { status: 403 });
      }
      if (!verifyPassword(password, user.passwordHash)) {
        return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
      }

      const token = await createSessionToken(String(user._id), user.role, jwtSecret);
      const res = NextResponse.json({ success: true });
      res.cookies.set(SESSION_COOKIE, token, cookieOpts(SESSION_MAX_AGE_SECONDS));
      return res;
    } catch (err) {
      console.error('[auth/login] DB error:', err);
      return NextResponse.json(
        { error: 'Authentication service unavailable. Please try again shortly.' },
        { status: 503 },
      );
    }
  }

  // ── Legacy single-password fallback (no email provided) ──────────────────
  const appPassword = process.env.APP_PASSWORD;
  if (!appPassword) {
    return NextResponse.json({ error: 'Authentication is not configured on this server.' }, { status: 503 });
  }
  if (password !== appPassword) {
    return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 });
  }

  const token = await createSessionToken('legacy', 'admin', jwtSecret);
  const res = NextResponse.json({ success: true });
  res.cookies.set(SESSION_COOKIE, token, cookieOpts(SESSION_MAX_AGE_SECONDS));
  return res;
}
