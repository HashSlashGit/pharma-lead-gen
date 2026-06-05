import { NextResponse } from 'next/server';
import { getSmartleadMode } from '@/lib/services/smartlead';

/**
 * GET /api/config
 * Returns non-sensitive runtime configuration flags for the frontend.
 * Never exposes API keys — only boolean flags derived from env vars.
 */
export async function GET() {
  const { isDryRun, isConfigured } = getSmartleadMode();

  return NextResponse.json({
    smartlead: {
      configured: isConfigured,
      dryRun: isDryRun,
      campaignIdPresent: !!process.env.SMARTLEAD_CAMPAIGN_ID,
      // Expose the campaign ID value — it is an internal Smartlead reference,
      // not an authentication credential, so safe to show in the dashboard UI.
      campaignId: process.env.SMARTLEAD_CAMPAIGN_ID ?? null,
      fromEmailConfigured: !!process.env.SMARTLEAD_FROM_EMAIL,
      sendButtonLabel: isDryRun ? 'Test Send' : 'Send via Smartlead',
      mode: !isConfigured ? 'no_key' : isDryRun ? 'dry_run' : 'live',
    },
    claude: { configured: !!process.env.CLAUDE_API_KEY },
    apollo: { configured: !!process.env.APOLLO_API_KEY },
    apify: {
      configured: !!(process.env.APIFY_API_TOKEN ?? process.env.APIFY_TOKEN),
      websiteEnrichment: process.env.APIFY_WEBSITE_ENRICHMENT_ENABLED === 'true',
    },
  });
}
