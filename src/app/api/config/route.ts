export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getSettings } from '@/lib/services/settingsCache';
import InboxAccount from '@/lib/models/InboxAccount';
import { connectDB } from '@/lib/db/mongoose';

// 30-second in-memory cache — /api/config is fetched by campaigns and leads pages on every mount.
let _configCache: Record<string, unknown> | null = null;
let _configCacheExpiry = 0;
const CONFIG_CACHE_TTL = 30_000;

export function invalidateConfigCache(): void {
  _configCache = null;
  _configCacheExpiry = 0;
}

/**
 * GET /api/config
 * Returns non-sensitive runtime configuration flags for the frontend.
 * Never exposes API keys — only boolean flags and non-credential references.
 */
export async function GET() {
  if (_configCache && Date.now() < _configCacheExpiry) {
    return NextResponse.json(_configCache);
  }
  const s = await getSettings();

  let gmailConnected = false;
  let gmailEmail: string | null = null;
  try {
    await connectDB();
    const account = await InboxAccount.findOne({ provider: 'gmail', isActive: true }).lean();
    gmailConnected = !!account;
    gmailEmail = account?.email ?? null;
  } catch {
    // DB unavailable — non-fatal
  }

  const googleConfigured = !!(s.googleClientId && s.googleClientSecret);

  const configPayload: Record<string, unknown> = {
    gmail: {
      oauthConfigured: googleConfigured,
      connected:       gmailConnected,
      email:           gmailEmail,
      sendButtonLabel: gmailConnected ? 'Send via Gmail' : 'Connect Gmail to Send',
      mode:            !googleConfigured ? 'no_key' : !gmailConnected ? 'not_connected' : 'live',
    },
    claude: { configured: !!s.claudeApiKey },
    apollo: { configured: !!s.apolloApiKey },
    apify: {
      configured:       !!s.apifyToken,
      websiteEnrichment: s.apifyWebsiteEnrichment,
    },
  };
  _configCache = configPayload;
  _configCacheExpiry = Date.now() + CONFIG_CACHE_TTL;
  return NextResponse.json(configPayload);
}
