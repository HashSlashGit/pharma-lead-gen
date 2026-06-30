import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongoose';
import Lead, { type ILead } from '@/lib/models/Lead';
import { writeAuditLog } from '@/lib/utils/auditLog';
import { getRequestActor } from '@/lib/utils/requestActor';
import { PROVIDER_EMAIL_FILTER } from '@/lib/utils/emailProvider';
import mongoose from 'mongoose';

type LeadStatus = ILead['status'];
const USED_STATUSES: LeadStatus[] = ['contacted', 'no_response', 'cold', 'rejected', 'do_not_contact'];

type CleanupOp =
  | 'archive-used'
  | 'delete-no-email'
  | 'delete-archived'
  | 'delete-by-provider'
  | 'delete-gmail'
  | 'delete-yahoo'
  | 'delete-outlook'
  | 'delete-hotmail'
  | 'delete-aol'
  | 'remove-duplicates'
  | 'clear-all';

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const body = await req.json();
    const { operation, confirm, provider } = body as {
      operation: CleanupOp;
      confirm?: string;
      provider?: string;
    };

    if (!operation) {
      return NextResponse.json({ error: 'operation is required' }, { status: 400 });
    }

    const actor = await getRequestActor(req);
    let affected = 0;

    switch (operation) {
      case 'archive-used': {
        const res = await Lead.updateMany(
          { archived: { $ne: true }, status: { $in: USED_STATUSES } },
          { $set: { archived: true } }
        );
        affected = res.modifiedCount;
        void writeAuditLog({
          action: 'leads_archived',
          actorId: actor.actorId,
          meta: { operation, count: affected, note: 'archive-used cleanup' },
        });
        break;
      }

      case 'delete-no-email': {
        if (confirm !== 'CONFIRM_DELETE') {
          return NextResponse.json({ error: 'Send confirm: "CONFIRM_DELETE"' }, { status: 400 });
        }
        const res = await Lead.deleteMany({
          $or: [{ email: { $exists: false } }, { email: { $in: ['', null] } }],
        });
        affected = res.deletedCount;
        void writeAuditLog({
          action: 'leads_deleted',
          actorId: actor.actorId,
          meta: { operation, count: affected, note: 'no-email cleanup' },
        });
        break;
      }

      case 'delete-archived': {
        if (confirm !== 'CONFIRM_DELETE') {
          return NextResponse.json({ error: 'Send confirm: "CONFIRM_DELETE"' }, { status: 400 });
        }
        const res = await Lead.deleteMany({ archived: true });
        affected = res.deletedCount;
        void writeAuditLog({
          action: 'leads_deleted',
          actorId: actor.actorId,
          meta: { operation, count: affected, note: 'delete-archived cleanup' },
        });
        break;
      }

      case 'delete-by-provider':
      case 'delete-gmail':
      case 'delete-yahoo':
      case 'delete-outlook':
      case 'delete-hotmail':
      case 'delete-aol': {
        if (confirm !== 'CONFIRM_DELETE') {
          return NextResponse.json({ error: 'Send confirm: "CONFIRM_DELETE"' }, { status: 400 });
        }
        const resolvedProvider = provider ?? operation.replace('delete-', '');
        const emailFilter = PROVIDER_EMAIL_FILTER[resolvedProvider];
        if (!emailFilter) {
          return NextResponse.json({ error: `Unknown provider: ${resolvedProvider}` }, { status: 400 });
        }
        const res = await Lead.deleteMany({ email: emailFilter });
        affected = res.deletedCount;
        void writeAuditLog({
          action: 'leads_deleted',
          actorId: actor.actorId,
          meta: { operation, provider: resolvedProvider, count: affected },
        });
        break;
      }

      case 'remove-duplicates': {
        const dupGroups = await Lead.aggregate<{
          _id: string;
          ids: mongoose.Types.ObjectId[];
          scores: number[];
          count: number;
        }>([
          { $match: { email: { $exists: true, $nin: ['', null] } } },
          {
            $group: {
              _id: '$email',
              ids: { $push: '$_id' },
              scores: { $push: '$score' },
              count: { $sum: 1 },
            },
          },
          { $match: { count: { $gt: 1 } } },
        ]);

        const toArchive: mongoose.Types.ObjectId[] = [];
        for (const group of dupGroups) {
          let bestIdx = 0;
          for (let i = 1; i < group.scores.length; i++) {
            if (group.scores[i] > group.scores[bestIdx]) bestIdx = i;
          }
          group.ids.forEach((id, i) => {
            if (i !== bestIdx) toArchive.push(id);
          });
        }

        if (toArchive.length > 0) {
          const res = await Lead.updateMany(
            { _id: { $in: toArchive } },
            { $set: { archived: true } }
          );
          affected = res.modifiedCount;
        }

        void writeAuditLog({
          action: 'leads_duplicates_removed',
          actorId: actor.actorId,
          meta: { operation, count: affected, groups: dupGroups.length },
        });
        break;
      }

      case 'clear-all': {
        if (confirm !== 'DELETE ALL LEADS') {
          return NextResponse.json(
            { error: 'Type "DELETE ALL LEADS" to confirm this dangerous operation' },
            { status: 400 }
          );
        }
        const res = await Lead.deleteMany({});
        affected = res.deletedCount;
        void writeAuditLog({
          action: 'leads_deleted',
          actorId: actor.actorId,
          meta: { operation: 'clear-all', count: affected },
        });
        break;
      }

      default:
        return NextResponse.json({ error: `Unknown operation: ${operation}` }, { status: 400 });
    }

    return NextResponse.json({ success: true, affected });
  } catch (err) {
    console.error('[POST /api/leads/cleanup/run]', err);
    return NextResponse.json({ error: 'Cleanup operation failed' }, { status: 500 });
  }
}
