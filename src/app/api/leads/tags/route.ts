import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongoose';
import Lead from '@/lib/models/Lead';

export async function GET() {
  try {
    await connectDB();
    const result = await Lead.aggregate<{ _id: string; count: number }>([
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 100 },
    ]);
    const tags = result.map((r) => ({ tag: r._id, count: r.count }));
    return NextResponse.json({ tags });
  } catch (err) {
    console.error('[GET /api/leads/tags]', err);
    return NextResponse.json({ error: 'Failed to load tags' }, { status: 500 });
  }
}
