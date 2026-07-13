export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongoose';
import InboxAccount from '@/lib/models/InboxAccount';
import { exchangeCodeForTokens, GMAIL_OAUTH_STATE_COOKIE } from '@/lib/services/gmail';
import { invalidateHealthCache } from '@/app/api/health/route';
import { invalidateConfigCache } from '@/app/api/config/route';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code           = searchParams.get('code');
  const error          = searchParams.get('error');
  const returnedState  = searchParams.get('state');
  const expectedState  = request.cookies.get(GMAIL_OAUTH_STATE_COOKIE)?.value;

  const settingsUrl = new URL('/settings', request.url);

  // The state cookie is single-use — always clear it before returning,
  // regardless of outcome.
  function redirectClearingState(): NextResponse {
    const res = NextResponse.redirect(settingsUrl);
    res.cookies.set(GMAIL_OAUTH_STATE_COOKIE, '', { maxAge: 0, path: '/api/gmail' });
    return res;
  }

  if (error) {
    settingsUrl.searchParams.set('gmail', 'error');
    settingsUrl.searchParams.set('gmail_error', error);
    return redirectClearingState();
  }

  if (!code) {
    settingsUrl.searchParams.set('gmail', 'error');
    settingsUrl.searchParams.set('gmail_error', 'no_code');
    return redirectClearingState();
  }

  // CSRF protection: the state we handed Google in /api/gmail/connect must
  // come back unchanged. A missing/mismatched state means this callback
  // was not triggered by an authorization request we issued.
  if (!expectedState || !returnedState || returnedState !== expectedState) {
    console.error('[gmail/callback] OAuth state mismatch — possible CSRF attempt');
    settingsUrl.searchParams.set('gmail', 'error');
    settingsUrl.searchParams.set('gmail_error', 'invalid_state');
    return redirectClearingState();
  }

  try {
    const { accessToken, refreshToken, tokenExpiry, email } = await exchangeCodeForTokens(code, request.nextUrl.origin);

    await connectDB();

    // Multiple Gmail accounts can be active at once — mailbox rotation
    // sends round-robin across every isActive:true InboxAccount. Upserting
    // by email updates the same record when reconnecting the same address,
    // and creates a new active record when a different Google account is
    // authorized. Existing active accounts are intentionally left
    // untouched so rotation keeps working across all of them.
    await InboxAccount.findOneAndUpdate(
      { email },
      { provider: 'gmail', email, accessToken, refreshToken, tokenExpiry, isActive: true },
      { upsert: true, new: true }
    );

    console.log(`[gmail/callback] InboxAccount saved for ${email}`);

    // /api/health and /api/config each hold an in-memory cache (60s / 30s
    // TTL) of connected Gmail accounts. Without invalidating them here, the
    // Settings page could keep showing pre-OAuth data until the TTL
    // naturally expired — the source of the "sometimes refreshing fixes
    // it" behavior. Both helpers are the same ones already used by the
    // settings-save path (src/app/api/settings/integrations/route.ts).
    invalidateHealthCache();
    invalidateConfigCache();

    settingsUrl.searchParams.set('gmail', 'connected');
    settingsUrl.searchParams.set('gmail_email', email);
    return redirectClearingState();
  } catch (err) {
    console.error('[gmail/callback]', err);
    // A failure after the mailbox write (e.g. DB error) could have changed
    // which accounts are active — invalidate so stale cached data is never
    // served even on the error path.
    invalidateHealthCache();
    invalidateConfigCache();
    settingsUrl.searchParams.set('gmail', 'error');
    settingsUrl.searchParams.set('gmail_error', 'token_exchange_failed');
    return redirectClearingState();
  }
}
