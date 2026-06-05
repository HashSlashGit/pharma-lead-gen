import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongoose';
import EmailLog from '@/lib/models/EmailLog';
import Lead from '@/lib/models/Lead';

/**
 * GET /api/follow-ups/due
 * Returns pending follow-up email log drafts with lead info.
 * No Claude. Read-only.
 */
export async function GET() {
  try {
    await connectDB();

    const logs = await EmailLog.find({ type: 'follow_up', status: 'pending' })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    if (logs.length === 0) {
      return NextResponse.json({ followUps: [] });
    }

    const leadIds = [...new Set(logs.map((l) => l.leadId.toString()))];
    const leads = await Lead.find({ _id: { $in: leadIds } })
      .select('companyName email followUpCount')
      .lean();

    const leadMap = new Map(leads.map((l) => [l._id.toString(), l]));

    const followUps = logs.map((log) => {
      const lead = leadMap.get(log.leadId.toString());
      return {
        logId: log._id.toString(),
        leadId: log.leadId.toString(),
        companyName: lead?.companyName ?? 'Unknown',
        email: lead?.email ?? null,
        followUpNumber: lead?.followUpCount ?? null,
        subject: log.subject,
        createdAt: log.createdAt,
      };
    });

    return NextResponse.json({ followUps });
  } catch (err) {
    console.error('[GET /api/follow-ups/due]', err);
    return NextResponse.json({ error: 'Failed to fetch due follow-ups' }, { status: 500 });
  }
}
