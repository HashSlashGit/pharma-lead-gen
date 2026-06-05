import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongoose';
import EmailLog from '@/lib/models/EmailLog';
import Lead from '@/lib/models/Lead';
import mongoose from 'mongoose';
import { sendEmail, sendCustomEmailViaSmartlead } from '@/lib/services/smartlead';
import { FOLLOWUP_GAPS_DAYS, MAX_FOLLOWUPS } from '@/lib/utils/followupScheduler';
import { formatEmailBodyAsHtml } from '@/lib/utils/emailFormatting';
import { markLeadWaitingForReply } from '@/lib/utils/noReplySync';

// Statuses that should never receive an email
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

    console.log('[email-log send] request received', {
      emailLogId: id,
      sendMode,
      SMARTLEAD_DRY_RUN: process.env.SMARTLEAD_DRY_RUN,
    });

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid email log ID' }, { status: 400 });
    }

    await connectDB();

    const emailLog = await EmailLog.findById(id).lean();
    console.log('[email-log send] emailLog found:', !!emailLog);
    if (!emailLog) {
      return NextResponse.json({ error: 'Email log not found' }, { status: 404 });
    }

    // ── Guard: already sent ──────────────────────────────────────────
    if (emailLog.status === 'sent') {
      return NextResponse.json({ error: 'Email already sent' }, { status: 409 });
    }

    // ── Validate required fields ─────────────────────────────────────
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
    console.log('[email-log send] lead found:', !!lead, 'email exists:', !!lead?.email);
    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }
    if (!lead.email) {
      return NextResponse.json({ error: 'Lead email address not found' }, { status: 404 });
    }

    // ── Guard: blocked lead status ───────────────────────────────────
    if (BLOCKED_STATUSES.has(lead.status)) {
      return NextResponse.json(
        { error: `Cannot send to this lead — status is "${lead.status}"` },
        { status: 422 }
      );
    }

    console.log('[email-log send] pre-send check', {
      sendMode,
      subjectExists: !!emailLog.subject,
      bodyExists: !!emailLog.body,
      leadEmailExists: !!lead.email,
    });

    // ── Call smartlead service (handles no-key / dry-run / live) ─────
    const emailParams = {
      leadEmail: lead.email,
      companyName: lead.companyName,
      phone: lead.phone,
      website: lead.website,
      emailSubject: emailLog.subject,
      emailBody: emailLog.body,
    };

    const result =
      sendMode === 'custom'
        ? await sendCustomEmailViaSmartlead({
            ...emailParams,
            emailBody: formatEmailBodyAsHtml(emailLog.body),
          })
        : await sendEmail(emailParams);

    const now = new Date();
    const isFollowUp = emailLog.type === 'follow_up';

    if (result.status === 'sent') {
      // ── Live send succeeded ────────────────────────────────────────
      const sentUpdate: Record<string, unknown> = {
        status:    'sent',
        sentAt:    now,
        sendMode,
        leadEmail: lead.email,
      };
      // Persist custom send tracking fields so reply sync can correlate later
      if (sendMode === 'custom' && result.data != null) {
        const dataObj = result.data as Record<string, unknown>;
        const trackId = dataObj['trackId'] ?? dataObj['track_id'];
        if (trackId) sentUpdate['smartleadTrackId'] = String(trackId);
        // Store sanitized response (no API key, no full body)
        sentUpdate['smartleadResponse'] = {
          trackId:   trackId ?? null,
          success:   dataObj['success']   ?? null,
          message:   dataObj['message']   ?? null,
        };
      }
      await EmailLog.findByIdAndUpdate(id, sentUpdate);

      // Only increment followUpCount for follow-up emails, not initial
      const leadUpdate: Record<string, unknown> = {
        lastContactedAt: now,
        status: 'contacted',
      };
      if (isFollowUp) {
        leadUpdate.$inc = { followUpCount: 1 };
        leadUpdate.nextFollowUpAt = calcNextFollowUpAt(lead.followUpCount);
      } else {
        // Initial email: schedule Day 1 follow-up
        const nextDate = new Date();
        nextDate.setDate(nextDate.getDate() + FOLLOWUP_GAPS_DAYS[0]);
        leadUpdate.nextFollowUpAt = nextDate;
      }

      await Lead.findByIdAndUpdate(emailLog.leadId, leadUpdate);

      // ── NoReply tracking: upsert active record ─────────────────────
      await markLeadWaitingForReply({
        leadId: emailLog.leadId,
        emailLogId: emailLog._id as mongoose.Types.ObjectId,
        sentAt: now,
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
      // ── Dry run or no-key: mark as test-ready ─────────────────────
      await EmailLog.findByIdAndUpdate(id, {
        status:    'ready_to_send_test',
        sendMode,
        leadEmail: lead.email,
      });

      // Still update lastContactedAt so follow-up timing works in dry-run testing
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

      // ── NoReply tracking: upsert active record (test sends count as outreach) ──
      await markLeadWaitingForReply({
        leadId: emailLog.leadId,
        emailLogId: id,
        sentAt: new Date(),
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

    // ── Send failed ──────────────────────────────────────────────────
    console.error('[send] Smartlead rejected:', result.message, 'rawResponse:', JSON.stringify(result.rawResponse));
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
        mode: process.env.SMARTLEAD_DRY_RUN === 'true' ? 'dry_run' : 'live',
        status: 'failed',
        message: 'Failed to process send request',
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
