/**
 * POST /api/replies/sync-smartlead
 *
 * Syncs replies from Smartlead using Master Inbox as the PRIMARY source.
 * Falls back to campaign statistics + message history only when Master Inbox
 * returns zero usable replies.
 *
 * Request body (all optional):
 *   { debug?: boolean, pages?: number (1-5), limit?: number (1-100) }
 *
 * Zero Claude credits. No AI calls.
 * Env vars required: SMARTLEAD_API_KEY
 *                    SMARTLEAD_CAMPAIGN_ID (fallback + campaign-history paths)
 */

import { NextRequest, NextResponse }                  from 'next/server';
import { Types }                                       from 'mongoose';
import { createHash }                                  from 'crypto';
import { connectDB }                                   from '@/lib/db/mongoose';
import Lead                                            from '@/lib/models/Lead';
import Reply                                           from '@/lib/models/Reply';
import EmailLog                                        from '@/lib/models/EmailLog';
import CampaignLead                                    from '@/lib/models/CampaignLead';
import { classifyReply }                               from '@/lib/services/reply-classifier';
import { syncLeadStatusFromReply }                     from '@/lib/services/syncLeadStatusFromReply';
import { runMailboxSync, type MailboxSyncResult }      from '@/lib/services/mailboxReplySync';
import { removeNoReplyOnReply }                        from '@/lib/services/removeNoReplyOnReply';
import axios                                           from 'axios';

export const dynamic = 'force-dynamic';

const BASE_URL = 'https://server.smartlead.ai/api/v1';

// ── Response shapes ───────────────────────────────────────────────────────────

interface EndpointTried {
  name: string;
  status: number;
  count: number;
}

interface DuplicateDetail {
  email: string;
  reason: string;
  existingReplyId: string | null;
  smartleadMessageId: string | null;
  receivedAt: string | null;
}

interface PreviewEntry {
  email: string;
  hasBody: boolean;
  bodyHash: string | null;
  smartleadMessageId: string | null;
  receivedAt: string | null;
  source: string;
  matchedLead: boolean;
  duplicate: boolean;
}

interface ProcessResult {
  disposition: 'synced' | 'duplicate' | 'skipped';
  reason?: string;
  existingReplyId?: string;
}

interface SyncResult {
  success: boolean;
  sourceUsed: 'master_inbox' | 'campaign_statistics' | 'none';
  checked: number;
  inboxRepliesFound: number;
  repliesExtracted: number;
  synced: number;
  duplicates: number;
  unmatched: number;
  errors: string[];
  endpointsTried: EndpointTried[];
  duplicateDetails: DuplicateDetail[];
  preview: PreviewEntry[];
  configured?: boolean;
  message: string;
  // ── Combined fields (added for mailbox sync) ──────────────────────────────
  smartlead?: { checked: number; synced: number; duplicates: number; unmatched: number };
  mailbox?: MailboxSyncResult;
  totalSynced?: number;
  totalDuplicates?: number;
  totalUnmatched?: number;
}

// ── Body hash ─────────────────────────────────────────────────────────────────

/** Compact, safe hash of normalised body text for dedup diagnostics. Never stored raw. */
function bodyHash(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim().toLowerCase();
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

// ── Field extractors ─────────────────────────────────────────────────────────

/**
 * Safely extract an array from any Smartlead response shape.
 * Supports: direct array, .data, .data.data, .results, .records, .leads, .items
 */
function extractArray(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    // Handle .data.data double-nesting
    if (obj['data'] && typeof obj['data'] === 'object' && !Array.isArray(obj['data'])) {
      const inner = obj['data'] as Record<string, unknown>;
      if (Array.isArray(inner['data'])) return inner['data'] as Record<string, unknown>[];
    }
    for (const key of ['data', 'results', 'records', 'leads', 'items', 'messages', 'history']) {
      if (Array.isArray(obj[key])) return obj[key] as Record<string, unknown>[];
    }
  }
  return [];
}

