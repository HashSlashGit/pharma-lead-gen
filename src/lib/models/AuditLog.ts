import mongoose, { Schema, Document, Model } from 'mongoose';

export type AuditAction =
  | 'user_created'
  | 'user_deleted'
  | 'user_updated'
  | 'password_reset'
  | 'settings_changed'
  | 'lead_imported'
  | 'campaign_created'
  | 'bulk_email_sent';

export interface IAuditLog extends Document {
  action: AuditAction;
  /** User who performed the action (null for system actions) */
  actorId: string | null;
  actorEmail: string | null;
  /** Target resource (e.g. user id being deleted, campaign id) */
  targetId: string | null;
  targetLabel: string | null;
  /** Extra context — kept small, no secrets */
  meta: Record<string, unknown>;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    action:      { type: String, required: true },
    actorId:     { type: String, default: null },
    actorEmail:  { type: String, default: null },
    targetId:    { type: String, default: null },
    targetLabel: { type: String, default: null },
    meta:        { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AuditLogSchema.index({ action: 1, createdAt: -1 });
AuditLogSchema.index({ actorId: 1 });

const AuditLog: Model<IAuditLog> =
  mongoose.models.AuditLog || mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);

export default AuditLog;
