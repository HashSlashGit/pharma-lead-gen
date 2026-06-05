import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongoose';
import EmailLog, { type IEmailLog } from '@/lib/models/EmailLog';
import Lead, { type ILead } from '@/lib/models/Lead';
import mongoose from 'mongoose';
import { improveEmailDraft } from '@/lib/services/claude';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid email log ID' }, { status: 400 });
    }

    // ── Guard: CLAUDE_API_KEY must be present ────────────────────────
    if (!process.env.CLAUDE_API_KEY) {
      return NextResponse.json({ error: 'CLAUDE_API_KEY is not configured' }, { status: 503 });
    }

    await connectDB();

    const emailLog = await EmailLog.findById(id).lean<IEmailLog>();
    if (!emailLog) {
      return NextResponse.json({ error: 'Email log not found' }, { status: 404 });
    }

    // ── Guard: only improve unsent drafts ────────────────────────────
    if (emailLog.status !== 'pending') {
      return NextResponse.json(
        { error: `Cannot improve an email with status "${emailLog.status}" — only pending drafts can be improved` },
        { status: 422 }
      );
    }

    const lead = await Lead.findById(emailLog.leadId).lean<ILead>();
    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    // ── Call Claude (user-triggered, logged) ─────────────────────────
    const improvedBody = await improveEmailDraft({
      leadId: lead._id.toString(),
      body: emailLog.body,
      companyName: lead.companyName,
      country: lead.country,
      category: lead.category,
    });

    // ── Update the draft in DB ───────────────────────────────────────
    await EmailLog.findByIdAndUpdate(id, { body: improvedBody });

    return NextResponse.json({ success: true, body: improvedBody });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Improvement failed';
    console.error('[POST /api/email-logs/[id]/improve-with-ai]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
