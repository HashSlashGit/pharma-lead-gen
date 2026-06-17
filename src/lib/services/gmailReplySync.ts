import { createHash } from 'crypto';
import { connectDB } from '@/lib/db/mongoose';
import InboxAccount from '@/lib/models/InboxAccount';
import Lead from '@/lib/models/Lead';
import Reply from '@/lib/models/Reply';
import CampaignLead from '@/lib/models/CampaignLead';
import { fetchRecentGmailReplies } from '@/lib/services/gmail';
import { ensureFreshToken } from '@/lib/services/mailboxRotation';
import { classifyReply } from '@/lib/services/reply-classifier';
import { resolveNoReplyForLead } from '@/lib/utils/noReplySync';

export interface GmailReplySyncResult {
  enabled: boolean;
  checked: number;
  synced: number;
  duplicates: number;
  skippedNoLead: number;
  errors: string[];
  message: string;
}

function makeBodyHash(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim().toLowerCase();
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

async function syncSingleInbox(
  account: InstanceType<typeof InboxAccount>,
  maxResults: number
): Promise<{ checked: number; synced: number; duplicates: number; skippedNoLead: number; errors: string[] }> {
  const errors: string[] = [];
  let accessToken: string;

  try {
    accessToken = await ensureFreshToken(account);
    account.accessToken = accessToken;
  } catch (err) {
    errors.push(`[${account.email}] Token refresh failed: ${String(err)}`);
    return { checked: 0, synced: 0, duplicates: 0, skippedNoLead: 0, errors };
  }

  let gmailReplies;
  try {
    gmailReplies = await fetchRecentGmailReplies(accessToken, Math.min(maxResults, 50));
  } catch (err) {
    errors.push(`[${account.email}] Gmail fetch failed: ${String(err)}`);
    return { checked: 0, synced: 0, duplicates: 0, skippedNoLead: 0, errors };
  }

  if (gmailReplies.length === 0) {
    account.lastSyncedAt = new Date();
    await account.save();
    return { checked: 0, synced: 0, duplicates: 0, skippedNoLead: 0, errors };
  }

  // --- Batch Phase 1: 2 queries replace N×3 sequential queries ---
  // Collect all unique sender emails and all message IDs upfront, then fetch in bulk.
  const senderEmails = [...new Set(gmailReplies.map(r => r.senderEmail).filter(Boolean))];
  const gmailMsgIds  = gmailReplies.map(r => r.gmailMessageId).filter(Boolean);

  const [leadsArr, existingReplies] = await Promise.all([
    Lead.find({ email: { $in: senderEmails } }).lean(),
    Reply.find({ gmailMessageId: { $in: gmailMsgIds } }).select('gmailMessageId').lean(),
  ]);

  const leadByEmail  = new Map(leadsArr.map(l => [l.email, l]));
  const knownMsgIds  = new Set(existingReplies.map(r => r.gmailMessageId));

  // --- Process each message using in-memory lookups ---
  let checked = 0, synced = 0, duplicates = 0, skippedNoLead = 0;

  for (const gReply of gmailReplies) {
    checked++;
    try {
      const lead = leadByEmail.get(gReply.senderEmail);
      if (!lead) { skippedNoLead++; continue; }

      if (knownMsgIds.has(gReply.gmailMessageId)) { duplicates++; continue; }

      // Body-hash dedup only fires for messages that are genuinely new (rare in practice).
      const bHash = makeBodyHash(gReply.body);
      const byHash = await Reply.findOne({ bodyHash: bHash, leadId: lead._id }).lean();
      if (byHash) { duplicates++; continue; }

      const { classification, updateLeadStatus, needsApproval } = classifyReply(gReply.body);

      const savedReply = await Reply.create({
        leadId:         lead._id,
        body:           gReply.body,
        classification,
        needsApproval,
        source:         'gmail',
        gmailMessageId: gReply.gmailMessageId,
        gmailThreadId:  gReply.gmailThreadId,
        bodyHash:       bHash,
        receivedAt:     gReply.receivedAt,
      });

      const leadUpdate: Record<string, unknown> = { nextFollowUpAt: null };
      if (updateLeadStatus) leadUpdate['status'] = updateLeadStatus;
      await Lead.findByIdAndUpdate(lead._id, leadUpdate);

      await resolveNoReplyForLead({ leadId: lead._id, replyReceivedAt: gReply.receivedAt ?? new Date() });
      await CampaignLead.updateMany(
        { leadId: lead._id, status: 'active' },
        { $set: { lastReplyAt: savedReply.receivedAt ?? new Date() } }
      );

      // Add to local known-set so duplicate messages within the same batch are caught.
      knownMsgIds.add(gReply.gmailMessageId);
      synced++;
    } catch (err) {
      errors.push(`[${account.email}] Error processing ${gReply.senderEmail}: ${String(err)}`);
    }
  }

  account.lastSyncedAt = new Date();
  await account.save();

  return { checked, synced, duplicates, skippedNoLead, errors };
}

export async function runGmailReplySync(maxResults = 50): Promise<GmailReplySyncResult> {
  await connectDB();

  const accounts = await InboxAccount.find({ provider: 'gmail', isActive: true });

  if (accounts.length === 0) {
    return {
      enabled: false,
      checked: 0,
      synced: 0,
      duplicates: 0,
      skippedNoLead: 0,
      errors: [],
      message: 'No Gmail account connected. Go to Settings → Gmail Inbox Sync → Connect Gmail.',
    };
  }

  let totalChecked = 0, totalSynced = 0, totalDuplicates = 0, totalSkippedNoLead = 0;
  const allErrors: string[] = [];

  for (const account of accounts) {
    const result = await syncSingleInbox(account, maxResults);
    totalChecked       += result.checked;
    totalSynced        += result.synced;
    totalDuplicates    += result.duplicates;
    totalSkippedNoLead += result.skippedNoLead;
    allErrors.push(...result.errors);
  }

  const message =
    totalSynced > 0
      ? `Synced ${totalSynced} new ${totalSynced === 1 ? 'reply' : 'replies'} from Gmail (${accounts.length} inbox${accounts.length !== 1 ? 'es' : ''}).`
      : totalDuplicates > 0
      ? `No new replies — ${totalDuplicates} already synced.`
      : totalSkippedNoLead > 0
      ? `No matching leads for ${totalSkippedNoLead} inbox message${totalSkippedNoLead !== 1 ? 's' : ''}.`
      : 'No new replies found in Gmail inbox.';

  return {
    enabled:       true,
    checked:       totalChecked,
    synced:        totalSynced,
    duplicates:    totalDuplicates,
    skippedNoLead: totalSkippedNoLead,
    errors:        allErrors,
    message,
  };
}
