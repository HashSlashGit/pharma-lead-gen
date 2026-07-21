import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongoose';
import Lead from '@/lib/models/Lead';
import { writeAuditLog } from '@/lib/utils/auditLog';
import { getRequestActor, type Actor } from '@/lib/utils/requestActor';
import { cascadeDeleteLeads } from '@/lib/services/leadCascadeDelete';
import mongoose from 'mongoose';

type BulkAction = 'archive' | 'restore' | 'delete' | 'add-tags' | 'remove-tags' | 'change-status';

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const body = await req.json();
    const { action, ids, tags, status, confirm } = body as {
      action: BulkAction;
      ids: string[];
      tags?: string[];
      status?: string;
      confirm?: string;
    };

    if (!action) return NextResponse.json({ error: 'action is required' }, { status: 400 });
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids array is required and must not be empty' }, { status: 400 });
    }

    // Validate all IDs
    const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length === 0) {
      return NextResponse.json({ error: 'No valid IDs provided' }, { status: 400 });
    }

    const actor: Actor = await getRequestActor(req);

    let result: { matched: number; modified: number } = { matched: 0, modified: 0 };

    switch (action) {
      case 'archive': {
        const res = await Lead.updateMany(
          { _id: { $in: validIds } },
          { $set: { archived: true } }
        );
        result = { matched: res.matchedCount, modified: res.modifiedCount };
        void writeAuditLog({
          action: 'leads_archived',
          actorId: actor?.actorId,
          meta: { count: result.modified, ids: validIds.slice(0, 20) },
        });
        break;
      }

      case 'restore': {
        const res = await Lead.updateMany(
          { _id: { $in: validIds } },
          { $set: { archived: false } }
        );
        result = { matched: res.matchedCount, modified: res.modifiedCount };
        void writeAuditLog({
          action: 'leads_restored',
          actorId: actor?.actorId,
          meta: { count: result.modified },
        });
        break;
      }

      case 'delete': {
        if (confirm !== 'CONFIRM_DELETE') {
          return NextResponse.json(
            { error: 'Confirmation required. Send confirm: "CONFIRM_DELETE"' },
            { status: 400 }
          );
        }
        const res = await cascadeDeleteLeads({ _id: { $in: validIds } });
        result = { matched: res.leadsDeleted, modified: res.leadsDeleted };
        void writeAuditLog({
          action: 'leads_deleted',
          actorId: actor?.actorId,
          meta: { count: result.modified, ids: validIds.slice(0, 20), repliesDeleted: res.repliesDeleted, emailLogsDeleted: res.emailLogsDeleted },
        });
        break;
      }

      case 'add-tags': {
        if (!Array.isArray(tags) || tags.length === 0) {
          return NextResponse.json({ error: 'tags array is required for add-tags action' }, { status: 400 });
        }
        const cleanTags = tags.map((t) => String(t).trim()).filter(Boolean);
        const res = await Lead.updateMany(
          { _id: { $in: validIds } },
          { $addToSet: { tags: { $each: cleanTags } } }
        );
        result = { matched: res.matchedCount, modified: res.modifiedCount };
        void writeAuditLog({
          action: 'leads_tags_updated',
          actorId: actor?.actorId,
          meta: { count: result.modified, tags: cleanTags, op: 'add' },
        });
        break;
      }

      case 'remove-tags': {
        if (!Array.isArray(tags) || tags.length === 0) {
          return NextResponse.json({ error: 'tags array is required for remove-tags action' }, { status: 400 });
        }
        const res = await Lead.updateMany(
          { _id: { $in: validIds } },
          { $pull: { tags: { $in: tags } } }
        );
        result = { matched: res.matchedCount, modified: res.modifiedCount };
        void writeAuditLog({
          action: 'leads_tags_updated',
          actorId: actor?.actorId,
          meta: { count: result.modified, tags, op: 'remove' },
        });
        break;
      }

      case 'change-status': {
        const allowed = ['new', 'qualified', 'needs_review', 'low_priority', 'contacted', 'warm', 'cold', 'rejected', 'no_response', 'do_not_contact'];
        if (!status || !allowed.includes(status)) {
          return NextResponse.json({ error: 'Valid status is required for change-status action' }, { status: 400 });
        }
        const res = await Lead.updateMany(
          { _id: { $in: validIds } },
          { $set: { status } }
        );
        result = { matched: res.matchedCount, modified: res.modifiedCount };
        break;
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error('[POST /api/leads/bulk-action]', err);
    return NextResponse.json({ error: 'Bulk action failed' }, { status: 500 });
  }
}
