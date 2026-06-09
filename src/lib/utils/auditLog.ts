import { connectDB } from '@/lib/db/mongoose';
import AuditLog, { type AuditAction } from '@/lib/models/AuditLog';

export interface AuditLogOptions {
  action: AuditAction;
  actorId?: string | null;
  actorEmail?: string | null;
  targetId?: string | null;
  targetLabel?: string | null;
  meta?: Record<string, unknown>;
}

/**
 * Fire-and-forget audit log write. Errors are logged but never thrown,
 * so a failed audit write never breaks the calling request.
 */
export async function writeAuditLog(opts: AuditLogOptions): Promise<void> {
  try {
    await connectDB();
    await AuditLog.create({
      action: opts.action,
      actorId: opts.actorId ?? null,
      actorEmail: opts.actorEmail ?? null,
      targetId: opts.targetId ?? null,
      targetLabel: opts.targetLabel ?? null,
      meta: opts.meta ?? {},
    });
  } catch (err) {
    console.error('[auditLog] write failed:', err instanceof Error ? err.message : String(err));
  }
}
