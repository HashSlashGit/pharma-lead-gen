import mongoose, { type QueryFilter } from 'mongoose';
import Lead, { type ILead } from '@/lib/models/Lead';
import Reply from '@/lib/models/Reply';
import EmailLog from '@/lib/models/EmailLog';

export interface CascadeDeleteResult {
  leadsDeleted: number;
  repliesDeleted: number;
  emailLogsDeleted: number;
}

const TRANSACTIONS_UNSUPPORTED = /Transaction numbers are only allowed on a replica set|does not support retryable writes|IllegalOperation/i;

/**
 * The driver wraps the real "not a replica set" error inside `originalError`
 * (and often re-wraps the message as a generic retryable-writes complaint),
 * so the useful text isn't always on `err.message` itself — walk the cause
 * chain rather than checking the top-level message alone.
 */
function isTransactionsUnsupportedError(err: unknown): boolean {
  const seen = new Set<unknown>();
  let cur: unknown = err;
  while (cur && typeof cur === 'object' && !seen.has(cur)) {
    seen.add(cur);
    const e = cur as { message?: unknown; code?: unknown; codeName?: unknown; originalError?: unknown };
    if (e.code === 20 || e.codeName === 'IllegalOperation') return true;
    if (typeof e.message === 'string' && TRANSACTIONS_UNSUPPORTED.test(e.message)) return true;
    cur = e.originalError;
  }
  return false;
}

/** `null` ids means "every lead" (used by the clear-all / no-filter case). */
async function runDeletes(
  ids: mongoose.Types.ObjectId[] | null,
  session?: mongoose.ClientSession
): Promise<CascadeDeleteResult> {
  // Order matters only in that Lead is deleted last, so a crash mid-way
  // never leaves a Lead gone while its Reply/EmailLog rows still reference it.
  const replyRes = await Reply.deleteMany(
    ids ? { leadId: { $in: ids } } : {},
    { session }
  );
  const emailRes = await EmailLog.deleteMany(
    ids ? { leadId: { $in: ids } } : {},
    { session }
  );
  const leadRes = await Lead.deleteMany(
    ids ? { _id: { $in: ids } } : {},
    { session }
  );
  return {
    leadsDeleted: leadRes.deletedCount ?? 0,
    repliesDeleted: replyRes.deletedCount ?? 0,
    emailLogsDeleted: emailRes.deletedCount ?? 0,
  };
}

/**
 * Deletes every Lead matching `filter` together with every Reply and
 * EmailLog that references it, so no orphaned Reply/EmailLog record can
 * ever be left behind by a Lead purge.
 *
 * Runs inside a multi-document transaction when the deployment topology
 * supports one (Atlas is always a replica set). Falls back to sequential,
 * non-atomic deletes when transactions aren't available (a standalone
 * mongod, as commonly used for local dev) — logging a warning so the gap
 * is visible rather than silently swallowed.
 */
export async function cascadeDeleteLeads(
  filter: QueryFilter<ILead>
): Promise<CascadeDeleteResult> {
  const matchAll = Object.keys(filter).length === 0;

  let ids: mongoose.Types.ObjectId[] | null = null;
  if (!matchAll) {
    const matched = await Lead.find(filter, { _id: 1 }).lean();
    ids = matched.map((l) => l._id as mongoose.Types.ObjectId);
    if (ids.length === 0) {
      return { leadsDeleted: 0, repliesDeleted: 0, emailLogsDeleted: 0 };
    }
  }

  const session = await mongoose.startSession();
  try {
    let result: CascadeDeleteResult | undefined;
    await session.withTransaction(async () => {
      result = await runDeletes(ids, session);
    });
    return result!;
  } catch (err) {
    if (!isTransactionsUnsupportedError(err)) throw err;

    console.warn(
      '[cascadeDeleteLeads] Transactions unsupported on this deployment (standalone mongod) — ' +
      'falling back to non-atomic sequential delete.'
    );
    return runDeletes(ids);
  } finally {
    await session.endSession();
  }
}
