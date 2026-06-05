/**
 * POST /api/gmail/sync
 *
 * Manual Gmail inbox sync — fetches recent inbox messages, matches senders to
 * Lead.email, deduplicates, classifies with the existing rule-based classifier,
 * and saves into the Reply collection with source: 'gmail'.
 *
 * No Claude calls. No auto-send. Does not touch Smartlead.
 * Stops follow-ups for any lead whose reply is saved (nextFollowUpAt = null).
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { connectDB } from '@/lib/db/mongoose';
import InboxAccount from '@/lib/models/InboxAccount';
import Lead from '@/lib/models/Lead';
import Reply from '@/lib/models/Reply';
import CampaignLead from '@/lib/models/CampaignLead';
import { classifyReply } from '@/lib/services/reply-classifier';
import { refreshGmailAccessToken, fetchRecentGmailReplies } from '@/lib/services/gmail';
import { resolveNoReplyForLead } from '@/lib/utils/noReplySync';

function makeBodyHash(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim().toLowerCase();
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

interface SyncResult {
  success: boolean;
  message: string;
  checked: number;
  created: number;
  duplicates: number;
  skippedNoLead: number;
  errors: string[];
}

export async function POST(): Promise<NextResponse<SyncResult>> {
  try {
    await connectDB();
  } catch (err) {
    return NextResponse.json(
      { success: false, message: `DB connection failed: ${String(err)}`, checked: 0, created: 0, duplicates: 0, skippedNoLead: 0, errors: [] },
      { status: 500 }
    );
  }

  const account = await InboxAccount.findOne({ provider: 'gmail', isActive: true });

  if (!account) {
    return NextResponse.json(
      {
        success: false,
        message: 'No Gmail account connected. Go to Settings → Gmail Inbox Sync → Connect Gmail.',
        checked: 0, created: 0, duplicates: 0, skippedNoLead: 0, errors: [],
      },
      { status: 400 }
    );
  }

  // Refresh access token if expired or expiring within 5 minutes
  let { accessToken } = account;
  const fiveMin = 5 * 60 * 1000;
  const needsRefresh = !account.tokenExpiry || account.tokenExpiry.getTime() - Date.now() < fiveMin;

  if (needsRefresh) {
    try {
      const refreshed = await refreshGmailAccessToken(account);
      accessToken = refreshed.accessToken;
      account.accessToken = refreshed.accessToken;
      account.tokenExpiry = refreshed.tokenExpiry;
      await account.save();
      console.log('[gmail/sync] access token refreshed');
    } catch (err) {
      const msg = `Token refresh failed: ${String(err)}`;
      console.error('[gmail/sync]', msg);
      return NextResponse.json(
        { success: false, message: msg, checked: 0, created: 0, duplicates: 0, skippedNoLead: 0, errors: [msg] },
        { status: 500 }
      );
    }
  }

  // Fetch recent Gmail inbox messages
  let gmailReplies;
  try {
    gmailReplies = await fetchRecentGmailReplies(accessToken, 50);
    console.log(`[gmail/sync] fetched ${gmailReplies.length} messages from inbox`);
  } catch (err) {
    const msg = `Gmail fetch failed: ${String(err)}`;
    console.error('[gmail/sync]', msg);
    return NextResponse.json(
      { success: false, message: msg, checked: 0, created: 0, duplicates: 0, skippedNoLead: 0, errors: [msg] },
      { status: 500 }
    );
  }

  let checked = 0, created = 0, duplicates = 0, skippedNoLead = 0;
  const errors: string[] = [];

  for (const gReply of gmailReplies) {
    checked++;

    try {
      // Match sender email to a lead (case-insensitive — email stored lowercase in both)
      const lead = await Lead.findOne({ email: gReply.senderEmail }).lean();
      if (!lead) {
        skippedNoLead++;
        continue;
      }

      // Dedup 1: by Gmail message ID
      const byGmailId = await Reply.findOne({ gmailMessageId: gReply.gmailMessageId }).lean();
      if (byGmailId) {
        duplicates++;
        continue;
      }

      // Dedup 2: by bodyHash + leadId
      const bHash = makeBodyHash(gReply.body);
      const byHash = await Reply.findOne({ bodyHash: bHash, leadId: lead._id }).lean();
      if (byHash) {
        duplicates++;
        continue;
      }

      const { classification, updateLeadStatus, needsApproval } = classifyReply(gReply.body);

      const savedReply = await Reply.create({
        leadId:          lead._id,
        body:            gReply.body,
        classification,
        needsApproval,
        source:          'gmail',
        gmailMessageId:  gReply.gmailMessageId,
        gmailThreadId:   gReply.gmailThreadId,
        bodyHash:        bHash,
        receivedAt:      gReply.receivedAt,
      });

      // Stop follow-ups; optionally update lead status
      const leadUpdate: Record<string, unknown> = { nextFollowUpAt: null };
      if (updateLeadStatus) leadUpdate['status'] = updateLeadStatus;
      await Lead.findByIdAndUpdate(lead._id, leadUpdate);

      // ── Resolve NoReplyLead so lead leaves /leads/no-reply ────────
      await resolveNoReplyForLead({ leadId: lead._id, replyReceivedAt: gReply.receivedAt ?? new Date() });

      // ── Update CampaignLead records for this lead ─────────────────
      await CampaignLead.updateMany(
        { leadId: lead._id, status: 'active' },
        { $set: { lastReplyAt: savedReply.receivedAt ?? new Date() } }
      );

      created++;
      console.log(`[gmail/sync] saved reply from ${gReply.senderEmail} → ${classification}`);
    } catch (err) {
      const msg = `Error processing ${gReply.senderEmail}: ${String(err)}`;
      console.error('[gmail/sync]', msg);
      errors.push(msg);
    }
  }

  // Record sync time
  account.lastSyncedAt = new Date();
  await account.save();

  const message =
    created > 0
      ? `Synced ${created} new ${created === 1 ? 'reply' : 'replies'} from Gmail.`
      : duplicates > 0
      ? `No new replies — ${duplicates} already synced.`
      : skippedNoLead > 0
      ? `No matching leads found for ${skippedNoLead} inbox message${skippedNoLead !== 1 ? 's' : ''}.`
      : 'No new replies found in Gmail inbox.';

  console.log(`[gmail/sync] done — checked:${checked} created:${created} duplicates:${duplicates} skipped:${skippedNoLead}`);

  return NextResponse.json({ success: true, message, checked, created, duplicates, skippedNoLead, errors });
}