/** Extract lead email from an inbox reply item using all known field names. */
function extractEmail(item: Record<string, unknown>): string {
  const dataLead = (item['data'] as Record<string, unknown> | undefined)?.['lead'] as
    | Record<string, unknown>
    | undefined;
  const raw =
    item['email']       ??
    item['lead_email']  ??
    item['from_email']  ??
    item['reply_email'] ??
    (item['lead']   as Record<string, unknown> | undefined)?.['email'] ??
    (item['person'] as Record<string, unknown> | undefined)?.['email'] ??
    dataLead?.['email'];
  return String(raw ?? '').toLowerCase().trim();
}

/** Extract reply body from an item using all known field names. */
function extractBody(item: Record<string, unknown>): string {
  const replyObj    = item['reply']        as Record<string, unknown> | undefined;
  const latestReply = item['latest_reply'] as Record<string, unknown> | undefined;
  const lastMsg     = item['last_message'] as Record<string, unknown> | undefined;
  const dataReply   = (item['data'] as Record<string, unknown> | undefined)?.['reply'] as
    | Record<string, unknown>
    | undefined;
  const raw =
    item['body']       ??
    item['message']    ??
    item['reply_body'] ??
    item['replyBody']  ??
    item['email_body'] ??
    item['text']       ??
    item['html']       ??
    replyObj?.['body']    ??
    latestReply?.['body'] ??
    lastMsg?.['body']     ??
    dataReply?.['body'];
  return String(raw ?? '').trim();
}

/** Extract message / reply ID from an item. */
function extractMessageId(item: Record<string, unknown>): string {
  const raw =
    item['id']                   ??
    item['message_id']           ??
    item['reply_id']             ??
    item['email_id']             ??
    item['smartlead_message_id'];
  return String(raw ?? '').trim();
}

/** Extract ISO / human timestamp from an item. */
function extractReceivedAt(item: Record<string, unknown>): string | null {
  const raw =
    item['received_at'] ??
    item['receivedAt']  ??
    item['created_at']  ??
    item['createdAt']   ??
    item['date']        ??
    item['timestamp']   ??
    null;
  return raw ? String(raw) : null;
}

/** Extract Smartlead's internal lead_id / campaign_lead_map_id from an inbox item. */
function extractSmartleadLeadId(item: Record<string, unknown>): string {
  const raw =
    item['lead_id']              ??
    item['campaign_lead_map_id'] ??
    (item['lead'] as Record<string, unknown> | undefined)?.['id'] ??
    '';
  return String(raw).trim();
}

/** True when a nested history message looks like an inbound reply from the lead. */
function isInboundMessage(msg: Record<string, unknown>): boolean {
  const type      = String(msg['type']       ?? msg['message_type'] ?? '').toUpperCase();
  const dir       = String(msg['direction']  ?? '').toLowerCase();
  const eventType = String(msg['event_type'] ?? '').toLowerCase();
  const category  = String(msg['category']   ?? msg['status'] ?? '').toLowerCase();
  const isReply   = msg['is_reply'];
  return (
    dir       === 'incoming'    ||
    type      === 'REPLY'       ||
    isReply   === true          ||
    eventType.includes('reply') ||
    category.includes('reply')  ||
    category  === 'replied'
  );
}

/**
 * Collect all inbound reply candidates from one inbox item:
 *   1. The top-level item itself (if it has a body)
 *   2. Any inbound messages nested in history arrays
 */
function collectReplyCandidates(item: Record<string, unknown>): Record<string, unknown>[] {
  const candidates: Record<string, unknown>[] = [];
  const topBody = extractBody(item);
  if (topBody) candidates.push(item);

  const historyKeys = [
    'message_history',
    'messages',
    'replies',
    'email_history',
    'conversation',
  ] as const;

  for (const key of historyKeys) {
    const hist = item[key];
    if (!Array.isArray(hist)) continue;
    for (const msg of hist as Record<string, unknown>[]) {
      if (!isInboundMessage(msg)) continue;
      const body = extractBody(msg);
      if (body && body !== topBody) candidates.push(msg);
    }
  }
  return candidates;
}

