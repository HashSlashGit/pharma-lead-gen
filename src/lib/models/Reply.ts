import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface IReply extends Document {
  leadId: Types.ObjectId;
  emailLogId?: Types.ObjectId;
  messageId?: string;
  body: string;
  classification?: 'interested' | 'not_interested' | 'do_not_contact' | 'pricing_query' | 'certificate_query' | 'shipping_query' | 'out_of_office' | 'needs_review' | 'unclassified';
  aiDraft?: string;
  needsApproval: boolean;
  status: 'pending' | 'draft_generated' | 'draft_approved' | 'draft_rejected' | 'handled';
  aiDraftGenerated: boolean;
  draftEmailLogId?: Types.ObjectId;
  approvedAt?: Date;
  rejectedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  // ── Optional fields added for mailbox/channel tracking (backward compatible) ──
  /** Where this reply was captured from */
  source?: 'webhook' | 'smartlead_sync' | 'mailbox_sync' | 'manual' | 'gmail';
  /** IMAP Message-ID header — used for mailbox dedup */
  mailboxMessageId?: string;
  /** Smartlead message/reply ID — mirrors messageId, kept for clarity */
  smartleadMessageId?: string;
  /** SHA-256 (first 16 hex chars) of normalised body — used for body dedup */
  bodyHash?: string;
  /** When the reply was actually received (from email date header or API timestamp) */
  receivedAt?: Date;
  /** Gmail message ID — used for dedup when source is 'gmail' */
  gmailMessageId?: string;
  /** Gmail thread ID */
  gmailThreadId?: string;
}

const ReplySchema = new Schema<IReply>(
  {
    leadId: { type: Schema.Types.ObjectId, ref: 'Lead', required: true },
    emailLogId: { type: Schema.Types.ObjectId, ref: 'EmailLog' },
    messageId: { type: String, trim: true },
    body: { type: String, required: true },
    classification: {
      type: String,
      enum: ['interested', 'not_interested', 'do_not_contact', 'pricing_query', 'certificate_query', 'shipping_query', 'out_of_office', 'needs_review', 'unclassified'],
    },
    aiDraft: { type: String },
    needsApproval: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ['pending', 'draft_generated', 'draft_approved', 'draft_rejected', 'handled'],
      default: 'pending',
    },
    aiDraftGenerated: { type: Boolean, default: false },
    draftEmailLogId: { type: Schema.Types.ObjectId, ref: 'EmailLog' },
    approvedAt: { type: Date },
    rejectedAt: { type: Date },
    // Optional fields — backward compatible, all sparse-indexed
    source:            { type: String, enum: ['webhook', 'smartlead_sync', 'mailbox_sync', 'manual', 'gmail'] },
    mailboxMessageId:  { type: String, trim: true },
    smartleadMessageId:{ type: String, trim: true },
    bodyHash:          { type: String, trim: true },
    receivedAt:        { type: Date },
    gmailMessageId:    { type: String, trim: true },
    gmailThreadId:     { type: String, trim: true },
  },
  { timestamps: true }
);

ReplySchema.index({ leadId: 1 });
ReplySchema.index({ status: 1 });
ReplySchema.index({ needsApproval: 1, status: 1 });
ReplySchema.index({ messageId: 1 }, { sparse: true });
ReplySchema.index({ source: 1 }, { sparse: true });
ReplySchema.index({ mailboxMessageId: 1 }, { sparse: true });
ReplySchema.index({ bodyHash: 1, leadId: 1 }, { sparse: true });
ReplySchema.index({ gmailMessageId: 1 }, { sparse: true });
ReplySchema.index({ smartleadMessageId: 1 }, { sparse: true });
ReplySchema.index({ classification: 1 }, { sparse: true });
ReplySchema.index({ createdAt: -1 });
ReplySchema.index({ receivedAt: -1 }, { sparse: true });

const Reply: Model<IReply> = mongoose.models.Reply || mongoose.model<IReply>('Reply', ReplySchema);
export default Reply;
