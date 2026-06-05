import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface ICampaignLead extends Document {
  campaignId: Types.ObjectId;
  leadId: Types.ObjectId;
  status: 'active' | 'removed';
  addedAt: Date;
  lastReplyAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CampaignLeadSchema = new Schema<ICampaignLead>(
  {
    campaignId: { type: Schema.Types.ObjectId, ref: 'Campaign', required: true },
    leadId: { type: Schema.Types.ObjectId, ref: 'Lead', required: true },
    status: { type: String, enum: ['active', 'removed'], default: 'active' },
    addedAt: { type: Date, default: Date.now },
    lastReplyAt: { type: Date },
  },
  { timestamps: true }
);

CampaignLeadSchema.index({ campaignId: 1 });
CampaignLeadSchema.index({ leadId: 1 });
CampaignLeadSchema.index({ campaignId: 1, leadId: 1 }, { unique: true });

const CampaignLead: Model<ICampaignLead> =
  mongoose.models.CampaignLead ||
  mongoose.model<ICampaignLead>('CampaignLead', CampaignLeadSchema);
export default CampaignLead;
