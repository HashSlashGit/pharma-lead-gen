/**
 * GET /api/smartlead/webhook-health
 *
 * Diagnostic: fetches the configured webhooks for the Smartlead campaign and
 * checks whether a reply-event webhook is present. Never exposes the API key.
 */

import { NextResponse } from 'next/server';
import axios from 'axios';

export const dynamic = 'force-dynamic';

const BASE_URL = 'https://server.smartlead.ai/api/v1';

const REPLY_EVENTS = new Set(['EMAIL_REPLY', 'EMAIL_REPLIED']);

interface WebhookHealthResult {
  configured:            boolean;
  campaignId:            string | null;
  webhookCount:          number;
  hasReplyEvent:         boolean;
  replyEventTypesFound:  string[];
  warning:               string | null;
}

function extractArray(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    for (const key of ['data', 'webhooks', 'results', 'records']) {
      if (Array.isArray(obj[key])) return obj[key] as Record<string, unknown>[];
    }
  }
  return [];
}

export async function GET(): Promise<NextResponse<WebhookHealthResult>> {
  const apiKey     = process.env.SMARTLEAD_API_KEY    ?? '';
  const campaignId = process.env.SMARTLEAD_CAMPAIGN_ID ?? '';
  const appUrl     = (
    process.env.APP_PUBLIC_URL    ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    ''
  ).replace(/\/$/, ''); // strip trailing slash

  if (!apiKey || !campaignId) {
    return NextResponse.json({
      configured:           false,
      campaignId:           campaignId || null,
      webhookCount:         0,
      hasReplyEvent:        false,
      replyEventTypesFound: [],
      warning: 'SMARTLEAD_API_KEY and/or SMARTLEAD_CAMPAIGN_ID are not set.',
    });
  }

  try {
    const res = await axios.get(
      `${BASE_URL}/campaigns/${campaignId}/webhooks`,
      { params: { api_key: apiKey }, timeout: 10000 }
    );

    const webhooks = extractArray(res.data);

    // Collect all event types across all webhooks
    const allEventTypes: string[] = [];
    for (const wh of webhooks) {
      const raw = wh.event_types ?? wh.events ?? wh.event_type ?? [];
      if (Array.isArray(raw)) {
        allEventTypes.push(...raw.map(String));
      } else if (raw) {
        allEventTypes.push(String(raw));
      }
    }

    const normalised        = allEventTypes.map((t) => t.toUpperCase().trim());
    const replyEventsFound  = normalised.filter((t) => REPLY_EVENTS.has(t));
    const hasReplyEvent     = replyEventsFound.length > 0;

    const hasEmailReply    = normalised.includes('EMAIL_REPLY');
    const hasEmailReplied  = normalised.includes('EMAIL_REPLIED');

    // Check if our app URL is covered by any webhook
    const replyPath = '/api/webhooks/smartlead/reply';
    let urlFound = false;
    if (appUrl) {
      urlFound = webhooks.some((wh) => {
        const u = String(wh.url ?? wh.webhook_url ?? wh.endpoint ?? '');
        return u.includes(replyPath);
      });
    }

    // Build the most important warning
    let warning: string | null = null;
    if (!hasReplyEvent) {
      warning =
        'No reply-event webhook found. Add an EMAIL_REPLIED (or EMAIL_REPLY) ' +
        'webhook in Smartlead → Campaign Settings → Webhooks.';
    } else if (hasEmailReply && !hasEmailReplied) {
      warning =
        'Webhook uses EMAIL_REPLY. Smartlead docs reference EMAIL_REPLIED. ' +
        'Enable both if Smartlead supports it, or use Sync Smartlead Replies fallback.';
    } else if (appUrl && !urlFound) {
      warning =
        `App URL set but no webhook was found pointing to ${appUrl}${replyPath}. ` +
        'Check your webhook URL in Smartlead.';
    }

    return NextResponse.json({
      configured:           true,
      campaignId,
      webhookCount:         webhooks.length,
      hasReplyEvent,
      replyEventTypesFound: replyEventsFound,
      warning,
    });

  } catch (err) {
    const detail = axios.isAxiosError(err)
      ? `HTTP ${err.response?.status ?? 'network error'}`
      : String(err);

    return NextResponse.json({
      configured:           true,
      campaignId,
      webhookCount:         0,
      hasReplyEvent:        false,
      replyEventTypesFound: [],
      warning:              `Could not fetch webhooks from Smartlead: ${detail}`,
    });
  }
}
