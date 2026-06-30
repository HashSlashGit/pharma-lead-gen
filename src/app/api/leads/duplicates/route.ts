import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongoose';
import Lead from '@/lib/models/Lead';
import mongoose from 'mongoose';

interface DupGroup {
  _id: string;
  count: number;
  ids: mongoose.Types.ObjectId[];
}

interface DupTotals {
  _id: null;
  total: number;
  totalDuplicates: number;
}

interface DuplicateGroup {
  email: string;
  count: number;
  leads: Array<{
    _id: string;
    companyName: string;
    email?: string;
    country: string;
    score: number;
    status: string;
    archived: boolean;
    createdAt: Date;
  }>;
}

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const limit = Math.min(50, parseInt(searchParams.get('limit') ?? '20'));

    const dupEmails = await Lead.aggregate<DupGroup>([
      { $match: { email: { $exists: true, $nin: ['', null] } } },
      { $group: { _id: '$email', count: { $sum: 1 }, ids: { $push: '$_id' } } },
      { $match: { count: { $gt: 1 } } },
      { $sort: { count: -1 } },
      { $limit: limit },
    ]);

    if (dupEmails.length === 0) {
      return NextResponse.json({ groups: [], totalGroups: 0, totalDuplicates: 0 });
    }

    const allIds = dupEmails.flatMap((g) => g.ids);
    const leads = await Lead.find({ _id: { $in: allIds } })
      .select('companyName email country score status archived createdAt')
      .lean();

    const leadMap = new Map(leads.map((l) => [String(l._id), l]));

    const groups: DuplicateGroup[] = dupEmails.map((group) => ({
      email: group._id,
      count: group.count,
      leads: group.ids
        .map((id) => {
          const l = leadMap.get(String(id));
          if (!l) return null;
          return {
            _id: String(l._id),
            companyName: l.companyName,
            email: l.email,
            country: l.country,
            score: l.score,
            status: l.status,
            archived: l.archived ?? false,
            createdAt: l.createdAt,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null),
    }));

    const totals = await Lead.aggregate<DupTotals>([
      { $match: { email: { $exists: true, $nin: ['', null] } } },
      { $group: { _id: '$email', count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $group: { _id: null, total: { $sum: 1 }, totalDuplicates: { $sum: { $subtract: ['$count', 1] } } } },
    ]);

    return NextResponse.json({
      groups,
      totalGroups: totals[0]?.total ?? 0,
      totalDuplicates: totals[0]?.totalDuplicates ?? 0,
    });
  } catch (err) {
    console.error('[GET /api/leads/duplicates]', err);
    return NextResponse.json({ error: 'Failed to find duplicates' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const { archiveIds } = await req.json() as { keepId: string; archiveIds: string[] };

    if (!Array.isArray(archiveIds) || archiveIds.length === 0) {
      return NextResponse.json({ error: 'archiveIds is required' }, { status: 400 });
    }

    const res = await Lead.updateMany(
      { _id: { $in: archiveIds } },
      { $set: { archived: true } }
    );

    return NextResponse.json({ success: true, archived: res.modifiedCount });
  } catch (err) {
    console.error('[POST /api/leads/duplicates]', err);
    return NextResponse.json({ error: 'Merge failed' }, { status: 500 });
  }
}
