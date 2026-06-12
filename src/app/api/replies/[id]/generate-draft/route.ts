import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongoose';
import Reply from '@/lib/models/Reply';
import EmailLog from '@/lib/models/EmailLog';
import Product from '@/lib/models/Product';
import { type ILead } from '@/lib/models/Lead';
import mongoose from 'mongoose';
import { draftReplyEmail } from '@/lib/services/claude';
import { getSettings } from '@/lib/services/settingsCache';

// Classifications allowed to receive an AI draft reply
const ALLOWED_CLASSIFICATIONS = new Set([
  'interested',
  'pricing_query',
  'certificate_query',
  'shipping_query',
  'unclassified',
]);

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid reply ID' }, { status: 400 });
    }

    const settings = await getSettings();
    if (!settings.claudeApiKey) {
      return NextResponse.json(
        { error: 'Claude AI is not configured. Add your Claude API key in Settings.' },
        { status: 503 },
      );
    }

    await connectDB();

    const reply = await Reply.findById(id)
      .populate<{ leadId: ILead }>('leadId', 'companyName email country category score aiProcessed')
      .lean();

    if (!reply) {
      return NextResponse.json({ error: 'Reply not found' }, { status: 404 });
    }

    const lead = reply.leadId as ILead;
    const leadId = (lead._id as mongoose.Types.ObjectId).toString();

    const classification = reply.classification ?? 'unclassified';
    if (!ALLOWED_CLASSIFICATIONS.has(classification)) {
      return NextResponse.json(
        { error: `AI drafts not allowed for classification: "${classification}"` },
        { status: 422 },
      );
    }

    if (!lead.email) {
      return NextResponse.json({ error: 'Lead has no email address' }, { status: 422 });
    }

    if (reply.status === 'draft_approved') {
      return NextResponse.json({ error: 'Draft already approved and sent' }, { status: 409 });
    }

    const firstProduct = await Product.findOne()
      .select('name description')
      .lean<{ name: string; description?: string }>();
    const productContext = firstProduct
      ? `${firstProduct.name}: ${firstProduct.description ?? ''}`
      : undefined;

    const draftBody = await draftReplyEmail({
      leadId,
      replyBody: reply.body,
      classification,
      companyName: lead.companyName,
      country: lead.country,
      category: lead.category ?? '',
      productContext,
    });

    const subject = `Re: Our conversation — ${lead.companyName}`;
    const draftLog = await EmailLog.create({
      leadId: lead._id,
      replyId: reply._id,
      type: 'reply',
      subject,
      body: draftBody,
      status: 'pending',
    });

    await Reply.findByIdAndUpdate(id, {
      status: 'draft_generated',
      aiDraftGenerated: true,
      draftEmailLogId: draftLog._id,
      needsApproval: true,
    });

    return NextResponse.json({
      success: true,
      draftLogId: draftLog._id,
      subject,
      body: draftBody,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Draft generation failed';
    console.error('[POST /api/replies/[id]/generate-draft]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
