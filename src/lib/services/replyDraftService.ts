/**
 * Shared reply-draft generation service.
 *
 * Single implementation used by:
 *   • POST /api/replies/[id]/generate-draft  (manual, user-triggered)
 *   • gmailReplySync (automatic, fire-and-forget after Reply.create)
 *
 * Idempotent: safe to call multiple times for the same reply.
 */

import mongoose, { Types } from 'mongoose';
import { connectDB } from '@/lib/db/mongoose';
import Reply from '@/lib/models/Reply';
import EmailLog from '@/lib/models/EmailLog';
import Product from '@/lib/models/Product';
import { type ILead } from '@/lib/models/Lead';
import { draftReplyEmail } from '@/lib/services/claude';
import { getSettings } from '@/lib/services/settingsCache';

// ── Classification sets ─────────────────────────────────────────────────────

/** High-confidence classifications that receive auto-drafts during Gmail sync. */
export const AUTO_DRAFT_CLASSIFICATIONS = new Set([
  'interested',
  'pricing_query',
  'certificate_query',
  'shipping_query',
]);

/**
 * Classifications allowed for manual draft generation.
 * Adds 'unclassified' to the auto set — users may want to draft a reply
 * even when classification is uncertain.
 */
export const MANUAL_DRAFT_CLASSIFICATIONS = new Set([
  ...AUTO_DRAFT_CLASSIFICATIONS,
  'unclassified',
]);

// ── Result type ─────────────────────────────────────────────────────────────

export interface DraftResult {
  success: boolean;
  draftLogId?: string;
  subject?: string;
  body?: string;
  /** Set when generation was skipped for a non-error reason. */
  skipped?: boolean;
  skipReason?:
    | 'no_api_key'
    | 'already_drafted'
    | 'no_lead_email'
    | 'existing_draft_relinked';
  error?: string;
}

// ── Core service ────────────────────────────────────────────────────────────

/**
 * Generate an AI reply draft for the given reply ID.
 *
 * Callers decide which classifications to call this for.
 * This function enforces idempotency and wraps the Claude call safely.
 *
 * Returns { success: true } when a draft is created or an existing
 * draft is relinked. Returns { success: false } on hard errors.
 * Returns { skipped: true } for non-error skips (config, idempotency).
 */
export async function generateReplyDraft(
  replyId: string | Types.ObjectId,
): Promise<DraftResult> {
  try {
    await connectDB();

    const rid =
      typeof replyId === 'string' ? replyId : (replyId as Types.ObjectId).toString();

    if (!mongoose.Types.ObjectId.isValid(rid)) {
      return { success: false, error: 'Invalid reply ID' };
    }

    // Cheap config check before touching the DB
    const settings = await getSettings();
    if (!settings.claudeApiKey) {
      return { success: false, skipped: true, skipReason: 'no_api_key' };
    }

    const reply = await Reply.findById(rid)
      .populate<{ leadId: ILead }>(
        'leadId',
        'companyName email country category score',
      )
      .lean();

    if (!reply) {
      return { success: false, error: 'Reply not found' };
    }

    // Idempotency guard 1: reply already has a draft
    if (reply.aiDraftGenerated || reply.draftEmailLogId) {
      return { success: false, skipped: true, skipReason: 'already_drafted' };
    }

    const lead = reply.leadId as ILead;

    if (!lead.email) {
      return { success: false, skipped: true, skipReason: 'no_lead_email' };
    }

    const leadId = (lead._id as Types.ObjectId).toString();

    // Idempotency guard 2: a pending EmailLog already exists for this reply
    const existingDraftLog = await EmailLog.findOne({
      replyId: new Types.ObjectId(rid),
      type: 'reply',
      status: 'pending',
    }).lean();

    if (existingDraftLog) {
      // Re-link in case the Reply document update failed on a previous call
      await Reply.findByIdAndUpdate(rid, {
        status: 'draft_generated',
        aiDraftGenerated: true,
        draftEmailLogId: existingDraftLog._id,
        needsApproval: true,
      });
      return {
        success: true,
        skipped: true,
        skipReason: 'existing_draft_relinked',
        draftLogId: existingDraftLog._id.toString(),
        subject: existingDraftLog.subject,
        body: existingDraftLog.body,
      };
    }

    // Thread context: most recent sent outbound email to this lead
    const originalEmail = await EmailLog.findOne({
      leadId: lead._id,
      type: { $in: ['initial', 'follow_up'] },
      status: 'sent',
    })
      .sort({ sentAt: -1 })
      .select('body subject')
      .lean();

    const threadContext = originalEmail?.body
      ? originalEmail.body.slice(0, 400)
      : undefined;

    // Product context: first product (consistent with the manual draft route)
    const firstProduct = await Product.findOne()
      .select('name description')
      .lean<{ name: string; description?: string }>();
    const productContext = firstProduct
      ? `${firstProduct.name}: ${firstProduct.description ?? ''}`
      : undefined;

    const classification = reply.classification ?? 'unclassified';

    const draftBody = await draftReplyEmail({
      leadId,
      replyBody: reply.body,
      classification,
      companyName: lead.companyName,
      country: lead.country,
      category: lead.category ?? '',
      productContext,
      threadContext,
    });

    const subject = `Re: Our conversation — ${lead.companyName}`;

    const draftLog = await EmailLog.create({
      leadId: lead._id,
      replyId: new Types.ObjectId(rid),
      type: 'reply',
      subject,
      body: draftBody,
      status: 'pending',
    });

    await Reply.findByIdAndUpdate(rid, {
      status: 'draft_generated',
      aiDraftGenerated: true,
      draftEmailLogId: draftLog._id,
      needsApproval: true,
    });

    return {
      success: true,
      draftLogId: draftLog._id.toString(),
      subject,
      body: draftBody,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[replyDraftService] generateReplyDraft failed:', message);
    return { success: false, error: message };
  }
}
