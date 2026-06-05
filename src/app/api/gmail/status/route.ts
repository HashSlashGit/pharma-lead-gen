export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongoose';
import InboxAccount from '@/lib/models/InboxAccount';

export async function GET() {
  const configured =
    !!process.env.GOOGLE_CLIENT_ID &&
    !!process.env.GOOGLE_CLIENT_SECRET &&
    !!process.env.GOOGLE_REDIRECT_URI;

  if (!configured) {
    return NextResponse.json({ configured: false, connected: false });
  }

  try {
    await connectDB();

    const account = await InboxAccount.findOne({ provider: 'gmail', isActive: true })
      .select('email lastSyncedAt')
      .lean();

    if (!account) {
      return NextResponse.json({ configured: true, connected: false });
    }

    return NextResponse.json({
      configured: true,
      connected: true,
      email: account.email,
      lastSyncedAt: account.lastSyncedAt ?? null,
    });
  } catch (err) {
    console.error('[gmail/status]', err);
    return NextResponse.json({ configured, connected: false, error: String(err) });
  }
}
