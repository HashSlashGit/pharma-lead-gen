/**
 * Mailbox inbox sync — captures custom/single-send replies via IMAP.
 * Zero Claude credits. No AI calls.
 *
 * Env vars required when MAILBOX_SYNC_ENABLED=true:
 *   MAILBOX_IMAP_HOST         (default: imap.gmail.com)
 *   MAILBOX_IMAP_PORT         (default: 993)
 *   MAILBOX_IMAP_SECURE       (default: true)
 *   MAILBOX_USER              = your@email.com
 *   MAILBOX_APP_PASSWORD      = (never logged)
 *   MAILBOX_LOOKBACK_DAYS     (default: 14)
 *
 * Security: password is never logged.  Full email bodies are never logged.
 */

import { createHash }    from 'crypto';
import { Types }         from 'mongoose';
import { ImapFlow }      from 'imapflow';
import { simpleParser }  from 'mailparser';
import type { ParsedMail } from 'mailparser';
import Lead              from '@/lib/models/Lead';
import Reply             from '@/lib/models/Reply';
import EmailLog          from '@/lib/models/EmailLog';
import CampaignLead      from '@/lib/models/CampaignLead';
import { classifyReply } from '@/lib/services/reply-classifier';
import { syncLeadStatusFromReply } from '@/lib/services/syncLeadStatusFromReply';
import { removeNoReplyOnReply } from '@/lib/services/removeNoReplyOnReply';
import { getSettings } from '@/lib/services/settingsCache';

// ── Public result type ────────────────────────────────────────────────────────

export interface MailboxSyncResult {
  enabled: boolean;
  checked?: number;
  matched?: number;
  synced?: number;
  duplicates?: number;
  unmatched?: number;
  errors?: string[];
}

// ── Private helpers ───────────────────────────────────────────────────────────

