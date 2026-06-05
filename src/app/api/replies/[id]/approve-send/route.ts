import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongoose';
import Reply, { type IReply } from '@/lib/models/Reply';
import EmailLog, { type IEmailLog } from '@/lib/models/EmailLog';
import Lead, { type ILead } from '@/lib/models/Lead';
import mongoose from 'mongoose';
import { sendCustomEmailViaSmartlead } from '@/lib/services/smartlead';
import { formatEmailBodyAsHtml } from '@/lib/utils/emailFormatting';

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

    const reply = await Reply.findById(id).lean<IReply>();
    if (!reply) {
      return NextResponse.json({ error: 'Reply not found' }, { status: 404 });
    }

    // ── Guard: must have a draft to approve ──────────────────────────
    if (!reply.draftEmailLogId) {
      return NextResponse.json({ error: 'No draft exists — generate a draft first' }, { status: 422 });
    }

    // ── Guard: already approved ───────────────────────────────────────
    if (reply.status === 'draft_approved') {
      return NextResponse.json({ error: 'Draft already approved and sent' }, { status: 409 });
    }

    const [draftLog, lead] = await Promise.all([
      EmailLog.findById(reply.draftEmailLogId).lean<IEmailLog>(),
      Lead.findById(reply.leadId).lean<ILead>(),
    ]);

    if (!draftLog) {
      return NextResponse.json({ error: 'Draft email log not found' }, { status: 404 });
    }
    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }
    if (!lead.email) {
      return NextResponse.json({ error: 'Lead has no email address' }, { status: 422 });
    }

    // ── Guard: already sent ───────────────────────────────────────────
    if (draftLog.status === 'sent' || draftLog.status === 'ready_to_send_test') {
      return NextResponse.json({ error: 'Draft already sent' }, { status: 409 });
    }

    // ── Dispatch via Smartlead (human-triggered — this IS the approval) ──
    // Uses custom email send (not campaign re-queue) so the actual draft body reaches the lead.
    // The lead is already in the campaign; re-adding would return upload_count=0 (duplicate).
    const result = await sendCustomEmailViaSmartlead({
      leadEmail: lead.email,
      companyName: lead.companyName,
      phone: lead.phone,
      website: lead.website,
      emailSubject: draftLog.subject,
      emailBody: formatEmailBodyAsHtml(draftLog.body),
    });

    const now = new Date();
    const newEmailStatus =
      result.status === 'sent' ? 'sent'
      : result.status === 'ready_to_send_test' ? 'ready_to_send_test'
      : 'failed';

    const TERMINAL_STATUSES = new Set(['warm', 'cold', 'rejected', 'no_response']);
    const newLeadStatus = TERMINAL_STATUSES.has(lead.status) ? lead.status : 'warm';

    await Promise.all([
      EmailLog.findByIdAndUpdate(reply.draftEmailLogId, {
        status: newEmailStatus,
        ...(newEmailStatus === 'sent' ? { sentAt: now } : {}),
      }),
      Reply.findByIdAndUpdate(id, {
        status: 'draft_approved',
        approvedAt: now,
        needsApproval: false,
      }),
      Lead.findByIdAndUpdate(reply.leadId, {
        $set: { status: newLeadStatus, lastContactedAt: now },
      }),
    ]);

    return NextResponse.json({
      success: result.success,
      mode: result.mode,
      status: newEmailStatus,
      message: result.message,
    });
  } catch (err) {
    console.error('[POST /api/replies/[id]/approve-send]', err);
    return NextResponse.json({ error: 'Approval failed' }, { status: 500 });
  }
}
