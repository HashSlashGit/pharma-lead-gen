export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { getGmailOAuthUrl, GMAIL_OAUTH_STATE_COOKIE } from '@/lib/services/gmail';
import { getSettings } from '@/lib/services/settingsCache';

export async function GET(request: NextRequest) {
  const s = await getSettings();
  const clientId     = s.googleClientId;
  const clientSecret = s.googleClientSecret;

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: 'Gmail OAuth not configured. Add Google Client ID and Client Secret in Settings → Integrations.' },
      { status: 500 }
    );
  }

  try {
    // CSRF protection: bind this authorization request to a random token,
    // stashed in a short-lived httpOnly cookie, and verified against the
    // `state` Google echoes back in /api/gmail/callback.
    const state = randomBytes(32).toString('hex');
    const url = await getGmailOAuthUrl(request.nextUrl.origin, state);

    const res = NextResponse.redirect(url);
    res.cookies.set(GMAIL_OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600,
      path: '/api/gmail',
    });
    return res;
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