// ── Core save logic ───────────────────────────────────────────────────────────

/**
 * Deduplicate, classify, and save one reply candidate.
 * Returns disposition + duplicate reason (if any) without leaking body content.
 */
async function processAndSave(
  leadId: Types.ObjectId,
  email: string,
  candidate: Record<string, unknown>,
  errors: string[]
): Promise<ProcessResult> {
  const bodyText = extractBody(candidate);
  if (!bodyText) return { disposition: 'skipped' };

  const hash = bodyHash(bodyText);
  const msgId = extractMessageId(candidate);
  const receivedAtRaw = extractReceivedAt(candidate);
  const receivedAt = receivedAtRaw ? new Date(receivedAtRaw) : undefined;

  // ── Dedup check 1: by Smartlead message ID ─────────────────────────
  if (msgId) {
    const exists = await Reply.findOne({
      $or: [{ messageId: msgId }, { smartleadMessageId: msgId }],
    }).lean();
    if (exists) {
      return { disposition: 'duplicate', reason: 'duplicate by smartleadMessageId', existingReplyId: String(exists._id) };
    }
  }

  // ── Dedup check 2: by leadId + bodyHash ────────────────────────────
  const existsByHash = await Reply.findOne({ leadId, bodyHash: hash }).lean();
  if (existsByHash) {
    return { disposition: 'duplicate', reason: 'duplicate by leadId + bodyHash', existingReplyId: String(existsByHash._id) };
  }

  // ── Save ──────────────────────────────────────────────────────────
  const { classification, needsApproval } = classifyReply(bodyText);

  try {
    await Reply.create({
      leadId,
      messageId:          msgId || undefined,
      smartleadMessageId: msgId || undefined,
      body:               bodyText,
      bodyHash:           hash,
      classification,
      needsApproval,
      source:             'smartlead_sync',
      receivedAt,
    });

    await syncLeadStatusFromReply({ leadId, classification, receivedAt });
    await removeNoReplyOnReply({ leadId, receivedAt, source: 'smartlead_sync' });
    await CampaignLead.updateMany(
      { leadId, status: 'active' },
      { $set: { lastReplyAt: receivedAt ?? new Date() } }
    );

    console.log(`[Reply Storage] new reply saved — email:${email} classification:${classification}`);
    return { disposition: 'synced' };
  } catch (saveErr) {
    errors.push(`Save failed for ${email}: ${String(saveErr)}`);
    return { disposition: 'skipped' };
  }
}

// ── Error message helper ──────────────────────────────────────────────────────

/** Produce a safe error string that never leaks API key or full body. */
function safeMsg(err: unknown): string {
  if (axios.isAxiosError(err)) {
    return `HTTP ${err.response?.status ?? 'network'}: ${JSON.stringify(err.response?.data ?? {})}`;
  }
  return String(err);
}

// ── Campaign message-history fetch ───────────────────────────────────────────

/**
 * Fetch message history from Smartlead for one lead and process any inbound replies
 * not already captured by the master inbox item.  Soft-fails on any API error.
 */
