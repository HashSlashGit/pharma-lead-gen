import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface IEmailLog extends Document {
  leadId: Types.ObjectId;
  campaignId?: Types.ObjectId;
  replyId?: Types.ObjectId;
  type: 'initial' | 'follow_up' | 'reply';
  subject: string;
  body: string;
  status: 'pending' | 'ready_to_send_test' | 'sent' | 'failed' | 'opened' | 'clicked';
  sentAt?: Date;
  /** 'campaign' = added to Smartlead campaign sequence; 'custom' = direct single send */
  sendMode?: 'campaign' | 'custom';
  /** Lead email address at time of send (denormalized for reply sync lookups) */
  leadEmail?: string;
  /** trackId returned by Smartlead /send-email/initiate for custom sends */
  smartleadTrackId?: string;
  /** Raw Smartlead API response for custom sends (stored for diagnostics) */
  smartleadResponse?: unknown;
  createdAt: Date;
  updatedAt: Date;
}

const EmailLogSchema = new Schema<IEmailLog>(
  {
    leadId: { type: Schema.Types.ObjectId, ref: 'Lead', required: true },
    campaignId: { type: Schema.Types.ObjectId, ref: 'Campaign' },
    replyId: { type: Schema.Types.ObjectId, ref: 'Reply' },
    type: { type: String, enum: ['initial', 'follow_up', 'reply'], required: true },
    subject: { type: String, required: true },
    body: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'ready_to_send_test', 'sent', 'failed', 'opened', 'clicked'],
      default: 'pending',
    },
    sentAt: { type: Date },
    sendMode: { type: String, enum: ['campaign', 'custom'], trim: true },
    leadEmail: { type: String, trim: true, lowercase: true },
    smartleadTrackId: { type: String, trim: true },
    smartleadResponse: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

EmailLogSchema.index({ leadId: 1 });
EmailLogSchema.index({ replyId: 1 });
EmailLogSchema.index({ status: 1 });
EmailLogSchema.index({ type: 1, status: 1 });
EmailLogSchema.index({ sendMode: 1, status: 1 }, { sparse: true });
EmailLogSchema.index({ leadEmail: 1 }, { sparse: true });
EmailLogSchema.index({ smartleadTrackId: 1 }, { sparse: true });
EmailLogSchema.index({ sentAt: -1 }, { sparse: true });
EmailLogSchema.index({ createdAt: -1 });

const EmailLog: Model<IEmailLog> = mongoose.models.EmailLog || mongoose.model<IEmailLog>('EmailLog', EmailLogSchema);
export default EmailLog;
