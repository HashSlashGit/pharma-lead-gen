export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getGmailOAuthUrl } from '@/lib/services/gmail';
import { getSettings } from '@/lib/services/settingsCache';

export async function GET() {
  const s = await getSettings();
  const clientId     = s.googleClientId;
  const clientSecret = s.googleClientSecret;
  const redirectUri  = s.googleRedirectUri;

  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json(
      {
        error:
          'Gmail OAuth not configured. Add Google Client ID, Client Secret, and Redirect URI in Settings → Integrations.',
      },
      { status: 500 }
    );
  }

  try {
    const url = await getGmailOAuthUrl();
    return NextResponse.redirect(url);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
