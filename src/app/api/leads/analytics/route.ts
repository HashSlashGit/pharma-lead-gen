import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongoose';
import Lead from '@/lib/models/Lead';

export async function GET() {
  try {
    await connectDB();

    const now = new Date();
    const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
    const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay()); startOfWeek.setHours(0,0,0,0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      total,
      today,
      thisWeek,
      thisMonth,
      archived,
      noEmail,
      byStatus,
      byCountry,
      byCategory,
      byDay,
      gmailCount,
      yahooCount,
      outlookCount,
      hotmailCount,
      aolCount,
    ] = await Promise.all([
      Lead.countDocuments({}),
      Lead.countDocuments({ createdAt: { $gte: startOfDay } }),
      Lead.countDocuments({ createdAt: { $gte: startOfWeek } }),
      Lead.countDocuments({ createdAt: { $gte: startOfMonth } }),
      Lead.countDocuments({ archived: true }),
      Lead.countDocuments({ $or: [{ email: { $exists: false } }, { email: '' }] }),

      Lead.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),

      Lead.aggregate([
        { $match: { archived: { $ne: true } } },
        { $group: { _id: '$country', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),

      Lead.aggregate([
        { $match: { archived: { $ne: true } } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),

      Lead.aggregate([
        { $match: { createdAt: { $gte: thirtyDaysAgo } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      Lead.countDocuments({ email: { $regex: '@gmail\\.com$', $options: 'i' } }),
      Lead.countDocuments({ email: { $regex: '@yahoo\\.', $options: 'i' } }),
      Lead.countDocuments({ email: { $regex: '@(outlook|live|msn)\\.com$', $options: 'i' } }),
      Lead.countDocuments({ email: { $regex: '@hotmail\\.', $options: 'i' } }),
      Lead.countDocuments({ email: { $regex: '@aol\\.com$', $options: 'i' } }),
    ]);

    const knownProviderCount = gmailCount + yahooCount + outlookCount + hotmailCount + aolCount;
    const customCount = total - noEmail - knownProviderCount;

    const byProvider = [
      { provider: 'gmail',   count: gmailCount },
      { provider: 'yahoo',   count: yahooCount },
      { provider: 'outlook', count: outlookCount },
      { provider: 'hotmail', count: hotmailCount },
      { provider: 'aol',     count: aolCount },
      { provider: 'custom',  count: Math.max(0, customCount) },
      { provider: 'no email', count: noEmail },
    ].filter((p) => p.count > 0);

    return NextResponse.json({
      total,
      today,
      thisWeek,
      thisMonth,
      archived,
      active: total - archived,
      noEmail,
      byStatus: byStatus.map((s) => ({ status: s._id as string, count: s.count as number })),
      byProvider,
      byCountry: byCountry.map((c) => ({ country: c._id as string || 'Unknown', count: c.count as number })),
      byCategory: byCategory.map((c) => ({ category: c._id as string || 'Unknown', count: c.count as number })),
      byDay: byDay.map((d) => ({ date: d._id as string, count: d.count as number })),
    });
  } catch (err) {
    console.error('[GET /api/leads/analytics]', err);
    return NextResponse.json({ error: 'Failed to load analytics' }, { status: 500 });
  }
}
