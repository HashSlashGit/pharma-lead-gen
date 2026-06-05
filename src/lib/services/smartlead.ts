/**
 * Smartlead API service
 *
 * Modes:
 *   1. No key  → safe no-op (returns test response, no external calls)
 *   2. DRY_RUN → validates payload, logs intent, marks status 'ready_to_send_test', no external calls
 *   3. Live    → sends via Smartlead REST API
 *
 * To activate live mode:
 *   1. Set SMARTLEAD_API_KEY in .env.local
 *   2. Set SMARTLEAD_DRY_RUN=false
 *   3. Set SMARTLEAD_CAMPAIGN_ID to your campaign ID in Smartlead
 *
 * Smartlead API base: https://server.smartlead.ai/api/v1
 * Authentication: api_key query parameter
 * Docs: https://api.smartlead.ai
 */

import axios from 'axios';
import { getSettings } from '@/lib/services/settingsCache';

const BASE_URL = 'https://server.smartlead.ai/api/v1';

/** Sync version used for dashboard status checks (env only — fast, no DB). */
function getConfig() {
  return {
    apiKey: process.env.SMARTLEAD_API_KEY ?? '',
    campaignId: process.env.SMARTLEAD_CAMPAIGN_ID ?? '',
    isDryRun: process.env.SMARTLEAD_DRY_RUN !== 'false',
    isConfigured: !!process.env.SMARTLEAD_API_KEY,
  };
}

/** Async version for actual sends — DB settings take priority over env. */
async function getConfigAsync() {
  const s = await getSettings();
  return {
    apiKey: s.smartleadApiKey ?? '',
    campaignId: s.smartleadCampaignId ?? '',
    isDryRun: s.smartleadDryRun,
    isConfigured: !!s.smartleadApiKey,
    fromEmail: s.smartleadFromEmail ?? '',
    fromName: s.smartleadFromName ?? 'PharmaLeads',
  };
}

export function getSmartleadMode(): { isDryRun: boolean; isConfigured: boolean } {
  const { isDryRun, isConfigured } = getConfig();
  return { isDryRun, isConfigured };
}

// ── Request / Response types ──────────────────────────────────────────

export interface SmartleadLeadPayload {
  email: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  phone_number?: string;
  website?: string;
  custom_fields?: Record<string, string>;
}

export interface SmartleadAddLeadsBody {
  lead_list: SmartleadLeadPayload[];
  /**
   * TODO: Add schedule_start_time if you want to delay sending.
   * Format: "YYYY-MM-DD HH:mm:ss" in campaign timezone.
   */
}

export interface SmartleadSendResult {
  success: boolean;
  mode: 'live' | 'dry_run' | 'no_key';
  status: 'sent' | 'ready_to_send_test' | 'failed';
  message: string;
  sendMode?: 'campaign' | 'custom';
  preview?: {
    to: string;
    subject: string;
    campaignId: string;
  };
  data?: unknown;
  rawResponse?: unknown;
}

// ── Core send functions ───────────────────────────────────────────────

/**
 * Add a single lead to the configured Smartlead campaign.
 * This is the function that queues the lead for the campaign's email sequence.
 *
 * NOTE: Smartlead sends emails based on the campaign schedule, not instantly.
 * The lead gets queued and Smartlead sends according to the campaign's time settings.
 */
// emailSubject and emailBody are accepted for call-site compatibility but are NOT sent
// to Smartlead — the campaign's configured email sequence controls what gets delivered.
// To send a specific body, use sendCustomEmailViaSmartlead() instead.
async function addLeadToSmartleadCampaign(
  lead: SmartleadLeadPayload,
  campaignId: string,
  apiKey: string,
  emailSubject?: string,
  emailBody?: string
): Promise<{ ok: boolean; data: unknown; error?: string }> {
  try {
    /**
     * TODO: If you want to override the campaign sequence with a custom email body per lead,
     * check Smartlead's "custom email variables" feature or their "sequence" endpoint.
     * Currently this adds the lead to the campaign's default sequence.
     *
     * Smartlead endpoint: POST /campaigns/{campaignId}/leads
     */
    // Strip undefined values so Smartlead doesn't reject unknown keys
    const cleanLead: SmartleadLeadPayload = Object.fromEntries(
      Object.entries(lead).filter(([, v]) => v !== undefined && v !== '')
    ) as SmartleadLeadPayload;

    const body: SmartleadAddLeadsBody = {
      lead_list: [cleanLead],
    };

    const response = await axios.post(
      `${BASE_URL}/campaigns/${campaignId}/leads`,
      body,
      {
        params: { api_key: apiKey },
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000,
      }
    );

    console.log('[Smartlead] API response:', JSON.stringify(response.data, null, 2));

    // Smartlead can return HTTP 200 with ok:false in the body
    if (response.data?.ok === false) {
      return {
        ok: false,
        data: response.data,
        error: `Smartlead rejected lead: ${JSON.stringify(response.data)}`,
      };
    }

    // upload_count === 0 means Smartlead accepted the request but added no leads
    // (duplicate, invalid email, unsubscribed, etc.) — treat this as failure
    const uploadCount = (response.data as Record<string, unknown> | null)?.['data'] as Record<string, unknown> | undefined;
    const count = uploadCount?.['upload_count'];
    if (typeof count === 'number' && count === 0) {
      return {
        ok: false,
        data: response.data,
        error: `Smartlead added 0 leads (duplicate/invalid/unsubscribed?): ${JSON.stringify(uploadCount)}`,
      };
    }

    return { ok: true, data: response.data };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      const body = err.response?.data;
      console.error(`[Smartlead] API error ${status}:`, JSON.stringify(body, null, 2));
      return {
        ok: false,
        data: body ?? null,
        error: `Smartlead API error ${status}: ${JSON.stringify(body)}`,
      };
    }
    console.error('[Smartlead] Unexpected error:', err);
    return { ok: false, data: null, error: String(err) };
  }
}

