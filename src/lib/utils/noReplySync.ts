import { Types } from 'mongoose';
import NoReplyLead from '@/lib/models/NoReplyLead';
import Lead from '@/lib/models/Lead';
import { removeNoReplyOnReply } from '@/lib/services/removeNoReplyOnReply';

// ── Add lead to NoReplyLead after a confirmed send ─────────────────────────────

export async function markLeadWaitingForReply({
  leadId,
  emailLogId,
  sentAt,
}: {
  leadId: Types.ObjectId | string;
  emailLogId: Types.ObjectId | string;
  sentAt?: Date;
}): Promise<void> {
  const lid = typeof leadId === 'string' ? new Types.ObjectId(leadId) : leadId;
  const logId = typeof emailLogId === 'string' ? new Types.ObjectId(emailLogId) : emailLogId;
  const now = sentAt ?? new Date();

  try {
    const lead = await Lead.findById(lid).lean();
    if (!lead || !lead.email) return;

    await NoReplyLead.findOneAndUpdate(
      { leadId: lid },
      {
        $set: {
          companyName: lead.companyName,
          email: lead.email,
          country: lead.country,
          category: lead.category,
          status: 'active',
          isActive: true,
          lastSentAt: now,
          lastEmailLogId: logId,
          // Clear removal fields if lead was previously marked inactive
          removedFromNoReplyAt: undefined,
          removedFromNoReplyReason: undefined,
          removedByReplyId: undefined,
          latestReplySource: undefined,
        },
      },
      { upsert: true }
    );
    console.log(`[NoReply] added lead after send: ${lead.email}`);
  } catch (err) {
    console.error('[NoReply] markLeadWaitingForReply failed:', err);
  }
}

// ── Remove lead from NoReplyLead after a reply is created ──────────────────────

export async function resolveNoReplyForLead({
  leadId,
  replyId,
  source,
  replyReceivedAt,
}: {
  leadId: Types.ObjectId | string;
  replyId?: Types.ObjectId | string;
  source?: string;
  replyReceivedAt?: Date;
}): Promise<void> {
  await removeNoReplyOnReply({ leadId, replyId, source, receivedAt: replyReceivedAt });
}

// ── Backward-compat alias ─────────────────────────────────────────────────────

/** @deprecated Use resolveNoReplyForLead instead. */
export async function resolveNoReplyLead(
  leadId: Types.ObjectId | string,
  receivedAt?: Date
): Promise<void> {
  return resolveNoReplyForLead({ leadId, replyReceivedAt: receivedAt });
}

/** Returns the Mongoose filter for active no-reply records. */
export function getActiveNoReplyQuery() {
  return { isActive: { $ne: false }, status: 'active' as const };
}
