export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongoose';
import IntegrationSettings from '@/lib/models/IntegrationSettings';
import { encrypt, maskSecret, decrypt, isEncryptionConfigured } from '@/lib/utils/encryption';
import type { EncryptedField } from '@/lib/utils/encryption';
import { invalidateSettingsCache } from '@/lib/services/settingsCache';
import type { IIntegrationSettings } from '@/lib/models/IntegrationSettings';

function safeDecrypt(field: EncryptedField | undefined): string | undefined {
  if (!field?.ct || !isEncryptionConfigured()) return undefined;
  try { return decrypt(field); } catch { return undefined; }
}

function maskedOrConfigured(field: EncryptedField | undefined, envFallback?: string): {
  configured: boolean;
  masked: string | null;
} {
  const decrypted = safeDecrypt(field);
  if (decrypted) return { configured: true, masked: maskSecret(decrypted) };
  if (envFallback) return { configured: true, masked: maskSecret(envFallback) };
  return { configured: false, masked: null };
}

/** GET /api/settings/integrations — masked values only, never full secrets */
export async function GET() {
  try {
    await connectDB();
    const doc = await IntegrationSettings.findOne({}).lean<IIntegrationSettings>();

    return NextResponse.json({
      encryptionAvailable: isEncryptionConfigured(),
      claude: maskedOrConfigured(doc?.claudeApiKey, process.env.CLAUDE_API_KEY),
      smartlead: {
        ...maskedOrConfigured(doc?.smartleadApiKey, process.env.SMARTLEAD_API_KEY),
        campaignId: doc?.smartleadCampaignId || process.env.SMARTLEAD_CAMPAIGN_ID || null,
        fromEmail:  doc?.smartleadFromEmail  || process.env.SMARTLEAD_FROM_EMAIL  || null,
        fromName:   doc?.smartleadFromName   || process.env.SMARTLEAD_FROM_NAME   || null,
        dryRun:     doc?.smartleadDryRun     ?? (process.env.SMARTLEAD_DRY_RUN !== 'false'),
      },
      apollo: {
        ...maskedOrConfigured(doc?.apolloApiKey, process.env.APOLLO_API_KEY),
        maxResults: doc?.apolloMaxResults ?? (parseInt(process.env.APOLLO_MAX_RESULTS_LIMIT ?? '25', 10) || 25),
      },
      apify: {
        ...maskedOrConfigured(doc?.apifyToken, process.env.APIFY_API_TOKEN || process.env.APIFY_TOKEN),
        actorId:           doc?.apifyActorId           || process.env.APIFY_GOOGLE_MAPS_ACTOR_ID || null,
        maxResults:        doc?.apifyMaxResults        ?? (parseInt(process.env.APIFY_GOOGLE_MAPS_MAX_RESULTS_LIMIT ?? '50', 10) || 50),
        websiteEnrichment: doc?.apifyWebsiteEnrichment ?? (process.env.APIFY_WEBSITE_ENRICHMENT_ENABLED === 'true'),
      },
      mailbox: {
        enabled:        doc?.mailboxEnabled    ?? (process.env.MAILBOX_SYNC_ENABLED === 'true'),
        imapHost:       doc?.mailboxImapHost   || process.env.MAILBOX_IMAP_HOST  || null,
        imapPort:       doc?.mailboxImapPort   ?? (parseInt(process.env.MAILBOX_IMAP_PORT ?? '993', 10) || 993),
        imapSecure:     doc?.mailboxImapSecure ?? (process.env.MAILBOX_IMAP_SECURE !== 'false'),
        user:           doc?.mailboxUser       || process.env.MAILBOX_USER       || null,
        lookbackDays:   doc?.mailboxLookbackDays ?? (parseInt(process.env.MAILBOX_LOOKBACK_DAYS ?? '14', 10) || 14),
        passwordConfigured: !!(safeDecrypt(doc?.mailboxPassword) || process.env.MAILBOX_APP_PASSWORD),
      },
      appUrl: doc?.appUrl || process.env.APP_PUBLIC_URL || process.env.APP_URL || null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'Failed to load integration settings', details: msg }, { status: 500 });
  }
}

