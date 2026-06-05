import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db/mongoose';
import Lead, { type ILead } from '@/lib/models/Lead';
import EmailLog from '@/lib/models/EmailLog';
import mongoose from 'mongoose';

const BLOCKED_STATUSES = new Set(['rejected', 'no_response']);

const Schema = z.object({
  leadId: z.string().min(1),
  subject: z.string().min(1, 'Subject is required'),
  body: z.string().min(1, 'Body is required'),
});

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();
    const parsed = Schema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { leadId, subject, body } = parsed.data;

    if (!mongoose.Types.ObjectId.isValid(leadId)) {
      return NextResponse.json({ error: 'Invalid lead ID' }, { status: 400 });
    }

    await connectDB();

    const lead = await Lead.findById(leadId).lean<ILead>();
    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }
    if (!lead.email) {
      return NextResponse.json({ error: 'Lead has no email address' }, { status: 422 });
    }
    if (BLOCKED_STATUSES.has(lead.status)) {
      return NextResponse.json(
        { error: `Cannot compose email for this lead — status is "${lead.status}"` },
        { status: 422 }
      );
    }

    const emailLog = await EmailLog.create({
      leadId: lead._id,
      type: 'initial',
      subject,
      body,
      status: 'pending',
    });

    return NextResponse.json({ emailLogId: emailLog._id, success: true }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/email-logs/manual-draft]', err);
    return NextResponse.json({ error: 'Failed to save draft' }, { status: 500 });
  }
}
