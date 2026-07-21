/**
 * One-time repair for Reply / EmailLog records left orphaned by Lead
 * deletions that predate the cascade-delete fix in
 * src/lib/services/leadCascadeDelete.ts.
 *
 * An orphaned record is a Reply or EmailLog whose `leadId` no longer
 * resolves to any Lead document. These can never be displayed (the reply
 * detail page 500s on them) and can never legitimately reappear once the
 * cascade-delete fix is deployed, so the only correct repair is deletion.
 *
 * Usage:
 *   npx tsx scripts/repair-orphaned-lead-refs.ts            # dry run — reports only, no writes
 *   npx tsx scripts/repair-orphaned-lead-refs.ts --apply     # actually deletes the orphaned records
 *   npx tsx scripts/repair-orphaned-lead-refs.ts --apply --limit=500   # cap how many are deleted per run
 *
 * Safe to re-run: a dry run never mutates data, and an --apply run only
 * ever deletes records that are still orphaned at the moment it queries.
 */

import dns from 'node:dns';
import mongoose from 'mongoose';
import Lead from '../src/lib/models/Lead';
import Reply from '../src/lib/models/Reply';
import EmailLog from '../src/lib/models/EmailLog';

// Best-effort local env load — production runs already have MONGODB_URI
// injected by the platform, so a missing .env.local here is not an error.
try {
  process.loadEnvFile('.env.local');
} catch {
  // no .env.local present — fall through to whatever is already in process.env
}

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI environment variable is not set.');
  process.exit(1);
}

// Mirrors src/lib/db/mongoose.ts — same Atlas SRV DNS fix, needed when
// running this script from a machine with flaky default DNS resolution.
if (MONGODB_URI.startsWith('mongodb+srv://')) {
  dns.setServers(['8.8.8.8', '1.1.1.1', '[2001:4860:4860::8888]', '[2606:4700:4700::1111]']);
  dns.setDefaultResultOrder('ipv4first');
}

const APPLY = process.argv.includes('--apply');
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? Number(limitArg.split('=')[1]) : undefined;

interface OrphanRecord {
  _id: mongoose.Types.ObjectId;
  leadId: mongoose.Types.ObjectId;
  createdAt?: Date;
}

async function findOrphans<T extends OrphanRecord>(
  model: mongoose.Model<any>,
  limit?: number
): Promise<T[]> {
  const pipeline: mongoose.PipelineStage[] = [
    {
      $lookup: {
        from: Lead.collection.name,
        localField: 'leadId',
        foreignField: '_id',
        as: '_lead',
      },
    },
    { $match: { _lead: { $size: 0 } } },
    { $project: { _lead: 0 } },
  ];
  if (limit) pipeline.push({ $limit: limit });
  return model.aggregate<T>(pipeline);
}

async function main() {
  await mongoose.connect(MONGODB_URI!, { bufferCommands: false });
  console.log(`[repair-orphaned-lead-refs] Connected. Mode: ${APPLY ? 'APPLY (will delete)' : 'DRY RUN (report only)'}${LIMIT ? `, limit=${LIMIT}` : ''}`);

  const orphanedReplies = await findOrphans<OrphanRecord>(Reply, LIMIT);
  const orphanedEmailLogs = await findOrphans<OrphanRecord>(EmailLog, LIMIT);

  console.log('\n── Orphaned Reply records ─────────────────────────────');
  console.log(`Found: ${orphanedReplies.length}`);
  for (const r of orphanedReplies.slice(0, 20)) {
    console.log(`  Reply ${r._id}  (dead leadId ${r.leadId})  createdAt=${r.createdAt?.toISOString() ?? 'n/a'}`);
  }
  if (orphanedReplies.length > 20) console.log(`  ...and ${orphanedReplies.length - 20} more`);

  console.log('\n── Orphaned EmailLog records ───────────────────────────');
  console.log(`Found: ${orphanedEmailLogs.length}`);
  for (const e of orphanedEmailLogs.slice(0, 20)) {
    console.log(`  EmailLog ${e._id}  (dead leadId ${e.leadId})  createdAt=${e.createdAt?.toISOString() ?? 'n/a'}`);
  }
  if (orphanedEmailLogs.length > 20) console.log(`  ...and ${orphanedEmailLogs.length - 20} more`);

  if (!APPLY) {
    console.log('\nDry run only — no records deleted. Re-run with --apply to delete the records listed above.');
    await mongoose.disconnect();
    return;
  }

  if (orphanedReplies.length > 0) {
    const ids = orphanedReplies.map((r) => r._id);
    const res = await Reply.deleteMany({ _id: { $in: ids } });
    console.log(`\nDeleted ${res.deletedCount} orphaned Reply record(s).`);
  }

  if (orphanedEmailLogs.length > 0) {
    const ids = orphanedEmailLogs.map((e) => e._id);
    const res = await EmailLog.deleteMany({ _id: { $in: ids } });
    console.log(`Deleted ${res.deletedCount} orphaned EmailLog record(s).`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('[repair-orphaned-lead-refs] Failed:', err);
  process.exitCode = 1;
});
