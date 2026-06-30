import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongoose';
import Lead from '@/lib/models/Lead';
import type { ILead } from '@/lib/models/Lead';

type LeadStatus = ILead['status'];

const ACTIVE_STATUSES: LeadStatus[] = ['new', 'qualified', 'needs_review', 'warm', 'low_priority'];

export async function GET() {
  try {
    await connectDB();

    const [
      total,
      archived,
      active,
      noEmail,
      gmailCount,
      yahooCount,
      outlookCount,
      hotmailCount,
      aolCount,
      duplicateGroups,
    ] = await Promise.all([
      Lead.countDocuments({}),
      Lead.countDocuments({ archived: true }),
      Lead.countDocuments({ archived: { $ne: true }, status: { $in: ACTIVE_STATUSES } }),
      // Leads with no email: null, missing, or empty string
      Lead.countDocuments({ $or: [{ email: { $exists: false } }, { email: { $in: ['', null] } }] }),
      Lead.countDocuments({ email: { $regex: '@gmail\\.com$', $options: 'i' } }),
      Lead.countDocuments({ email: { $regex: '@yahoo\\.', $options: 'i' } }),
      Lead.countDocuments({ email: { $regex: '@(outlook|live|msn)\\.com$', $options: 'i' } }),
      Lead.countDocuments({ email: { $regex: '@hotmail\\.', $options: 'i' } }),
      Lead.countDocuments({ email: { $regex: '@aol\\.com$', $options: 'i' } }),
      // Count duplicate leads (extra copies sharing same email)
      Lead.aggregate<{ _id: null; totalDuplicates: number }>([
        { $match: { email: { $exists: true, $nin: ['', null] } } },
        { $group: { _id: '$email', count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
        { $group: { _id: null, totalDuplicates: { $sum: { $subtract: ['$count', 1] } } } },
      ]),
    ]);

    const duplicates = duplicateGroups[0]?.totalDuplicates ?? 0;
    const knownProviderCount = gmailCount + yahooCount + outlookCount + hotmailCount + aolCount;
    const custom = Math.max(0, total - noEmail - knownProviderCount);

    return NextResponse.json({
      total,
      active,
      archived,
      noEmail,
      gmail: gmailCount,
      yahoo: yahooCount,
      outlook: outlookCount,
      hotmail: hotmailCount,
      aol: aolCount,
      custom,
      duplicates,
    });
  } catch (err) {
    console.error('[GET /api/leads/cleanup/stats]', err);
    return NextResponse.json({ error: 'Failed to load cleanup stats' }, { status: 500 });
  }
}
