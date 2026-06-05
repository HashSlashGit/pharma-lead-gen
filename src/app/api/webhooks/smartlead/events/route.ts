import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongoose';
import WebhookEvent from '@/lib/models/WebhookEvent';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }

  try {
    await connectDB();

    const { searchParams } = req.nextUrl;
    const limit  = Math.min(100, parseInt(searchParams.get('limit')  ?? '50', 10));
    const status = searchParams.get('status'); // optional filter

    const query: Record<string, unknown> = { provider: 'smartlead' };
    if (status) query.status = status;

    const events = await WebhookEvent.find(query)
      .sort({ receivedAt: -1 })
      .limit(limit)
      .lean();

    return NextResponse.json({ events, total: events.length });
  } catch (err) {
    console.error('[GET /api/webhooks/smartlead/events]', err);
    return NextResponse.json({ error: 'Failed to fetch webhook events' }, { status: 500 });
  }
}
