import { type NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE } from '@/lib/utils/session';

/** Paths that bypass auth entirely (login page, auth API, static). */
const ALWAYS_PUBLIC = [
  '/login',
  '/api/auth/',
  '/api/health',
  '/_next/',
  '/favicon.ico',
];

function isPublic(pathname: string): boolean {
  return ALWAYS_PUBLIC.some((p) => pathname === p || pathname.startsWith(p));
}

/** Dev-only pages — blocked with a redirect in production. */
const DEV_ONLY_PATHS = ['/dev-tools', '/testing-checklist', '/production-checklist'];

function isDevOnlyBlocked(pathname: string): boolean {
  return (
    process.env.NODE_ENV === 'production' &&
    DEV_ONLY_PATHS.some((p) => pathname === p || pathname.startsWith(p))
  );
}

/**
 * Routes that require the admin role.
 * Server-side enforcement — do NOT rely on hidden UI alone.
 */
function isAdminRoute(pathname: string): boolean {
  return (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/api/users') ||
    pathname.startsWith('/settings') ||
    pathname.startsWith('/api/settings')
  );
}

/** Legacy: HMAC-SHA256(APP_PASSWORD, secret) — kept for backward compat with pre-user-system sessions. */
async function legacyToken(password: string, secret: string): Promise<string> {
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

function loginRedirect(req: NextRequest, pathname: string): NextResponse {
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('from', pathname);
  return NextResponse.redirect(url);
}

function misconfiguredResponse(pathname: string, req: NextRequest): NextResponse {
  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      {
        error:
          'Server misconfigured: JWT_SECRET environment variable is not set. ' +
          'Set it in your production environment and redeploy.',
      },
      { status: 503 },
    );
  }
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('error', 'server_misconfigured');
  return NextResponse.redirect(url);
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();

  if (isDevOnlyBlocked(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  // ── Production safety: JWT_SECRET must be explicitly configured ───────────
  // A missing JWT_SECRET means sessions fall back to 'fallback-secret', which
  // is publicly known and renders all tokens forgeable.
  if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    return misconfiguredResponse(pathname, req);
  }

  const cookie = req.cookies.get(SESSION_COOKIE)?.value ?? '';
  const jwtSecret = process.env.JWT_SECRET ?? process.env.NEXTAUTH_SECRET ?? 'fallback-secret';
  const appPassword = process.env.APP_PASSWORD;

  let authed = false;
  let isAdmin = false;

  if (cookie.startsWith('v2|')) {
    // Current user-based session (created by /api/auth/login)
    const payload = await verifySessionToken(cookie, jwtSecret);
    if (payload) {
      authed = true;
      isAdmin = payload.role === 'admin';
    }
  } else if (appPassword && cookie) {
    // Legacy single-password session (pre-user-system, kept for migration)
    const expected = await legacyToken(appPassword, jwtSecret);
    if (cookie === expected) {
      authed = true;
      isAdmin = true;
    }
  } else if (!appPassword && process.env.NODE_ENV !== 'production') {
    // Dev-mode only: no APP_PASSWORD set → allow through for local development.
    // This branch is NEVER reached in production (NODE_ENV check above ensures it).
    authed = true;
    isAdmin = true;
  }

  if (!authed) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Unauthorized — authentication required.' },
        { status: 401 },
      );
    }
    return loginRedirect(req, pathname);
  }

  // ── Admin-only enforcement (server-side) ──────────────────────────────────
  if (isAdminRoute(pathname) && !isAdmin) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Forbidden — admin access required.' },
        { status: 403 },
      );
    }
    const url = req.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
