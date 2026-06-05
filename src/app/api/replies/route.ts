import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongoose';
import Reply from '@/lib/models/Reply';

export async function GET(req: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const filter = searchParams.get('filter') ?? 'all';
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '20', 10));
    const skip = (page - 1) * limit;

    const query: Record<string, unknown> = {};

    switch (filter) {
      case 'needs_review':
        query.needsApproval = true;
        query.status = 'pending';
        break;
      case 'awaiting_approval':
        query.status = 'draft_generated';
        break;
      case 'interested':
        query.classification = 'interested';
        break;
      case 'not_interested':
        query.classification = 'not_interested';
        break;
      case 'unsubscribed':
        query.classification = 'not_interested';
        query.needsApproval = false;
        break;
      case 'handled':
        query.status = { $in: ['draft_approved', 'handled'] };
        break;
      default:
        break;
    }

    const [rawReplies, total] = await Promise.all([
      Reply.find(query)
        .sort({ receivedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('leadId', 'companyName email country status score')
        .lean(),
      Reply.countDocuments(query),
    ]);

    // Flatten populated leadId → lead field
    const replies = rawReplies.map((r) => {
      const obj = r as unknown as Record<string, unknown>;
      const { leadId, ...rest } = obj;
      return { ...rest, lead: leadId };
    });

    console.log(`[Replies API] latest replies fetched — count:${replies.length} total:${total} filter:${filter}`);
    return NextResponse.json({ replies, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('[GET /api/replies]', err);
    return NextResponse.json({ error: 'Failed to fetch replies' }, { status: 500 });
  }
}