/** POST /api/settings/integrations — save encrypted values */
export async function POST(req: NextRequest) {
  if (!isEncryptionConfigured()) {
    return NextResponse.json(
      { error: 'APP_ENCRYPTION_KEY is not configured. Add it to your environment to enable secure settings storage.' },
      { status: 503 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  try {
    await connectDB();

    const update: Partial<IIntegrationSettings> = {};

    // Helper — only encrypt and update if a non-empty string is provided
    const maybeEncrypt = (val: unknown): EncryptedField | undefined => {
      if (typeof val === 'string' && val.trim()) return encrypt(val.trim());
      return undefined;
    };

    const encryptedClaude    = maybeEncrypt(body.claudeApiKey);
    const encryptedSmartlead = maybeEncrypt(body.smartleadApiKey);
    const encryptedApollo    = maybeEncrypt(body.apolloApiKey);
    const encryptedApify     = maybeEncrypt(body.apifyToken);
    const encryptedMailbox   = maybeEncrypt(body.mailboxPassword);

    if (encryptedClaude)    update.claudeApiKey    = encryptedClaude;
    if (encryptedSmartlead) update.smartleadApiKey  = encryptedSmartlead;
    if (encryptedApollo)    update.apolloApiKey     = encryptedApollo;
    if (encryptedApify)     update.apifyToken       = encryptedApify;
    if (encryptedMailbox)   update.mailboxPassword  = encryptedMailbox;

    // Non-sensitive fields — store as-is
    if (typeof body.smartleadCampaignId === 'string') update.smartleadCampaignId = body.smartleadCampaignId.trim();
    if (typeof body.smartleadFromEmail  === 'string') update.smartleadFromEmail  = body.smartleadFromEmail.trim();
    if (typeof body.smartleadFromName   === 'string') update.smartleadFromName   = body.smartleadFromName.trim();
    if (typeof body.smartleadDryRun     === 'boolean') update.smartleadDryRun   = body.smartleadDryRun;

    if (typeof body.apolloMaxResults === 'number') update.apolloMaxResults = Math.max(1, Math.min(200, body.apolloMaxResults));

    if (typeof body.apifyActorId         === 'string') update.apifyActorId         = body.apifyActorId.trim();
    if (typeof body.apifyMaxResults      === 'number') update.apifyMaxResults      = Math.max(1, Math.min(200, body.apifyMaxResults));
    if (typeof body.apifyWebsiteEnrichment === 'boolean') update.apifyWebsiteEnrichment = body.apifyWebsiteEnrichment;

    if (typeof body.mailboxEnabled      === 'boolean') update.mailboxEnabled    = body.mailboxEnabled;
    if (typeof body.mailboxImapHost     === 'string')  update.mailboxImapHost   = body.mailboxImapHost.trim();
    if (typeof body.mailboxImapPort     === 'number')  update.mailboxImapPort   = body.mailboxImapPort;
    if (typeof body.mailboxImapSecure   === 'boolean') update.mailboxImapSecure = body.mailboxImapSecure;
    if (typeof body.mailboxUser         === 'string')  update.mailboxUser       = body.mailboxUser.trim();
    if (typeof body.mailboxLookbackDays === 'number')  update.mailboxLookbackDays = Math.max(1, body.mailboxLookbackDays);

    if (typeof body.appUrl === 'string') update.appUrl = body.appUrl.trim();

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    await IntegrationSettings.findOneAndUpdate(
      {},
      { $set: update },
      { upsert: true, new: true }
    );

    // Bust the in-process settings cache so next request gets fresh values
    invalidateSettingsCache();

    return NextResponse.json({ success: true, updated: Object.keys(update) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'Failed to save settings', details: msg }, { status: 500 });
  }
}