/** SHA-256 (first 16 hex chars) of normalised body — used for dedup, never stored raw. */
function computeBodyHash(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim().toLowerCase();
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

/**
 * Strip Re:/Fwd:/Fw: prefixes iteratively so that
 * "Re: Re: Re: Subject" → "subject".
 */
function normalizeSubject(raw: string): string {
  let s = (raw ?? '').trim();
  let prev: string;
  do {
    prev = s;
    s = s.replace(/^(re|fwd|fw)\s*:\s*/gi, '').trim();
  } while (s !== prev);
  return s.toLowerCase();
}

/**
 * Return plain-text body, falling back to HTML with tags stripped.
 * Never logs the full content.
 */
function extractBodyText(parsed: ParsedMail): string {
  if (parsed.text) return parsed.text.trim();
  if (parsed.html) {
    return (parsed.html as string)
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/\s+/g, ' ')
      .trim();
  }
  return '';
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function runMailboxSync(): Promise<MailboxSyncResult> {
  const s = await getSettings();
  if (!s.mailboxEnabled) return { enabled: false };

  const host         = s.mailboxImapHost  ?? 'imap.gmail.com';
  const port         = s.mailboxImapPort  ?? 993;
  const secure       = s.mailboxImapSecure ?? true;
  const user         = s.mailboxUser      ?? '';
  const pass         = s.mailboxPassword  ?? '';
  const lookbackDays = s.mailboxLookbackDays ?? 14;

  if (!user || !pass) {
    return {
      enabled:    true,
      checked:    0,
      matched:    0,
      synced:     0,
      duplicates: 0,
      unmatched:  0,
      errors:     ['Mailbox credentials not configured — add them in Settings → Integrations.'],
    };
  }

  const errors: string[] = [];
  let checked = 0, matched = 0, synced = 0, duplicates = 0, unmatched = 0;

  // ── Load custom sent EmailLogs within the lookback window ─────────────────

  const lookbackDate = new Date();
  lookbackDate.setDate(lookbackDate.getDate() - lookbackDays);

  const customLogs = await EmailLog.find({
    sendMode:  'custom',
    status:    'sent',
    leadEmail: { $exists: true, $ne: '' },
    sentAt:    { $gte: lookbackDate },
  }).lean();

  console.log(`[mailbox-sync] custom sent logs checked: ${customLogs.length}`);

  if (customLogs.length === 0) {
    return {
      enabled:    true,
      checked:    0,
      matched:    0,
      synced:     0,
      duplicates: 0,
      unmatched:  0,
      errors:     [],
    };
  }

  // Build lookup: leadEmail (lowercase) → EmailLog[]
  const logsByEmail = new Map<string, typeof customLogs>();
  for (const log of customLogs) {
    const key = (log.leadEmail ?? '').toLowerCase().trim();
    if (!key) continue;
    const arr = logsByEmail.get(key) ?? [];
    arr.push(log);
    logsByEmail.set(key, arr);
  }

  // ── IMAP connection ───────────────────────────────────────────────────────

  const client = new ImapFlow({
    host,
    port,
    secure,
    auth: { user, pass },
    logger: false,           // never log credentials or raw IMAP data
    socketTimeout: 60_000,   // 60 s inactivity timeout
  });

  try {
    await client.connect();
    console.log('[mailbox-sync] started');

    const lock = await client.getMailboxLock('INBOX');
    try {
      // IMAP SINCE is date-granular and uses internal (received) date
      const searchResult = await client.search({ since: lookbackDate }, { uid: true });
      const uids = searchResult === false ? [] : searchResult;
      checked = uids.length;
      console.log(`[mailbox-sync] inbox messages checked: ${checked}`);

      if (uids.length > 0) {
        for await (const msg of client.fetch(uids, { source: true }, { uid: true })) {
          if (!msg.source) continue;

          try {
            const parsed = await simpleParser(msg.source);

            // ── From address ──────────────────────────────────────────────
            const fromAddr  = parsed.from?.value?.[0]?.address ?? '';
            const fromEmail = fromAddr.toLowerCase().trim();
            if (!fromEmail) continue;

            // Only process if we sent a custom email to this address
            const matchingLogs = logsByEmail.get(fromEmail);
            if (!matchingLogs || matchingLogs.length === 0) continue;

            const emailDate          = parsed.date ?? new Date();
            const normalizedIncoming = normalizeSubject(parsed.subject ?? '');

            // ── Find best matching EmailLog ───────────────────────────────
            // Pass 1: subject contains-match + date after sentAt
            let bestLog: (typeof customLogs)[0] | null = null;

            for (const log of matchingLogs) {
              if (!log.sentAt || emailDate <= log.sentAt) continue;
              const normalizedLog = normalizeSubject(log.subject ?? '');
              if (
                normalizedLog &&
                normalizedIncoming &&
                (normalizedIncoming.includes(normalizedLog) ||
                  normalizedLog.includes(normalizedIncoming))
              ) {
                bestLog = log;
                break;
              }
            }

            // Pass 2: any log where email arrived after sentAt (no subject constraint)
            if (!bestLog) {
              for (const log of matchingLogs) {
                if (log.sentAt && emailDate > log.sentAt) {
                  bestLog = log;
                  break;
                }
              }
            }

            if (!bestLog) continue;

            // ── Extract body ──────────────────────────────────────────────
            const bodyText = extractBodyText(parsed);
            if (!bodyText) continue;

            matched++;

            // ── Find Lead ─────────────────────────────────────────────────
            // Prefer the leadId stored on the EmailLog, fall back to email lookup
            let lead = bestLog.leadId
              ? await Lead.findById(bestLog.leadId).lean()
              : null;
            if (!lead) {
              lead = await Lead.findOne({ email: fromEmail }).lean();
            }
            if (!lead) {
              unmatched++;
              continue;
            }

            const leadId = lead._id as Types.ObjectId;
            const hash   = computeBodyHash(bodyText);
            const msgId  = parsed.messageId ?? '';

            // ── Dedup 1: by IMAP Message-ID ───────────────────────────────
            if (msgId) {
              const existingByMsgId = await Reply.findOne({ mailboxMessageId: msgId }).lean();
              if (existingByMsgId) {
                duplicates++;
                continue;
              }
            }

            // ── Dedup 2: by leadId + bodyHash ─────────────────────────────
            const existingByHash = await Reply.findOne({ leadId, bodyHash: hash }).lean();
            if (existingByHash) {
              duplicates++;
              continue;
            }

            // ── Dedup 3: by leadId + exact body ───────────────────────────
            const existingByBody = await Reply.findOne({ leadId, body: bodyText }).lean();
            if (existingByBody) {
              duplicates++;
              continue;
            }

            // ── Classify ──────────────────────────────────────────────────
            const { classification, needsApproval } = classifyReply(bodyText);

            // ── Save Reply ────────────────────────────────────────────────
            try {
              await Reply.create({
                leadId,
                body:              bodyText,
                classification,
                needsApproval,
                status:            'pending',
                aiDraftGenerated:  false,
                source:            'mailbox_sync',
                mailboxMessageId:  msgId || undefined,
                bodyHash:          hash,
                receivedAt:        emailDate,
              });

              await syncLeadStatusFromReply({ leadId, classification, receivedAt: emailDate });
              await removeNoReplyOnReply({ leadId, receivedAt: emailDate, source: 'mailbox_sync' });
              await CampaignLead.updateMany(
                { leadId, status: 'active' },
                { $set: { lastReplyAt: emailDate } }
              );
              console.log(`[mailbox-sync] synced reply from ${fromEmail} -> ${classification}`);
              synced++;
            } catch (saveErr) {
              errors.push(`Save failed for ${fromEmail}: ${String(saveErr)}`);
            }
          } catch (msgErr) {
            errors.push(`Message parse/process error: ${String(msgErr)}`);
          }
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (connErr) {
    // Redact password from error string before logging
    const safeMsg = String(connErr).replace(pass, '[REDACTED]');
    console.error('[mailbox-sync] IMAP error:', safeMsg);
    errors.push(`IMAP error: ${safeMsg}`);
    // Force-close the socket so we don't leak the connection
    try { client.close(); } catch (_) { /* ignore */ }
  }

  console.log(`[mailbox-sync] matched replies: ${matched}`);
  console.log(`[mailbox-sync] synced: ${synced}`);
  console.log(`[mailbox-sync] duplicates: ${duplicates}`);
  console.log(`[mailbox-sync] unmatched: ${unmatched}`);

  return { enabled: true, checked, matched, synced, duplicates, unmatched, errors };
}
