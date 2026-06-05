import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongoose';
import NoReplyLead from '@/lib/models/NoReplyLead';
import Campaign from '@/lib/models/Campaign';
import EmailLog from '@/lib/models/EmailLog';

export async function GET(req: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const country = searchParams.get('country');
    const category = searchParams.get('category');
    const search = searchParams.get('search');
    const fromDate = searchParams.get('fromDate');
    const toDate = searchParams.get('toDate');
    const fromTime = searchParams.get('fromTime');
    const toTime = searchParams.get('toTime');
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
    const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '50'));

    const andConditions: Record<string, unknown>[] = [];

    if (country) andConditions.push({ country: new RegExp(country, 'i') });
    if (category) andConditions.push({ category: new RegExp(category, 'i') });
    if (search) {
      andConditions.push({
        $or: [
          { companyName: new RegExp(search, 'i') },
          { email: new RegExp(search, 'i') },
        ],
      });
    }

    if (fromDate || toDate) {
      const fromTimeStr = fromTime ? `${fromTime}:00` : '00:00:00';
      const toTimeStr = toTime ? `${toTime}:59` : '23:59:59';
      const fromDatetime = fromDate ? new Date(`${fromDate}T${fromTimeStr}.000Z`) : null;
      const toDatetime = toDate ? new Date(`${toDate}T${toTimeStr}.000Z`) : null;

      const dateRange: Record<string, Date> = {};
      if (fromDatetime) dateRange.$gte = fromDatetime;
      if (toDatetime) dateRange.$lte = toDatetime;

      // Filter on lastSentAt first; fall back to archivedAt for older records
      andConditions.push({
        $or: [
          { lastSentAt: dateRange },
          { lastSentAt: { $exists: false }, archivedAt: dateRange },
          { lastSentAt: null, archivedAt: dateRange },
        ],
      });
    }

    const filter: Record<string, unknown> = { isActive: { $ne: false }, status: 'active' };
    if (andConditions.length > 0) filter.$and = andConditions;

    const [records, total] = await Promise.all([
      NoReplyLead.find(filter)
        .sort({ lastSentAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      NoReplyLead.countDocuments(filter),
    ]);

    console.log(`[NoReply] fetched ${records.length} leads`);

    if (records.length === 0) {
      return NextResponse.json({ leads: [], total: 0, page, limit, totalPages: 0 });
    }

    const allCampaignIds = records.flatMap((r) => r.campaignIds ?? []);
    const emailLogIds = records
      .map((r) => r.lastEmailLogId)
      .filter((id): id is NonNullable<typeof id> => id != null);

    const [campaignDocs, emailLogDocs] = await Promise.all([
      allCampaignIds.length > 0
        ? Campaign.find({ _id: { $in: allCampaignIds } }).select('name').lean()
        : Promise.resolve([]),
      emailLogIds.length > 0
        ? EmailLog.find({ _id: { $in: emailLogIds } }).select('subject body').lean()
        : Promise.resolve([]),
    ]);

    const campaignNameMap = new Map(campaignDocs.map((c) => [String(c._id), c.name]));
    const emailLogMap = new Map(emailLogDocs.map((e) => [String(e._id), e]));

    const shaped = records.map((r) => {
      const campaignNames = (r.campaignIds ?? [])
        .map((id) => campaignNameMap.get(String(id)))
        .filter(Boolean)
        .join(', ');

      const lastEmail = r.lastEmailLogId ? emailLogMap.get(String(r.lastEmailLogId)) : null;
      const sentAt = r.lastSentAt?.toISOString();

      return {
        _id: String(r._id),
        leadId: String(r.leadId),
        companyName: r.companyName,
        email: r.email,
        country: r.country,
        category: r.category,
        lastSentAt: sentAt,
        archivedAt: sentAt ?? r.createdAt.toISOString(),
        campaignNames: campaignNames || undefined,
        lastEmailSubject: lastEmail?.subject,
        lastEmailBody: lastEmail?.body,
      };
    });

    return NextResponse.json({ leads: shaped, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('[GET /api/leads/no-reply]', err);
    return NextResponse.json({ error: 'Failed to fetch no-reply leads' }, { status: 500 });
  }
}
