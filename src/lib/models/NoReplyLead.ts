import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface INoReplyLead extends Document {
  leadId: Types.ObjectId;
  companyName: string;
  email?: string;
  country: string;
  category: string;
  // ── Active tracking fields ────────────────────────────────────────────────
  /** 'active' = waiting for reply; 'resolved' = lead replied; 'archived' = final no-response */
  status: 'active' | 'resolved' | 'archived';
  lastSentAt?: Date;
  lastEmailLogId?: Types.ObjectId;
  replyReceivedAt?: Date;
  campaignIds?: Types.ObjectId[];
  // ── Reply-removal tracking (soft delete) ────────────────────────────────
  /** false = removed from active view due to reply or archival; true/missing = active */
  isActive: boolean;
  removedFromNoReplyAt?: Date;
  removedFromNoReplyReason?: string;
  removedByReplyId?: Types.ObjectId;
  latestReplySource?: string;
  // ── Legacy archive fields (kept for backward compat with old records) ─────
  originalStatus?: string;
  finalStatus?: string;
  lastContactedAt?: Date;
  followUpCount: number;
  campaignId?: Types.ObjectId;
  reason?: string;
  archivedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const NoReplyLeadSchema = new Schema<INoReplyLead>(
  {
    leadId: { type: Schema.Types.ObjectId, ref: 'Lead', required: true, unique: true },
    companyName: { type: String, required: true },
    email: { type: String },
    country: { type: String, required: true },
    category: { type: String, required: true },
    // Active tracking
    status: { type: String, enum: ['active', 'resolved', 'archived'], default: 'archived' },
    lastSentAt: { type: Date },
    lastEmailLogId: { type: Schema.Types.ObjectId, ref: 'EmailLog' },
    replyReceivedAt: { type: Date },
    campaignIds: [{ type: Schema.Types.ObjectId, ref: 'Campaign' }],
    // Reply-removal tracking
    isActive: { type: Boolean, default: true },
    removedFromNoReplyAt: { type: Date },
    removedFromNoReplyReason: { type: String },
    removedByReplyId: { type: Schema.Types.ObjectId, ref: 'Reply' },
    latestReplySource: { type: String },
    // Legacy fields — optional, preserved for existing archived records
    originalStatus: { type: String },
    finalStatus: { type: String },
    lastContactedAt: { type: Date },
    followUpCount: { type: Number, default: 0 },
    campaignId: { type: Schema.Types.ObjectId, ref: 'Campaign' },
    reason: { type: String },
    archivedAt: { type: Date },
  },
  { timestamps: true }
);

NoReplyLeadSchema.index({ leadId: 1 });
NoReplyLeadSchema.index({ email: 1 }, { sparse: true });
NoReplyLeadSchema.index({ status: 1 });
NoReplyLeadSchema.index({ isActive: 1 });
NoReplyLeadSchema.index({ isActive: 1, status: 1 });
NoReplyLeadSchema.index({ status: 1, lastSentAt: -1 });
NoReplyLeadSchema.index({ lastSentAt: -1 }, { sparse: true });
NoReplyLeadSchema.index({ removedFromNoReplyAt: -1 }, { sparse: true });
NoReplyLeadSchema.index({ archivedAt: -1 });
NoReplyLeadSchema.index({ country: 1 });
NoReplyLeadSchema.index({ campaignIds: 1 }, { sparse: true });
NoReplyLeadSchema.index({ createdAt: -1 });

const NoReplyLead: Model<INoReplyLead> =
  mongoose.models.NoReplyLead || mongoose.model<INoReplyLead>('NoReplyLead', NoReplyLeadSchema);
export default NoReplyLead;