async function fetchAndProcessCampaignHistory(
  campaignId: string,
  slLeadId: string,
  dbLeadId: Types.ObjectId,
  email: string,
  apiKey: string,
  endpointsTried: EndpointTried[],
  duplicateDetails: DuplicateDetail[],
  preview: PreviewEntry[],
  errors: string[],
  source: string
): Promise<{ synced: number; duplicates: number; extracted: number }> {
  let synced = 0, duplicates = 0, extracted = 0;
  let histStatus = 0;

  try {
    const histRes = await axios.get(
      `${BASE_URL}/campaigns/${campaignId}/leads/${slLeadId}/message-history`,
      { params: { api_key: apiKey }, timeout: 15000 }
    );
    histStatus = histRes.status;
    const historyItems = extractArray(histRes.data);

    endpointsTried.push({
      name:   `campaigns/${campaignId}/leads/${slLeadId}/message-history`,
      status: histStatus,
      count:  historyItems.length,
    });

    const replyMessages = historyItems.filter(isInboundMessage);
    extracted = replyMessages.length;

    for (const msg of replyMessages) {
      const bodyText   = extractBody(msg);
      const hash       = bodyText ? bodyHash(bodyText) : null;
      const msgId      = extractMessageId(msg) || null;
      const receivedAt = extractReceivedAt(msg);

      const result = await processAndSave(dbLeadId, email, msg, errors);

      preview.push({
        email,
        hasBody: !!bodyText,
        bodyHash: hash,
        smartleadMessageId: msgId,
        receivedAt,
        source,
        matchedLead: true,
        duplicate: result.disposition === 'duplicate',
      });

      if (result.disposition === 'synced') {
        synced++;
      } else if (result.disposition === 'duplicate') {
        duplicates++;
        duplicateDetails.push({
          email,
          reason:            result.reason ?? 'unknown',
          existingReplyId:   result.existingReplyId ?? null,
          smartleadMessageId: msgId,
          receivedAt:        receivedAt ?? null,
        });
      }
    }
  } catch (err) {
    histStatus = axios.isAxiosError(err) ? (err.response?.status ?? 0) : 0;
    const msg = `Message history failed for lead ${slLeadId} (${email}): ${safeMsg(err)}`;
    console.warn('[sync-smartlead]', msg);
    errors.push(msg);
    endpointsTried.push({
      name:   `campaigns/${campaignId}/leads/${slLeadId}/message-history`,
      status: histStatus,
      count:  0,
    });
  }

  return { synced, duplicates, extracted };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse<SyncResult>> {
  const apiKey     = process.env.SMARTLEAD_API_KEY     ?? '';
  const campaignId = process.env.SMARTLEAD_CAMPAIGN_ID ?? '';

  if (!apiKey) {
    return NextResponse.json({
      success:           false,
      sourceUsed:        'none',
      checked:           0,
      inboxRepliesFound: 0,
      repliesExtracted:  0,
      synced:            0,
      duplicates:        0,
      unmatched:         0,
      errors:            [],
      endpointsTried:    [],
      duplicateDetails:  [],
      preview:           [],
      configured:        false,
      message:           'SMARTLEAD_API_KEY must be set in environment variables.',
    });
  }

  // ── Parse request-body options ─────────────────────────────────────
  const reqBody   = await req.json().catch(() => ({})) as Record<string, unknown>;
  const debugMode = !!reqBody['debug'];
  const maxPages  = typeof reqBody['pages'] === 'number'
    ? Math.min(Math.max(1, reqBody['pages']), 5)
    : 3;
  // Smartlead caps master-inbox limit at 20; we respect that regardless of caller's preference.
  const INBOX_MAX_LIMIT = 20;
  const pageLimit = typeof reqBody['limit'] === 'number'
    ? Math.min(Math.max(1, reqBody['limit']), INBOX_MAX_LIMIT)
    : INBOX_MAX_LIMIT;

  if (debugMode) {
    console.log(`[sync-smartlead] debug mode ON, maxPages=${maxPages}, pageLimit=${pageLimit}`);
  }

  const errors:          string[]           = [];
  const endpointsTried:  EndpointTried[]    = [];
  const duplicateDetails: DuplicateDetail[] = [];
  const preview:         PreviewEntry[]     = [];

  let checked           = 0;
  let synced            = 0;
  let duplicates        = 0;
  let unmatched         = 0;
  let inboxRepliesFound = 0;
  let repliesExtracted  = 0;
  let sourceUsed: 'master_inbox' | 'campaign_statistics' | 'none' = 'none';

  try {
    await connectDB();
    console.log('[sync-smartlead] started');

    // ════════════════════════════════════════════════════════════════════
    // PRIMARY SOURCE: Master Inbox (multi-page)
    // ════════════════════════════════════════════════════════════════════

    const allInboxItems: Record<string, unknown>[] = [];

    for (let page = 0; page < maxPages; page++) {
      const offset = page * pageLimit;
      let pageItems: Record<string, unknown>[] = [];
      let pageStatus = 0;

      try {
        const inboxRes = await axios.post(
          `${BASE_URL}/master-inbox/inbox-replies`,
          { offset, limit: pageLimit },
          {
            params:  { api_key: apiKey, fetch_message_history: true },
            timeout: 30000,
          }
        );
        pageStatus = inboxRes.status;
        pageItems  = extractArray(inboxRes.data);
        console.log(`[sync-smartlead] master inbox page ${page + 1} count: ${pageItems.length}`);
      } catch (err) {
        pageStatus = axios.isAxiosError(err) ? (err.response?.status ?? 0) : 0;
        const msg  = `Master Inbox page ${page + 1} fetch failed: ${safeMsg(err)}`;
        console.warn('[sync-smartlead]', msg);
        errors.push(msg);
        endpointsTried.push({
          name:   `master-inbox/inbox-replies (offset=${offset})`,
          status: pageStatus,
          count:  0,
        });
        break; // stop pagination on error
      }

      endpointsTried.push({
        name:   `master-inbox/inbox-replies (offset=${offset})`,
        status: pageStatus,
        count:  pageItems.length,
      });

      allInboxItems.push(...pageItems);
      inboxRepliesFound += pageItems.length;

      // Stop early if this page returned no items
      if (pageItems.length === 0) break;
    }

    // ── Try unread replies endpoint (soft fail) ────────────────────────
    // Smartlead may expose one of these; neither path is documented publicly.
    // 404/400 are expected — we just record the attempt.

    const unreadPaths = [
      'master-inbox/unread-emails',
      'master-inbox/unread-replies',
    ] as const;

    for (const path of unreadPaths) {
      let unreadStatus = 0;
      let unreadCount  = 0;
      try {
        const res    = await axios.get(
          `${BASE_URL}/${path}`,
          { params: { api_key: apiKey }, timeout: 15000 }
        );
        unreadStatus = res.status;
        const items  = extractArray(res.data);
        unreadCount  = items.length;

        // Merge any genuinely new items (de-dup by messageId)
        const existingIds = new Set(
          allInboxItems.map(i => extractMessageId(i)).filter(Boolean)
        );
        for (const item of items) {
          const id = extractMessageId(item);
          if (!id || !existingIds.has(id)) {
            allInboxItems.push(item);
            inboxRepliesFound++;
          }
        }
      } catch (err) {
        unreadStatus = axios.isAxiosError(err) ? (err.response?.status ?? 0) : 0;
        // Expected to fail; don't push to errors[], only to endpointsTried
      }
      endpointsTried.push({ name: path, status: unreadStatus, count: unreadCount });
    }

    // ── Process all inbox items ────────────────────────────────────────

    if (allInboxItems.length > 0) {
      sourceUsed = 'master_inbox';

      for (const item of allInboxItems) {
        checked++;
        const email = extractEmail(item);

        if (!email) {
          errors.push(`Inbox reply #${checked} has no identifiable email - skipped`);
          unmatched++;
          continue;
        }

        const dbLead = await Lead.findOne({ email }).lean();
        if (!dbLead) {
          console.log(`[sync-smartlead] no DB lead for: ${email}`);
          unmatched++;
          // Still add a preview stub so we can see what Smartlead returned
          const topBody = extractBody(item);
          preview.push({
            email,
            hasBody:            !!topBody,
            bodyHash:           topBody ? bodyHash(topBody) : null,
            smartleadMessageId: extractMessageId(item) || null,
            receivedAt:         extractReceivedAt(item),
            source:             'master_inbox',
            matchedLead:        false,
            duplicate:          false,
          });
          continue;
        }

        const candidates = collectReplyCandidates(item);
        repliesExtracted += candidates.length;

        if (candidates.length === 0) {
          // Inbox item with no extractable body — note it in preview
          preview.push({
            email,
            hasBody:            false,
            bodyHash:           null,
            smartleadMessageId: extractMessageId(item) || null,
            receivedAt:         extractReceivedAt(item),
            source:             'master_inbox',
            matchedLead:        true,
            duplicate:          false,
          });
        }

        for (const candidate of candidates) {
          const bodyText   = extractBody(candidate);
          const hash       = bodyText ? bodyHash(bodyText) : null;
          const msgId      = extractMessageId(candidate) || null;
          const receivedAt = extractReceivedAt(candidate) ?? extractReceivedAt(item);

          const result = await processAndSave(
            dbLead._id as Types.ObjectId,
            email,
            candidate,
            errors
          );

          preview.push({
            email,
            hasBody:            !!bodyText,
            bodyHash:           hash,
            smartleadMessageId: msgId,
            receivedAt,
            source:             'master_inbox',
            matchedLead:        true,
            duplicate:          result.disposition === 'duplicate',
          });

          if (result.disposition === 'synced') {
            synced++;
          } else if (result.disposition === 'duplicate') {
            duplicates++;
            duplicateDetails.push({
              email,
              reason:             result.reason ?? 'unknown',
              existingReplyId:    result.existingReplyId ?? null,
              smartleadMessageId: msgId,
              receivedAt:         receivedAt ?? null,
            });
          }
        }
      }

      console.log(`[sync-smartlead] inbox processed — extracted:${repliesExtracted} synced:${synced} dupes:${duplicates} unmatched:${unmatched}`);
    }

    // ── Campaign history supplement (for inbox items that carry a lead_id) ──
    // Fetches the full Smartlead message history for any inbox-listed lead that
    // also has a campaign_lead_map_id / lead_id — catches replies that the inbox
    // item body field might have missed (e.g., multi-turn threads, custom sends).

    if (campaignId && allInboxItems.length > 0) {
      const processedSlLeadIds = new Set<string>();

      for (const item of allInboxItems) {
        const slLeadId = extractSmartleadLeadId(item);
        if (!slLeadId || processedSlLeadIds.has(slLeadId)) continue;
        processedSlLeadIds.add(slLeadId);

        const email = extractEmail(item);
        if (!email) continue;

        const dbLead = await Lead.findOne({ email }).lean();
        if (!dbLead) continue;

        const histResult = await fetchAndProcessCampaignHistory(
          campaignId,
          slLeadId,
          dbLead._id as Types.ObjectId,
          email,
          apiKey,
          endpointsTried,
          duplicateDetails,
          preview,
          errors,
          `campaign_history/${campaignId}`
        );

        synced       += histResult.synced;
        duplicates   += histResult.duplicates;
        repliesExtracted += histResult.extracted;
      }
    }

    // ════════════════════════════════════════════════════════════════════
    // FALLBACK SOURCE: Campaign Statistics + Message History
    // Only runs when Master Inbox returned zero usable items.
    // ════════════════════════════════════════════════════════════════════

    if (allInboxItems.length === 0) {
      if (!campaignId) {
        console.log(
          '[sync-smartlead] master inbox returned 0 replies. ' +
          'SMARTLEAD_CAMPAIGN_ID not set - fallback skipped.'
        );
      } else {
        console.log(
          '[sync-smartlead] master inbox returned 0 replies - ' +
          'trying campaign statistics fallback'
        );

        let statsItems: Record<string, unknown>[] = [];
        let statsHttpStatus = 0;

        try {
          const statsRes = await axios.get(
            `${BASE_URL}/campaigns/${campaignId}/statistics`,
            {
              params:  { api_key: apiKey, email_status: 'replied', offset: 0, limit: 100 },
              timeout: 25000,
            }
          );
          statsHttpStatus = statsRes.status;
          statsItems      = extractArray(statsRes.data);
        } catch (err) {
          statsHttpStatus = axios.isAxiosError(err) ? (err.response?.status ?? 0) : 0;
          const msg = `Campaign statistics fetch failed: ${safeMsg(err)}`;
          console.warn('[sync-smartlead]', msg);
          errors.push(msg);
        }

        endpointsTried.push({
          name:   `campaigns/${campaignId}/statistics`,
          status: statsHttpStatus,
          count:  statsItems.length,
        });
        console.log(
          `[sync-smartlead] fallback campaign statistics count: ${statsItems.length}`
        );

        if (statsItems.length > 0) {
          sourceUsed = 'campaign_statistics';

          for (const statsRow of statsItems) {
            checked++;

            const emailRaw = String(
              statsRow['email'] ??
              (statsRow['lead'] as Record<string, unknown> | undefined)?.['email'] ??
              statsRow['lead_email'] ?? ''
            ).toLowerCase().trim();

            const slLeadId = String(
              statsRow['lead_id'] ??
              statsRow['id'] ??
              (statsRow['lead'] as Record<string, unknown> | undefined)?.['id'] ??
              statsRow['campaign_lead_map_id'] ?? ''
            ).trim();

            if (!emailRaw) {
              errors.push(`Stats row #${checked} has no email - skipped`);
              unmatched++;
              continue;
            }

            const dbLead = await Lead.findOne({ email: emailRaw }).lean();
            if (!dbLead) {
              console.log(`[sync-smartlead] no DB lead for: ${emailRaw}`);
              unmatched++;
              continue;
            }

            if (!slLeadId) {
              // No lead_id → try to process body directly from the stats row
              const directBody = extractBody(statsRow);
              if (directBody) {
                repliesExtracted++;
                const result = await processAndSave(
                  dbLead._id as Types.ObjectId,
                  emailRaw,
                  statsRow,
                  errors
                );
                preview.push({
                  email:              emailRaw,
                  hasBody:            true,
                  bodyHash:           bodyHash(directBody),
                  smartleadMessageId: extractMessageId(statsRow) || null,
                  receivedAt:         extractReceivedAt(statsRow),
                  source:             `campaign_statistics/${campaignId}`,
                  matchedLead:        true,
                  duplicate:          result.disposition === 'duplicate',
                });
                if (result.disposition === 'synced')    synced++;
                if (result.disposition === 'duplicate') {
                  duplicates++;
                  duplicateDetails.push({
                    email:              emailRaw,
                    reason:             result.reason ?? 'unknown',
                    existingReplyId:    result.existingReplyId ?? null,
                    smartleadMessageId: extractMessageId(statsRow) || null,
                    receivedAt:         extractReceivedAt(statsRow),
                  });
                }
              } else {
                errors.push(
                  `Stats row #${checked} replied but has no lead_id or extractable body. ` +
                  'Use Master Inbox source.'
                );
              }
              continue;
            }

            // Fetch full message history
            const histResult = await fetchAndProcessCampaignHistory(
              campaignId,
              slLeadId,
              dbLead._id as Types.ObjectId,
              emailRaw,
              apiKey,
              endpointsTried,
              duplicateDetails,
              preview,
              errors,
              `campaign_history/${campaignId}`
            );

            synced       += histResult.synced;
            duplicates   += histResult.duplicates;
            repliesExtracted += histResult.extracted;
          }

          console.log(`[sync-smartlead] synced: ${synced}`);
          console.log(`[sync-smartlead] duplicates: ${duplicates}`);
          console.log(`[sync-smartlead] unmatched: ${unmatched}`);
        }
      }
    }

    // ── Custom send trackId warning ────────────────────────────────────
    // If we synced nothing but see duplicates, check whether a custom-send
    // EmailLog exists for any of the seen emails — if so, the reply may not
    // yet have propagated to Smartlead's Master Inbox API.

    if (synced === 0 && duplicates > 0) {
      const seenEmails = [...new Set(preview.map(p => p.email).filter(Boolean))];
      if (seenEmails.length > 0) {
        const customLog = await EmailLog.findOne({
          leadEmail:        { $in: seenEmails },
          smartleadTrackId: { $exists: true, $ne: null },
        }).lean();

        if (customLog) {
          const trackId = customLog.smartleadTrackId;
          if (trackId) {
            errors.push(
              `Custom send trackId is saved (${trackId}), but Smartlead Master Inbox ` +
              'did not return a reply for this custom thread yet.'
            );
          }
        }
      }
    }

    console.log(`[sync-smartlead] synced: ${synced}`);
    console.log(`[sync-smartlead] unmatched: ${unmatched}`);

    // ── Mailbox sync (runs after Smartlead sync if enabled) ───────────────────

    let mailboxResult: MailboxSyncResult = { enabled: false };
    if (process.env.MAILBOX_SYNC_ENABLED === 'true') {
      try {
        mailboxResult = await runMailboxSync();
      } catch (mbErr) {
        const mbMsg = `Mailbox sync error: ${String(mbErr)}`;
        console.error('[sync-smartlead]', mbMsg);
        errors.push(mbMsg);
        mailboxResult = {
          enabled: true, checked: 0, matched: 0, synced: 0,
          duplicates: 0, unmatched: 0, errors: [mbMsg],
        };
      }
    }

    const totalSynced     = synced + (mailboxResult.synced ?? 0);
    const totalDuplicates = duplicates + (mailboxResult.duplicates ?? 0);
    const totalUnmatched  = unmatched + (mailboxResult.unmatched ?? 0);

    // ── Build final message ────────────────────────────────────────────────────

    let message: string;
    if (totalSynced > 0) {
      message = `Synced ${totalSynced} ${totalSynced === 1 ? 'reply' : 'replies'} total.`;
    } else if (synced === 0 && duplicates > 0 && repliesExtracted > 0) {
      message =
        'Smartlead returned only already-synced replies. ' +
        'New custom reply was not present in Master Inbox API response.';
    } else if (repliesExtracted === 0 && inboxRepliesFound > 0) {
      message = 'Master Inbox returned items but no reply bodies could be extracted.';
    } else if (inboxRepliesFound === 0) {
      message = 'Smartlead Master Inbox returned no replies.';
    } else {
      message = 'No new replies to sync.';
    }

    return NextResponse.json({
      success:           true,
      sourceUsed,
      checked,
      inboxRepliesFound,
      repliesExtracted,
      synced,
      duplicates,
      unmatched,
      errors,
      endpointsTried,
      duplicateDetails,
      preview,
      // ── Combined / new fields ──────────────────────────────────────────────
      smartlead:       { checked, synced, duplicates, unmatched },
      mailbox:         mailboxResult,
      totalSynced,
      totalDuplicates,
      totalUnmatched,
      message,
    });

  } catch (err) {
    console.error('[sync-smartlead] Fatal error:', err);
    return NextResponse.json(
      {
        success:           false,
        sourceUsed,
        checked,
        inboxRepliesFound,
        repliesExtracted,
        synced,
        duplicates,
        unmatched,
        errors:            [...errors, String(err)],
        endpointsTried,
        duplicateDetails,
        preview,
        smartlead:       { checked, synced, duplicates, unmatched },
        mailbox:         { enabled: false } as MailboxSyncResult,
        totalSynced:     synced,
        totalDuplicates: duplicates,
        totalUnmatched:  unmatched,
        message:         'Sync failed with an internal error.',
      },
      { status: 500 }
    );
  }
}
