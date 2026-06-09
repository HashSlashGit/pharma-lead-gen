/**
 * Resolved integration settings — DB values (decrypted) take priority, env vars are the fallback.
 * Cached for 60 seconds so every API call does not hit MongoDB.
 */

import { connectDB } from '@/lib/db/mongoose';
import IntegrationSettings from '@/lib/models/IntegrationSettings';
import { decrypt, isEncryptionConfigured } from '@/lib/utils/encryption';
import type { EncryptedField } from '@/lib/utils/encryption';
import type { IIntegrationSettings } from '@/lib/models/IntegrationSettings';

export interface ResolvedSettings {
  claudeApiKey?: string;
  smartleadApiKey?: string;
  smartleadCampaignId?: string;
  smartleadFromEmail?: string;
  smartleadFromName?: string;
  smartleadDryRun: boolean;
  apolloApiKey?: string;
  apolloMaxResults: number;
  apifyToken?: string;
  apifyActorId?: string;
  apifyMaxResults: number;
  apifyWebsiteEnrichment: boolean;
  mailboxEnabled: boolean;
  mailboxImapHost?: string;
  mailboxImapPort: number;
  mailboxImapSecure: boolean;
  mailboxUser?: string;
  mailboxPassword?: string;
  mailboxLookbackDays: number;
  appUrl?: string;
  googleClientId?: string;
  googleClientSecret?: string;
  googleRedirectUri?: string;
}

let _cache: ResolvedSettings | null = null;
let _expiry = 0;

function safeDecrypt(field: EncryptedField | undefined): string | undefined {
  if (!field?.ct || !isEncryptionConfigured()) return undefined;
  try {
    return decrypt(field);
  } catch {
    return undefined;
  }
}

async function loadFromDB(): Promise<Partial<ResolvedSettings>> {
  try {
    await connectDB();
    const doc = await IntegrationSettings.findOne({}).lean<IIntegrationSettings>();
    if (!doc) return {};
    return {
      claudeApiKey:          safeDecrypt(doc.claudeApiKey),
      smartleadApiKey:       safeDecrypt(doc.smartleadApiKey),
      smartleadCampaignId:   doc.smartleadCampaignId,
      smartleadFromEmail:    doc.smartleadFromEmail,
      smartleadFromName:     doc.smartleadFromName,
      smartleadDryRun:       doc.smartleadDryRun,
      apolloApiKey:          safeDecrypt(doc.apolloApiKey),
      apolloMaxResults:      doc.apolloMaxResults,
      apifyToken:            safeDecrypt(doc.apifyToken),
      apifyActorId:          doc.apifyActorId,
      apifyMaxResults:       doc.apifyMaxResults,
      apifyWebsiteEnrichment: doc.apifyWebsiteEnrichment,
      mailboxEnabled:        doc.mailboxEnabled,
      mailboxImapHost:       doc.mailboxImapHost,
      mailboxImapPort:       doc.mailboxImapPort,
      mailboxImapSecure:     doc.mailboxImapSecure,
      mailboxUser:           doc.mailboxUser,
      mailboxPassword:       safeDecrypt(doc.mailboxPassword),
      mailboxLookbackDays:   doc.mailboxLookbackDays,
      appUrl:                doc.appUrl,
      googleClientId:        safeDecrypt(doc.googleClientId),
      googleClientSecret:    safeDecrypt(doc.googleClientSecret),
      googleRedirectUri:     doc.googleRedirectUri,
    };
  } catch {
    // DB unavailable — fall through to env-only mode
    return {};
  }
}

/** Returns merged settings: DB values first, env vars as fallback. */
export async function getSettings(): Promise<ResolvedSettings> {
  if (_cache && Date.now() < _expiry) return _cache;

  const db = await loadFromDB();

  const merged: ResolvedSettings = {
    claudeApiKey:    db.claudeApiKey    || process.env.CLAUDE_API_KEY,
    smartleadApiKey: db.smartleadApiKey || process.env.SMARTLEAD_API_KEY,
    smartleadCampaignId: db.smartleadCampaignId || process.env.SMARTLEAD_CAMPAIGN_ID,
    smartleadFromEmail:  db.smartleadFromEmail  || process.env.SMARTLEAD_FROM_EMAIL,
    smartleadFromName:   db.smartleadFromName   || process.env.SMARTLEAD_FROM_NAME,
    smartleadDryRun: db.smartleadDryRun ?? (process.env.SMARTLEAD_DRY_RUN !== 'false'),
    apolloApiKey:    db.apolloApiKey    || process.env.APOLLO_API_KEY,
    apolloMaxResults: db.apolloMaxResults ?? (parseInt(process.env.APOLLO_MAX_RESULTS_LIMIT ?? '25', 10) || 25),
    apifyToken:      db.apifyToken      || process.env.APIFY_API_TOKEN || process.env.APIFY_TOKEN,
    apifyActorId:    db.apifyActorId    || process.env.APIFY_GOOGLE_MAPS_ACTOR_ID,
    apifyMaxResults: db.apifyMaxResults ?? (parseInt(process.env.APIFY_GOOGLE_MAPS_MAX_RESULTS_LIMIT ?? '50', 10) || 50),
    apifyWebsiteEnrichment: db.apifyWebsiteEnrichment ?? (process.env.APIFY_WEBSITE_ENRICHMENT_ENABLED === 'true'),
    mailboxEnabled:  db.mailboxEnabled  ?? (process.env.MAILBOX_SYNC_ENABLED === 'true'),
    mailboxImapHost: db.mailboxImapHost || process.env.MAILBOX_IMAP_HOST,
    mailboxImapPort: db.mailboxImapPort ?? (parseInt(process.env.MAILBOX_IMAP_PORT ?? '993', 10) || 993),
    mailboxImapSecure: db.mailboxImapSecure ?? (process.env.MAILBOX_IMAP_SECURE !== 'false'),
    mailboxUser:     db.mailboxUser     || process.env.MAILBOX_USER,
    mailboxPassword: db.mailboxPassword || process.env.MAILBOX_APP_PASSWORD,
    mailboxLookbackDays: db.mailboxLookbackDays ?? (parseInt(process.env.MAILBOX_LOOKBACK_DAYS ?? '14', 10) || 14),
    appUrl: db.appUrl || process.env.APP_PUBLIC_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL,
    googleClientId:     db.googleClientId     || process.env.GOOGLE_CLIENT_ID,
    googleClientSecret: db.googleClientSecret || process.env.GOOGLE_CLIENT_SECRET,
    googleRedirectUri:  db.googleRedirectUri  || process.env.GOOGLE_REDIRECT_URI,
  };

  _cache = merged;
  _expiry = Date.now() + 60_000;
  return merged;
}

export function invalidateSettingsCache(): void {
  _cache = null;
  _expiry = 0;
}
