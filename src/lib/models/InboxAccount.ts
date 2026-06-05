import mongoose, { Schema, Document, Model } from 'mongoose';

// TODO: Encrypt accessToken and refreshToken before production use.
// Storing raw OAuth tokens in MongoDB is acceptable for local/MVP testing.

export interface IInboxAccount extends Document {
  provider: 'gmail';
  email: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiry?: Date;
  lastSyncedAt?: Date;
  lastHistoryId?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const InboxAccountSchema = new Schema<IInboxAccount>(
  {
    provider:      { type: String, enum: ['gmail'], required: true, default: 'gmail' },
    email:         { type: String, required: true, trim: true, lowercase: true },
    accessToken:   { type: String, required: true },
    refreshToken:  { type: String, required: true },
    tokenExpiry:   { type: Date },
    lastSyncedAt:  { type: Date },
    lastHistoryId: { type: String, trim: true },
    isActive:      { type: Boolean, default: true },
  },
  { timestamps: true }
);

InboxAccountSchema.index({ provider: 1 });
InboxAccountSchema.index({ email: 1 }, { unique: true });
InboxAccountSchema.index({ isActive: 1 });

const InboxAccount: Model<IInboxAccount> =
  mongoose.models.InboxAccount ||
  mongoose.model<IInboxAccount>('InboxAccount', InboxAccountSchema);

export default InboxAccount;
