import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface IClaudeUsageLog extends Document {
  actionType: 'personalized_email' | 'analyze_reply' | 'draft_response' | 'summarize_website' | 'product_fit';
  leadId?: Types.ObjectId;
  promptTokens: number;
  completionTokens: number;
  estimatedCost: number;
  createdAt: Date;
}

const ClaudeUsageLogSchema = new Schema<IClaudeUsageLog>(
  {
    actionType: {
      type: String,
      enum: ['personalized_email', 'analyze_reply', 'draft_response', 'summarize_website', 'product_fit'],
      required: true,
    },
    leadId: { type: Schema.Types.ObjectId, ref: 'Lead' },
    promptTokens: { type: Number, required: true },
    completionTokens: { type: Number, required: true },
    estimatedCost: { type: Number, required: true },
  },
  { timestamps: true }
);

const ClaudeUsageLog: Model<IClaudeUsageLog> =
  mongoose.models.ClaudeUsageLog || mongoose.model<IClaudeUsageLog>('ClaudeUsageLog', ClaudeUsageLogSchema);
export default ClaudeUsageLog;
