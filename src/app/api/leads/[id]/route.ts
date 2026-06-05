import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongoose';
import Lead from '@/lib/models/Lead';
import EmailLog from '@/lib/models/EmailLog';
import Reply from '@/lib/models/Reply';
import mongoose from 'mongoose';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid lead ID' }, { status: 400 });
    }

    await connectDB();

    const [lead, emails, replies] = await Promise.all([
      Lead.findById(id).lean(),
      EmailLog.find({ leadId: id }).sort({ createdAt: -1 }).lean(),
      Reply.find({ leadId: id }).sort({ createdAt: -1 }).lean(),
    ]);

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    return NextResponse.json({ lead, emails, replies });
  } catch (err) {
    console.error('[GET /api/leads/[id]]', err);
    return NextResponse.json({ error: 'Failed to fetch lead' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid lead ID' }, { status: 400 });
    }

    await connectDB();
    const body = await req.json();

    // Only allow safe status/notes updates — no score or aiProcessed override from frontend
    const allowed = ['status', 'notes', 'nextFollowUpAt'];
    const update: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) update[key] = body[key];
    }

    const lead = await Lead.findByIdAndUpdate(id, update, { new: true }).lean();
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

    return NextResponse.json({ lead });
  } catch (err) {
    console.error('[PATCH /api/leads/[id]]', err);
    return NextResponse.json({ error: 'Failed to update lead' }, { status: 500 });
  }
}
