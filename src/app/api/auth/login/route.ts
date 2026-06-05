import { NextRequest, NextResponse } from 'next/server';

const AUTH_COOKIE = 'pharma_auth';
const SESSION_MAX_AGE = 8 * 60 * 60; // 8 hours

async function deriveToken(password: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(password));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function POST(req: NextRequest) {
  const appPassword = process.env.APP_PASSWORD;

  if (!appPassword) {
    return NextResponse.json(
      { error: 'Authentication is not configured on this server.' },
      { status: 503 }
    );
  }

  let body: { password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (!body.password || body.password !== appPassword) {
    return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 });
  }

  const secret = process.env.JWT_SECRET ?? process.env.NEXTAUTH_SECRET ?? 'fallback-secret';
  const token = await deriveToken(appPassword, secret);

  const res = NextResponse.json({ success: true });
  res.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });
  return res;
}