// ── Public send orchestrator ──────────────────────────────────────────

export interface SendEmailParams {
  leadEmail: string;
  leadFirstName?: string;
  leadLastName?: string;
  companyName?: string;
  phone?: string;
  website?: string;
  emailSubject: string;
  emailBody: string;
}

/**
 * Main entry point for sending a single email via Smartlead.
 * Automatically picks the correct mode (no-key / dry-run / live).
 * Never calls Claude.
 */
export async function sendEmail(params: SendEmailParams): Promise<SmartleadSendResult> {
  const { apiKey, campaignId, isDryRun, isConfigured } = await getConfigAsync();

  // ── Mode 1: No API key ───────────────────────────────────────────
  if (!isConfigured) {
    return {
      success: false,
      mode: 'no_key',
      status: 'ready_to_send_test',
      message: 'SMARTLEAD_API_KEY is not configured. Email saved as draft. Configure the key to send.',
      preview: {
        to: params.leadEmail,
        subject: params.emailSubject,
        campaignId: campaignId || '(not set)',
      },
    };
  }

  // ── Mode 2: Dry run ──────────────────────────────────────────────
  if (isDryRun) {
    // Validate that we have everything needed (no external call)
    const missing: string[] = [];
    if (!campaignId) missing.push('SMARTLEAD_CAMPAIGN_ID');
    if (!params.leadEmail) missing.push('lead email');

    if (missing.length > 0) {
      return {
        success: false,
        mode: 'dry_run',
        status: 'failed',
        message: `Dry run validation failed. Missing: ${missing.join(', ')}`,
      };
    }

    console.log('[Smartlead DRY RUN] Would send:', {
      to: params.leadEmail,
      subject: params.emailSubject,
      campaignId,
    });

    return {
      success: true,
      mode: 'dry_run',
      status: 'ready_to_send_test',
      message: `Dry run complete. Would add ${params.leadEmail} to campaign ${campaignId}. Set SMARTLEAD_DRY_RUN=false to send for real.`,
      preview: {
        to: params.leadEmail,
        subject: params.emailSubject,
        campaignId,
      },
    };
  }

  // ── Mode 3: Live send ────────────────────────────────────────────
  if (!campaignId) {
    return {
      success: false,
      mode: 'live',
      status: 'failed',
      message: 'SMARTLEAD_CAMPAIGN_ID is not set. Create a campaign in Smartlead and add the ID to .env.local.',
    };
  }

  const leadPayload: SmartleadLeadPayload = {
    email: params.leadEmail,
    first_name: params.leadFirstName,
    last_name: params.leadLastName,
    company_name: params.companyName,
    phone_number: params.phone,
    website: params.website,
  };

  const result = await addLeadToSmartleadCampaign(
    leadPayload,
    campaignId,
    apiKey,
    params.emailSubject,
    params.emailBody
  );

  if (result.ok) {
    return {
      success: true,
      mode: 'live',
      status: 'sent',
      message: `Lead ${params.leadEmail} added to Smartlead campaign ${campaignId}`,
      rawResponse: result.data,
    };
  } else {
    return {
      success: false,
      mode: 'live',
      status: 'failed',
      message: result.error ?? 'Smartlead API call failed',
      rawResponse: result.data,
    };
  }
}

// ── Custom email send (direct, bypasses campaign sequence) ───────────

/**
 * Send a custom email directly via Smartlead without using the campaign sequence.
 * Uses POST /send-email/initiate with sender details from SMARTLEAD_FROM_EMAIL / SMARTLEAD_FROM_NAME.
 */
