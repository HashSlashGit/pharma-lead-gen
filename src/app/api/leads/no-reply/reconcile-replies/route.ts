export const dynamic = 'force-dynamic';

/**
 * POST /api/leads/no-reply/reconcile-replies
 *
 * Backfill: mark active NoReplyLead records inactive if a Reply already exists.
 * Safe to run multiple times — second run will remove 0 records.
 * Processes in batches of 100 to avoid memory pressure.
 */

import { NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { connectDB } from '@/lib/db/mongoose';
import NoReplyLead from '@/lib/models/NoReplyLead';
import Reply from '@/lib/models/Reply';

const BATCH_SIZE = 100;

interface NoReplySlim {
  _id: Types.ObjectId;
  leadId: Types.ObjectId;
  email?: string;
}

export async function POST(): Promise<NextResponse> {
  try {
    await connectDB();

    let checked = 0;
    let removed = 0;
    let skipped = 0;
    const errors: string[] = [];
    const now = new Date();

    // Stream active NoReplyLead records via cursor to avoid loading all into memory
    const cursor = NoReplyLead.find(
      { isActive: { $ne: false }, status: 'active' },
      { _id: 1, leadId: 1, email: 1 }
    )
      .lean<NoReplySlim>()
      .cursor();

    let batch: NoReplySlim[] = [];

    const processBatch = async (records: NoReplySlim[]) => {
      const leadIds = records.map((r) => r.leadId).filter(Boolean);

      // Single query: find which leadIds have at least one Reply
      const repliesFound = (await Reply.find(
        { leadId: { $in: leadIds } },
        { leadId: 1 }
      ).lean()) as { leadId: Types.ObjectId }[];

      const leadIdsWithReplies = new Set(repliesFound.map((r) => String(r.leadId)));

      for (const record of records) {
        checked++;
        if (!leadIdsWithReplies.has(String(record.leadId))) {
          skipped++;
          continue;
        }

        try {
          await NoReplyLead.updateOne(
            { _id: record._id },
            {
              $set: {
                isActive: false,
                status: 'resolved',
                removedFromNoReplyAt: now,
                removedFromNoReplyReason: 'replied',
              },
            }
          );
          removed++;
        } catch (err) {
          errors.push(`Record ${String(record._id)}: ${String(err)}`);
        }
      }
    };

    for await (const record of cursor) {
      batch.push(record);
      if (batch.length >= BATCH_SIZE) {
        await processBatch(batch);
        batch = [];
      }
    }
    if (batch.length > 0) {
      await processBatch(batch);
    }

    console.log(`[reconcile-replies] complete — checked:${checked} removed:${removed} skipped:${skipped}`);

    return NextResponse.json({ success: true, checked, removed, skipped, errors });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[reconcile-replies] failed:', msg);
    return NextResponse.json(
      { success: false, error: 'Reconcile failed', details: msg },
      { status: 500 }
    );
  }
}
