export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getSettings } from '@/lib/services/settingsCache';

/**
 * GET /api/config
 * Returns non-sensitive runtime configuration flags for the frontend.
 * Never exposes API keys — only boolean flags and non-credential references.
 */
export async function GET() {
  const s = await getSettings();

  const isDryRun = s.smartleadDryRun;
  const isConfigured = !!s.smartleadApiKey;

  return NextResponse.json({
    smartlead: {
      configured: isConfigured,
      dryRun: isDryRun,
      campaignIdPresent: !!s.smartleadCampaignId,
      campaignId: s.smartleadCampaignId ?? null,
      fromEmailConfigured: !!s.smartleadFromEmail,
      sendButtonLabel: isDryRun ? 'Test Send' : 'Send via Smartlead',
      mode: !isConfigured ? 'no_key' : isDryRun ? 'dry_run' : 'live',
    },
    claude: { configured: !!s.claudeApiKey },
    apollo: { configured: !!s.apolloApiKey },
    apify: {
      configured: !!s.apifyToken,
      websiteEnrichment: s.apifyWebsiteEnrichment,
    },
  });
}