export async function sendCustomEmailViaSmartlead(
  params: SendEmailParams
): Promise<SmartleadSendResult> {
  const { apiKey, isDryRun, isConfigured, fromEmail: cfgFromEmail, fromName: cfgFromName } = await getConfigAsync();

  // ── Mode 1: No API key ─────────────────────────────────────────────
  if (!isConfigured) {
    return {
      success: false,
      mode: 'no_key',
      status: 'ready_to_send_test',
      sendMode: 'custom',
      message: 'SMARTLEAD_API_KEY is not configured. Custom email saved as draft. Configure the key to send.',
      preview: {
        to: params.leadEmail,
        subject: params.emailSubject,
        campaignId: '(custom mode - no campaign)',
      },
    };
  }

  // ── Mode 2: Dry run ────────────────────────────────────────────────
  if (isDryRun) {
    const missing: string[] = [];
    if (!params.leadEmail) missing.push('lead email');
    if (!params.emailSubject) missing.push('subject');
    if (!params.emailBody) missing.push('body');

    if (missing.length > 0) {
      return {
        success: false,
        mode: 'dry_run',
        status: 'failed',
        sendMode: 'custom',
        message: `Dry run validation failed. Missing: ${missing.join(', ')}`,
      };
    }

    console.log('[Smartlead DRY RUN - Custom Email] Would send:', {
      to: params.leadEmail,
      subject: params.emailSubject,
      bodyLength: params.emailBody.length,
      bodyPreview: params.emailBody.slice(0, 500),
    });

    return {
      success: true,
      mode: 'dry_run',
      status: 'ready_to_send_test',
      sendMode: 'custom',
      message: `Dry run complete (Custom Email Mode). Would send custom email to ${params.leadEmail} with subject "${params.emailSubject}". Set SMARTLEAD_DRY_RUN=false to send for real.`,
      preview: {
        to: params.leadEmail,
        subject: params.emailSubject,
        campaignId: '(custom mode - no campaign)',
      },
    };
  }

  // ── Mode 3: Live send ─────────────────────────────────────────────
  const liveMissing: string[] = [];
  if (!params.leadEmail) liveMissing.push('recipient email');
  if (!params.emailSubject) liveMissing.push('subject');
  if (!params.emailBody) liveMissing.push('body');

  if (liveMissing.length > 0) {
    return {
      success: false,
      mode: 'live',
      status: 'failed',
      sendMode: 'custom',
      message: `Custom email send failed. Missing: ${liveMissing.join(', ')}`,
    };
  }

  const fromEmail = cfgFromEmail;
  const fromName = cfgFromName;

  try {
    const response = await axios.post(
      `${BASE_URL}/send-email/initiate`,
      {
        to: params.leadEmail,
        subject: params.emailSubject,
        body: params.emailBody,
        fromEmail,
        fromName,
        replyTo: fromEmail,
      },
      {
        params: { api_key: apiKey },
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000,
      }
    );

    console.log('[Smartlead Custom Email] API response:', JSON.stringify(response.data, null, 2));

    const trackId = (response.data as Record<string, unknown> | null)
      ?.['data'] as Record<string, unknown> | undefined;
    const isSuccess =
      response.data?.success === true ||
      (typeof response.data?.message === 'string' && response.data.message.includes('sent successfully')) ||
      !!trackId?.['trackId'];

    if (isSuccess) {
      return {
        success: true,
        mode: 'live',
        status: 'sent',
        sendMode: 'custom',
        message: 'Custom email sent successfully',
        data: {
          ...(typeof response.data === 'object' && response.data !== null ? response.data as object : {}),
          ...(trackId?.['trackId'] ? { trackId: trackId['trackId'] } : {}),
        },
      };
    }

    return {
      success: false,
      mode: 'live',
      status: 'failed',
      sendMode: 'custom',
      message: `Smartlead did not confirm success: ${JSON.stringify(response.data)}`,
      rawResponse: response.data,
    };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      const body = err.response?.data;
      console.error(`[Smartlead Custom Email] API error ${status}:`, JSON.stringify(body, null, 2));
      return {
        success: false,
        mode: 'live',
        status: 'failed',
        sendMode: 'custom',
        message: `Smartlead API error ${status}: ${JSON.stringify(body)}`,
        rawResponse: body ?? null,
      };
    }
    console.error('[Smartlead Custom Email] Unexpected error:', err);
    return {
      success: false,
      mode: 'live',
      status: 'failed',
      sendMode: 'custom',
      message: `Unexpected error: ${String(err)}`,
    };
  }
}

// ── Utility: fetch replies from Smartlead inbox (placeholder) ─────────

export interface SmartleadReply {
  id: string;
  campaignId: string;
  leadEmail: string;
  subject: string;
  body: string;
  receivedAt: string;
}

/**
 * TODO: Wire this up when you need to poll for replies programmatically.
 * Smartlead endpoint: GET /campaigns/{campaignId}/leads/{leadId}/replies
 */
export async function fetchCampaignReplies(_campaignId: string): Promise<SmartleadReply[]> {
  const { apiKey, isConfigured } = await getConfigAsync();
  if (!isConfigured) return [];

  console.log('[Smartlead] fetchCampaignReplies — TODO: implement endpoint', { apiKey: '***' });
  // TODO: GET /campaigns/{campaignId}/email-leads?api_key={key}&offset=0&limit=100
  return [];
}

/**
 * TODO: Wire this to fetch campaign stats (opens, clicks, bounces).
 * Smartlead endpoint: GET /campaigns/{campaignId}/analytics-by-date
 */
export async function fetchCampaignStats(
  _campaignId: string
): Promise<{ opens: number; clicks: number; bounces: number }> {
  return { opens: 0, clicks: 0, bounces: 0 };
}
