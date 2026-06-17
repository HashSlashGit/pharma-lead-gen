import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface ICampaign extends Document {
  name: string;
  targetCountry?: string;
  targetCategory?: string;
  status: 'draft' | 'active' | 'paused' | 'completed';
  emailsSent: number;
  replies: number;
  assignedInboxId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CampaignSchema = new Schema<ICampaign>(
  {
    name: { type: String, required: true, trim: true },
    targetCountry: { type: String, trim: true },
    targetCategory: { type: String, trim: true },
    status: {
      type: String,
      enum: ['draft', 'active', 'paused', 'completed'],
      default: 'draft',
    },
    emailsSent: { type: Number, default: 0 },
    replies:    { type: Number, default: 0 },
    assignedInboxId: { type: Schema.Types.ObjectId, ref: 'InboxAccount' },
  },
  { timestamps: true }
);

CampaignSchema.index({ status: 1 });
CampaignSchema.index({ createdAt: -1 });

const Campaign: Model<ICampaign> = mongoose.models.Campaign || mongoose.model<ICampaign>('Campaign', CampaignSchema);
export default Campaign;
