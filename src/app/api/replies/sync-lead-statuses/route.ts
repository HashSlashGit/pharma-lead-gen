/**
 * POST /api/replies/sync-lead-statuses
 *
 * Backfills Lead.status from existing Reply.classification values.
 * Processes replies oldest-first so the most recent reply wins.
 * Safe to call multiple times — idempotent per lead.
 *
 * Zero emails, zero Claude, zero Smartlead calls.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongoose';
import Reply from '@/lib/models/Reply';
import { syncLeadStatusFromReply } from '@/lib/services/syncLeadStatusFromReply';
import { removeNoReplyOnReply } from '@/lib/services/removeNoReplyOnReply';
import type { ReplyClassification } from '@/lib/services/reply-classifier';

export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest): Promise<NextResponse> {
  try {
    await connectDB();

    // Stream replies oldest-first via cursor so the most recent reply wins per lead.
    // Using a cursor avoids loading all classified replies into memory at once.
    const cursor = Reply.find(
      { classification: { $exists: true, $ne: null } },
      { leadId: 1, classification: 1, receivedAt: 1, createdAt: 1 }
    )
      .sort({ receivedAt: 1, createdAt: 1 })
      .lean()
      .cursor();

    let checked = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for await (const reply of cursor) {
      checked++;
      try {
        if (!reply.leadId) {
          console.log(`[reply-status-sync] skipped: reply ${String(reply._id)} has no leadId`);
          skipped++;
          continue;
        }

        await syncLeadStatusFromReply({
          leadId:         reply.leadId,
          classification: reply.classification as ReplyClassification,
          replyId:        reply._id as import('mongoose').Types.ObjectId,
          receivedAt:     reply.receivedAt ?? reply.createdAt,
        });
        await removeNoReplyOnReply({
          leadId:    reply.leadId,
          replyId:   reply._id as import('mongoose').Types.ObjectId,
          receivedAt: reply.receivedAt ?? reply.createdAt,
        });

        updated++;
      } catch (err) {
        skipped++;
        errors.push(`Reply ${String(reply._id)}: ${String(err)}`);
      }
    }

    console.log(`[reply-status-sync] backfill complete — checked:${checked} updated:${updated} skipped:${skipped}`);

    return NextResponse.json({ success: true, checked, updated, skipped, errors });
  } catch (err) {
    console.error('[POST /api/replies/sync-lead-statuses]', err);
    return NextResponse.json(
      { success: false, checked: 0, updated: 0, skipped: 0, errors: [String(err)] },
      { status: 500 }
    );
  }
}
