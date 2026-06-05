import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongoose';
import Reply, { type IReply } from '@/lib/models/Reply';
import EmailLog from '@/lib/models/EmailLog';
import mongoose from 'mongoose';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid reply ID' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const action: 'reject' | 'handle' = body.action === 'handle' ? 'handle' : 'reject';

    await connectDB();

    const reply = await Reply.findById(id).lean<IReply>();
    if (!reply) {
      return NextResponse.json({ error: 'Reply not found' }, { status: 404 });
    }

    const now = new Date();

    if (action === 'handle') {
      await Reply.findByIdAndUpdate(id, {
        status: 'handled',
        needsApproval: false,
        rejectedAt: now,
      });

      if (reply.draftEmailLogId) {
        await EmailLog.findByIdAndUpdate(reply.draftEmailLogId, { status: 'failed' });
      }

      return NextResponse.json({ success: true, status: 'handled' });
    }

    // action === 'reject'
    if (!reply.draftEmailLogId) {
      return NextResponse.json({ error: 'No draft to reject' }, { status: 422 });
    }

    await Promise.all([
      EmailLog.findByIdAndUpdate(reply.draftEmailLogId, { status: 'failed' }),
      Reply.findByIdAndUpdate(id, {
        status: 'draft_rejected',
        aiDraftGenerated: false,   // allow regeneration
        draftEmailLogId: undefined,
        rejectedAt: now,
        needsApproval: true,
      }),
    ]);

    return NextResponse.json({ success: true, status: 'draft_rejected' });
  } catch (err) {
    console.error('[POST /api/replies/[id]/reject-draft]', err);
    return NextResponse.json({ error: 'Rejection failed' }, { status: 500 });
  }
}
