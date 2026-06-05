import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface IWebhookEvent extends Document {
  provider: 'smartlead';
  eventType: string;
  payload: unknown;
  senderEmail?: string;
  recipientEmail?: string;
  messageId?: string;
  status: 'received' | 'processed' | 'failed' | 'duplicate';
  error?: string;
  processedReplyId?: Types.ObjectId;
  receivedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const WebhookEventSchema = new Schema<IWebhookEvent>(
  {
    provider:          { type: String, required: true, default: 'smartlead' },
    eventType:         { type: String, required: true },
    payload:           { type: Schema.Types.Mixed, required: true },
    senderEmail:       { type: String, trim: true, lowercase: true },
    recipientEmail:    { type: String, trim: true, lowercase: true },
    messageId:         { type: String, trim: true },
    status: {
      type: String,
      enum: ['received', 'processed', 'failed', 'duplicate'],
      default: 'received',
      required: true,
    },
    error:             { type: String },
    processedReplyId:  { type: Schema.Types.ObjectId, ref: 'Reply' },
    receivedAt:        { type: Date, default: Date.now, required: true },
  },
  { timestamps: true }
);

WebhookEventSchema.index({ provider: 1 });
WebhookEventSchema.index({ eventType: 1 });
WebhookEventSchema.index({ senderEmail: 1 });
WebhookEventSchema.index({ messageId: 1 }, { sparse: true });
WebhookEventSchema.index({ status: 1 });

const WebhookEvent: Model<IWebhookEvent> =
  mongoose.models.WebhookEvent ||
  mongoose.model<IWebhookEvent>('WebhookEvent', WebhookEventSchema);
export default WebhookEvent;
