import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongoose';
import EmailLog from '@/lib/models/EmailLog';
import Lead from '@/lib/models/Lead';
import mongoose from 'mongoose';
import { sendCustomEmailViaGmail } from '@/lib/services/gmailSender';
import { sendEmailViaGmail } from '@/lib/services/gmailCampaignSender';
import { FOLLOWUP_GAPS_DAYS, MAX_FOLLOWUPS } from '@/lib/utils/followupScheduler';
import { formatEmailBodyAsHtml } from '@/lib/utils/emailFormatting';
import { markLeadWaitingForReply } from '@/lib/utils/noReplySync';

const BLOCKED_STATUSES = new Set([
  'do_not_contact',
  'no_response',
  'rejected',
]);

function calcNextFollowUpAt(currentFollowUpCount: number): Date | null {
  const newCount = currentFollowUpCount + 1;
  if (newCount >= MAX_FOLLOWUPS) return null;
  const gap = FOLLOWUP_GAPS_DAYS[newCount] ?? 1;
  const d = new Date();
  d.setDate(d.getDate() + gap);
  return d;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const reqBody = await req.json().catch(() => ({}));
    const sendMode: 'campaign' | 'custom' =
      reqBody.sendMode === 'custom' ? 'custom' : 'campaign';

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid email log ID' }, { status: 400 });
    }

    await connectDB();

    const emailLog = await EmailLog.findById(id).lean();
    if (!emailLog) {
      return NextResponse.json({ error: 'Email log not found' }, { status: 404 });
    }

    if (emailLog.status === 'sent') {
      return NextResponse.json({ error: 'Email already sent' }, { status: 409 });
    }

    if (!emailLog.subject) {
      return NextResponse.json(
        { success: false, error: 'Email subject is missing from the draft' },
        { status: 400 }
      );
    }
    if (!emailLog.body) {
      return NextResponse.json(
        { success: false, error: 'Email body is missing from the draft' },
        { status: 400 }
      );
    }

    const lead = await Lead.findById(emailLog.leadId).lean();
    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }
    if (!lead.email) {
      return NextResponse.json({ error: 'Lead email address not found' }, { status: 404 });
    }

    if (BLOCKED_STATUSES.has(lead.status)) {
      return NextResponse.json(
        { error: `Cannot send to this lead — status is "${lead.status}"` },
        { status: 422 }
      );
    }

    // For follow-ups, find the original sent email to reuse the same mailbox
    let preferredMailboxId: string | undefined;
    if (emailLog.type === 'follow_up' && emailLog.campaignId) {
      const originalLog = await EmailLog.findOne({
        leadId:     emailLog.leadId,
        campaignId: emailLog.campaignId,
        type:       'initial',
        status:     'sent',
      })
        .sort({ sentAt: -1 })
        .select('mailboxId')
        .lean();
      preferredMailboxId = originalLog?.mailboxId?.toString();
    }

    const campaignId = emailLog.campaignId?.toString();

    const emailParams = {
      leadEmail:    lead.email,
      companyName:  lead.companyName,
      phone:        lead.phone,
      website:      lead.website,
      emailSubject: emailLog.subject,
      emailBody:    formatEmailBodyAsHtml(emailLog.body),
      campaignId,
    };

    const result =
      sendMode === 'custom'
        ? await sendCustomEmailViaGmail({ ...emailParams, preferredMailboxId })
        : await sendEmailViaGmail({ ...emailParams, preferredMailboxId });

    const now = new Date();
    const isFollowUp = emailLog.type === 'follow_up';

    if (result.status === 'sent') {
      const sentUpdate: Record<string, unknown> = {
        status:    'sent',
        sentAt:    now,
        sendMode,
        leadEmail: lead.email,
      };

      if (result.data != null) {
        const dataObj = result.data as Record<string, unknown>;
        if (dataObj['messageId']) sentUpdate['gmailMessageId'] = String(dataObj['messageId']);
        if (dataObj['threadId'])  sentUpdate['gmailThreadId']  = String(dataObj['threadId']);
        if (dataObj['mailboxId']) sentUpdate['mailboxId']       = new mongoose.Types.ObjectId(String(dataObj['mailboxId']));
      }

      await EmailLog.findByIdAndUpdate(id, sentUpdate);

      const leadUpdate: Record<string, unknown> = {
        lastContactedAt: now,
        status: 'contacted',
      };
      if (isFollowUp) {
        leadUpdate.$inc = { followUpCount: 1 };
        leadUpdate.nextFollowUpAt = calcNextFollowUpAt(lead.followUpCount);
      } else {
        const nextDate = new Date();
        nextDate.setDate(nextDate.getDate() + FOLLOWUP_GAPS_DAYS[0]);
        leadUpdate.nextFollowUpAt = nextDate;
      }

      await Lead.findByIdAndUpdate(emailLog.leadId, leadUpdate);

      await markLeadWaitingForReply({
        leadId:     emailLog.leadId,
        emailLogId: emailLog._id as mongoose.Types.ObjectId,
        sentAt:     now,
      });

      return NextResponse.json({
        success: true,
        mode: result.mode,
        sendMode,
        status: 'sent',
        message: result.message,
      });
    }

    if (result.status === 'ready_to_send_test') {
      await EmailLog.findByIdAndUpdate(id, {
        status:    'ready_to_send_test',
        sendMode,
        leadEmail: lead.email,
      });

      const leadUpdate: Record<string, unknown> = { lastContactedAt: now };
      if (isFollowUp) {
        leadUpdate.$inc = { followUpCount: 1 };
        leadUpdate.nextFollowUpAt = calcNextFollowUpAt(lead.followUpCount);
      } else {
        const nextDate = new Date();
        nextDate.setDate(nextDate.getDate() + FOLLOWUP_GAPS_DAYS[0]);
        leadUpdate.nextFollowUpAt = nextDate;
      }
      await Lead.findByIdAndUpdate(emailLog.leadId, leadUpdate);

      await markLeadWaitingForReply({
        leadId:     emailLog.leadId,
        emailLogId: id,
        sentAt:     new Date(),
      });

      return NextResponse.json({
        success: true,
        mode: result.mode,
        sendMode,
        status: 'ready_to_send_test',
        message: result.message,
        preview: result.preview,
      });
    }

    console.error('[send] Gmail send rejected:', result.message);
    await EmailLog.findByIdAndUpdate(id, { status: 'failed' });

    return NextResponse.json(
      {
        success: false,
        mode: result.mode,
        sendMode,
        status: 'failed',
        message: result.message,
        rawResponse: result.rawResponse,
      },
      { status: 502 }
    );
  } catch (err) {
    console.error('[POST /api/email-logs/[id]/send]', err);
    return NextResponse.json(
      {
        success: false,
        mode: 'live',
        status: 'failed',
        message: 'Failed to process send request',
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
