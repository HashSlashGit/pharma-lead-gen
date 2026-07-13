import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongoose';
import Reply from '@/lib/models/Reply';
import { type ILead } from '@/lib/models/Lead';
import mongoose from 'mongoose';
import {
  generateReplyDraft,
  MANUAL_DRAFT_CLASSIFICATIONS,
} from '@/lib/services/replyDraftService';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid reply ID' }, { status: 400 });
    }

    await connectDB();

    // Fetch reply for route-level guards (classification, status)
    const reply = await Reply.findById(id)
      .populate<{ leadId: ILead }>('leadId', 'companyName email country category score')
      .lean();

    if (!reply) {
      return NextResponse.json({ error: 'Reply not found' }, { status: 404 });
    }

    const classification = reply.classification ?? 'unclassified';
    if (!MANUAL_DRAFT_CLASSIFICATIONS.has(classification)) {
      return NextResponse.json(
        { error: `AI drafts not allowed for classification: "${classification}"` },
        { status: 422 },
      );
    }

    if (reply.status === 'draft_approved') {
      return NextResponse.json({ error: 'Draft already approved and sent' }, { status: 409 });
    }

    // Delegate generation to the shared service
    const result = await generateReplyDraft(id);

    if (result.skipReason === 'no_api_key') {
      return NextResponse.json(
        { error: 'Claude AI is not configured. Add your Claude API key in Settings.' },
        { status: 503 },
      );
    }

    if (result.skipReason === 'no_lead_email') {
      return NextResponse.json({ error: 'Lead has no email address' }, { status: 422 });
    }

    if (result.skipReason === 'already_drafted') {
      return NextResponse.json(
        { error: 'A draft already exists for this reply.' },
        { status: 409 },
      );
    }

    if (!result.success && !result.skipped) {
      return NextResponse.json(
        { error: result.error ?? 'Draft generation failed' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      draftLogId: result.draftLogId,
      subject: result.subject,
      body: result.body,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Draft generation failed';
    console.error('[POST /api/replies/[id]/generate-draft]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
