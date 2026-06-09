import { NextResponse } from 'next/server';

/**
 * GET /api/production-check
 * Returns a production-readiness report.
 * Zero external API calls — pure env var inspection.
 * Safe to call at any time.
 */
export async function GET() {
  const isProduction = process.env.NODE_ENV === 'production';
  const dryRun = process.env.SMARTLEAD_DRY_RUN !== 'false'; // default = true (safe)

  return NextResponse.json({
    nodeEnv: process.env.NODE_ENV ?? 'unknown',
    isProduction,

    // Core requirements — all must be true before going live
    required: {
      mongodbUri: !!process.env.MONGODB_URI,
      smartleadApiKey: !!process.env.SMARTLEAD_API_KEY,
      smartleadCampaignId: !!process.env.SMARTLEAD_CAMPAIGN_ID,
      devRoutesBlocked: isProduction, // /api/dev/* return 403 in production
    },

    // Safety flags — review before enabling live send
    safety: {
      dryRunEnabled: dryRun, // true = safe test mode, false = real emails sent
      dryRunValue: process.env.SMARTLEAD_DRY_RUN ?? 'not set (defaults to dry-run)',
    },

    // Optional integrations
    optional: {
      claudeConfigured: !!process.env.CLAUDE_API_KEY,
      apolloConfigured: !!process.env.APOLLO_API_KEY,
      apifyConfigured: !!(process.env.APIFY_API_TOKEN ?? process.env.APIFY_TOKEN),
      websiteEnrichment: process.env.APIFY_WEBSITE_ENRICHMENT_ENABLED === 'true',
    },
  });
}
