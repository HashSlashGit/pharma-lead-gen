import { type NextRequest, NextResponse } from 'next/server';

const AUTH_COOKIE = 'pharma_auth';

/**
 * Paths that bypass auth — webhooks (external callers) and health checks must
 * always be reachable, login routes must be reachable before a session exists,
 * and Next.js internals are never auth-gated.
 */
const ALWAYS_PUBLIC = [
  '/login',
  '/api/auth/',
  '/api/health',
  '/api/webhooks/',
  '/_next/',
  '/favicon.ico',
];

function isPublic(pathname: string): boolean {
  return ALWAYS_PUBLIC.some((p) => pathname === p || pathname.startsWith(p));
}

/**
 * Derive the expected cookie value from the app password + JWT secret using
 * HMAC-SHA-256 (Web Crypto API — available in both Edge and Node runtimes).
 */
async function expectedToken(password: string, secret: string): Promise<string> {
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

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const appPassword = process.env.APP_PASSWORD;

  // Auth is disabled when APP_PASSWORD is not configured (dev / local mode).
  if (!appPassword) return NextResponse.next();

  const { pathname } = req.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();

  const cookieValue = req.cookies.get(AUTH_COOKIE)?.value;
  const secret = process.env.JWT_SECRET ?? process.env.NEXTAUTH_SECRET ?? 'fallback-secret';
  const token = await expectedToken(appPassword, secret);

  if (cookieValue === token) return NextResponse.next();

  // API routes: return 401 instead of redirecting (callers handle JSON responses)
  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: 'Unauthorized — authentication required.' },
      { status: 401 }
    );
  }

  // Page routes: redirect to login, preserving destination for post-login redirect
  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = '/login';
  loginUrl.searchParams.set('from', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
