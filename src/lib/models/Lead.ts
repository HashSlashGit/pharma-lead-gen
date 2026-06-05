import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ILead extends Document {
  companyName: string;
  country: string;
  city?: string;
  category: string;
  email?: string;
  phone?: string;
  website?: string;
  source?: string;
  status: 'new' | 'qualified' | 'needs_review' | 'low_priority' | 'contacted' | 'warm' | 'cold' | 'rejected' | 'no_response' | 'do_not_contact';
  score: number;
  aiProcessed: boolean;
  lastContactedAt?: Date;
  followUpCount: number;
  nextFollowUpAt?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const LeadSchema = new Schema<ILead>(
  {
    companyName: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true },
    city: { type: String, trim: true },
    category: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    website: { type: String, trim: true },
    source: { type: String, trim: true },
    status: {
      type: String,
      enum: ['new', 'qualified', 'needs_review', 'low_priority', 'contacted', 'warm', 'cold', 'rejected', 'no_response', 'do_not_contact'],
      default: 'new',
    },
    score: { type: Number, default: 0 },
    aiProcessed: { type: Boolean, default: false },
    lastContactedAt: { type: Date },
    followUpCount: { type: Number, default: 0 },
    nextFollowUpAt: { type: Date },
    notes: { type: String },
  },
  { timestamps: true }
);

LeadSchema.index({ email: 1 }, { sparse: true });
LeadSchema.index({ status: 1 });
LeadSchema.index({ country: 1 });
LeadSchema.index({ score: -1 });
LeadSchema.index({ source: 1 }, { sparse: true });
LeadSchema.index({ createdAt: -1 });
LeadSchema.index({ nextFollowUpAt: 1 }, { sparse: true });

const Lead: Model<ILead> = mongoose.models.Lead || mongoose.model<ILead>('Lead', LeadSchema);
export default Lead;
