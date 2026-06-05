export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongoose';
import InboxAccount from '@/lib/models/InboxAccount';
import { exchangeCodeForTokens } from '@/lib/services/gmail';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code  = searchParams.get('code');
  const error = searchParams.get('error');

  const settingsUrl = new URL('/settings', request.url);

  if (error) {
    settingsUrl.searchParams.set('gmail', 'error');
    settingsUrl.searchParams.set('gmail_error', error);
    return NextResponse.redirect(settingsUrl);
  }

  if (!code) {
    settingsUrl.searchParams.set('gmail', 'error');
    settingsUrl.searchParams.set('gmail_error', 'no_code');
    return NextResponse.redirect(settingsUrl);
  }

  try {
    const { accessToken, refreshToken, tokenExpiry, email } = await exchangeCodeForTokens(code);

    await connectDB();

    await InboxAccount.findOneAndUpdate(
      { email },
      { provider: 'gmail', email, accessToken, refreshToken, tokenExpiry, isActive: true },
      { upsert: true, new: true }
    );

    console.log(`[gmail/callback] InboxAccount saved for ${email}`);

    settingsUrl.searchParams.set('gmail', 'connected');
    return NextResponse.redirect(settingsUrl);
  } catch (err) {
    console.error('[gmail/callback]', err);
    settingsUrl.searchParams.set('gmail', 'error');
    settingsUrl.searchParams.set('gmail_error', 'token_exchange_failed');
    return NextResponse.redirect(settingsUrl);
  }
}
