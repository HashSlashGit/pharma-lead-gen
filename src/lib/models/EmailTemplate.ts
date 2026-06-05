import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IEmailTemplate extends Document {
  name: string;
  type: 'initial' | 'follow_up' | 'warm_reply' | 'cold_reply' | 'pricing' | 'custom';
  subject: string;
  body: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const EmailTemplateSchema = new Schema<IEmailTemplate>(
  {
    name: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ['initial', 'follow_up', 'warm_reply', 'cold_reply', 'pricing', 'custom'],
      required: true,
    },
    subject: { type: String, required: true, trim: true },
    body: { type: String, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const EmailTemplate: Model<IEmailTemplate> =
  mongoose.models.EmailTemplate ||
  mongoose.model<IEmailTemplate>('EmailTemplate', EmailTemplateSchema);
export default EmailTemplate;
