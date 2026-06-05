/**
 * Shared helper: maps a reply classification to the correct Lead status
 * and persists the update. Zero emails, zero Claude, zero Smartlead calls.
 *
 * Classification → Lead status mapping:
 *   interested / pricing_query / certificate_query / shipping_query → warm
 *   not_interested / do_not_contact                                 → rejected
 *   out_of_office / needs_review / unclassified                     → needs_review
 */

import { Types } from 'mongoose';
import Lead from '@/lib/models/Lead';
import type { ReplyClassification } from './reply-classifier';

type ValidLeadStatus =
  | 'new'
  | 'qualified'
  | 'needs_review'
  | 'low_priority'
  | 'contacted'
  | 'warm'
  | 'cold'
  | 'rejected'
  | 'no_response'
  | 'do_not_contact';

function mapClassificationToLeadStatus(classification: ReplyClassification): ValidLeadStatus | null {
  switch (classification) {
    case 'interested':
    case 'pricing_query':
    case 'certificate_query':
    case 'shipping_query':
      return 'warm';
    case 'not_interested':
    case 'do_not_contact':
      return 'rejected';
    case 'out_of_office':
    case 'needs_review':
    case 'unclassified':
      return 'needs_review';
    default:
      return null;
  }
}

export async function syncLeadStatusFromReply({
  leadId,
  leadEmail,
  classification,
}: {
  leadId?: string | Types.ObjectId;
  leadEmail?: string;
  classification: ReplyClassification;
  replyId?: string | Types.ObjectId;
  receivedAt?: Date;
}): Promise<void> {
  try {
    const mappedStatus = mapClassificationToLeadStatus(classification);
    const update: Record<string, unknown> = { nextFollowUpAt: null };
    if (mappedStatus) update.status = mappedStatus;

    if (leadId) {
      const result = await Lead.findByIdAndUpdate(leadId, update);
      if (!result) {
        console.log(`[reply-status-sync] skipped: lead not found (leadId=${String(leadId)})`);
        return;
      }
      console.log(`[reply-status-sync] updated lead: ${String(leadId)} classification=${classification} mappedStatus=${mappedStatus ?? 'none'}`);
      return;
    }

    if (leadEmail) {
      const lead = await Lead.findOneAndUpdate(
        { email: leadEmail.toLowerCase().trim() },
        update,
      );
      if (!lead) {
        console.log(`[reply-status-sync] skipped: lead not found (leadEmail=${leadEmail})`);
        return;
      }
      console.log(`[reply-status-sync] updated lead: ${String(lead._id)} classification=${classification} mappedStatus=${mappedStatus ?? 'none'}`);
      return;
    }

    console.log('[reply-status-sync] skipped: no leadId or leadEmail provided');
  } catch (err) {
    console.log(`[reply-status-sync] skipped: error ${String(err)}`);
  }
}
