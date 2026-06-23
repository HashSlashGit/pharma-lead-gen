import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongoose';
import InboxAccount from '@/lib/models/InboxAccount';

export async function PATCH(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (typeof body.displayName !== 'string') {
    return NextResponse.json({ error: 'displayName must be a string' }, { status: 400 });
  }

  const displayName = body.displayName.trim();
  await connectDB();

  const update = displayName
    ? { $set: { displayName } }
    : { $unset: { displayName: '' } };

  const account = await InboxAccount.findOneAndUpdate(
    { provider: 'gmail', isActive: true },
    update,
    { new: true }
  );

  if (!account) {
    return NextResponse.json({ error: 'No active Gmail account found' }, { status: 404 });
  }

  return NextResponse.json({ success: true, displayName: account.displayName ?? null });
}
