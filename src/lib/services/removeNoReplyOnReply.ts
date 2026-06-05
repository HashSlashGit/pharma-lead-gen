import { Types } from 'mongoose';
import NoReplyLead from '@/lib/models/NoReplyLead';

/**
 * Mark matching NoReplyLead records as inactive when a reply is received.
 * Does NOT physically delete records — keeps history for audit/reconcile.
 * Safe to call multiple times (idempotent — only updates records where isActive !== false).
 */
export async function removeNoReplyOnReply({
  leadId,
  leadEmail,
  replyId,
  source,
  receivedAt,
}: {
  leadId?: Types.ObjectId | string;
  leadEmail?: string;
  replyId?: Types.ObjectId | string;
  source?: string;
  receivedAt?: Date;
}): Promise<void> {
  const now = receivedAt ?? new Date();

  const updateFields: Record<string, unknown> = {
    isActive: false,
    status: 'resolved',
    removedFromNoReplyAt: now,
    removedFromNoReplyReason: 'replied',
  };
  if (replyId) {
    updateFields.removedByReplyId =
      typeof replyId === 'string' ? new Types.ObjectId(replyId) : replyId;
  }
  if (source) {
    updateFields.latestReplySource = source;
  }

  try {
    if (leadId) {
      const id = typeof leadId === 'string' ? new Types.ObjectId(leadId) : leadId;
      const result = await NoReplyLead.findOneAndUpdate(
        { leadId: id, isActive: { $ne: false } },
        { $set: updateFields }
      );
      if (result) {
        console.log(`[NoReply] marked inactive after reply: leadId=${String(id)}`);
        return;
      }
    }

    if (leadEmail) {
      const email = leadEmail.toLowerCase().trim();
      const result = await NoReplyLead.findOneAndUpdate(
        { email, isActive: { $ne: false } },
        { $set: updateFields }
      );
      if (result) {
        console.log(`[NoReply] marked inactive after reply: email=${email}`);
      }
    }
  } catch (err) {
    console.error('[NoReply] removeNoReplyOnReply failed:', err);
  }
}
