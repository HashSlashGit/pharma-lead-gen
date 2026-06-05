import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongoose';
import Reply from '@/lib/models/Reply';
import EmailLog from '@/lib/models/EmailLog';
import { type ILead } from '@/lib/models/Lead';
import mongoose from 'mongoose';

type TimelineItem = {
  id: string;
  type: 'sent_email' | 'inbound_reply' | 'ai_draft' | 'system';
  direction: 'outbound' | 'inbound' | 'internal';
  subject?: string;
  body: string;
  status?: string;
  classification?: string;
  createdAt: string;
  source?: string;
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid reply ID' }, { status: 400 });
    }

    await connectDB();

    const reply = await Reply.findById(id)
      .populate<{ leadId: ILead }>(
        'leadId',
        'companyName email country status score category phone website aiProcessed followUpCount'
      )
      .lean();

    if (!reply) {
      return NextResponse.json({ error: 'Reply not found' }, { status: 404 });
    }

    const lead = reply.leadId as ILead;
    const leadId = (lead._id as mongoose.Types.ObjectId).toString();

    // Fetch ALL replies for this lead + ALL email logs (sorted ascending for timeline)
    const [allLeadReplies, allEmailLogs] = await Promise.all([
      Reply.find({ leadId: lead._id }).sort({ createdAt: 1 }).lean(),
      EmailLog.find({ leadId: lead._id }).sort({ createdAt: 1 }).lean(),
    ]);

    // draftLog for the current reply (backward compat for UI)
    const draftLog = reply.draftEmailLogId
      ? (allEmailLogs.find((l) => String(l._id) === String(reply.draftEmailLogId)) ?? null)
      : null;

    // Collect all draft email log IDs across every reply for this lead
    const draftLogIds = new Set(
      allLeadReplies.filter((r) => r.draftEmailLogId).map((r) => String(r.draftEmailLogId))
    );

    // Build merged conversation timeline
    const timeline: TimelineItem[] = [];

    for (const log of allEmailLogs) {
      const isDraftLog = draftLogIds.has(String(log._id));
      const isUnsent = log.status === 'pending' || log.status === 'ready_to_send_test';
      const itemType: TimelineItem['type'] = isDraftLog && isUnsent ? 'ai_draft' : 'sent_email';
      const direction: TimelineItem['direction'] = isDraftLog && isUnsent ? 'internal' : 'outbound';
      timeline.push({
        id: String(log._id),
        type: itemType,
        direction,
        subject: log.subject,
        body: log.body,
        status: log.status,
        createdAt: ((log.sentAt ?? log.createdAt) as Date).toISOString(),
        source: log.sendMode ?? undefined,
      });
    }

    for (const r of allLeadReplies) {
      timeline.push({
        id: String(r._id),
        type: 'inbound_reply',
        direction: 'inbound',
        body: r.body,
        status: r.status,
        classification: r.classification,
        createdAt: ((r.receivedAt ?? r.createdAt) as Date).toISOString(),
        source: r.source,
      });
    }

    // Sort oldest → newest by effective timestamp
    timeline.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    console.log(`[Reply Detail] timeline built — items:${timeline.length} replies:${allLeadReplies.length} emails:${allEmailLogs.length} leadId:${leadId}`);

    // emailHistory kept newest-first for backward compat
    const emailHistory = [...allEmailLogs].reverse();

    // Flatten reply for client (leadId → lead)
    const replyObj = reply as unknown as Record<string, unknown>;
    const { leadId: _leadId, ...replyRest } = replyObj;
    void _leadId;

    return NextResponse.json({
      reply: { ...replyRest, leadId, lead },
      emailHistory,
      draftLog,
      allReplies: allLeadReplies,
      timeline,
    });
  } catch (err) {
    console.error('[GET /api/replies/[id]]', err);
    return NextResponse.json({ error: 'Failed to fetch reply' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid reply ID' }, { status: 400 });
    }

    const body = await req.json();
    const allowed = ['status', 'needsApproval'];
    const update: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) update[key] = body[key];
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    await connectDB();
    const reply = await Reply.findByIdAndUpdate(id, update, { new: true }).lean();
    if (!reply) {
      return NextResponse.json({ error: 'Reply not found' }, { status: 404 });
    }

    return NextResponse.json({ reply });
  } catch (err) {
    console.error('[PATCH /api/replies/[id]]', err);
    return NextResponse.json({ error: 'Failed to update reply' }, { status: 500 });
  }
}
