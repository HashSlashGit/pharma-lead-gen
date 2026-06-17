export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getGmailOAuthUrl } from '@/lib/services/gmail';
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
    const url = await getGmailOAuthUrl(request.nextUrl.origin);
    return NextResponse.redirect(url);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
