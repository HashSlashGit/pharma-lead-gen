import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongoose';
import InboxAccount from '@/lib/models/InboxAccount';
import { ensureFreshToken } from '@/lib/services/mailboxRotation';
import { invalidateHealthCache } from '@/app/api/health/route';
import { invalidateConfigCache } from '@/app/api/config/route';

/**
 * PATCH — rename a mailbox's sender display name and/or enable/disable it.
 * Multiple Gmail accounts may be active at once, so callers pass `email` to
 * target a specific one; omitting it (display-name-only requests) falls
 * back to the most recently connected active account for backward
 * compatibility. Toggling `isActive` always requires `email`, since a
 * disabled account wouldn't otherwise match the legacy fallback filter.
 */
export async function PATCH(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const hasDisplayName = typeof body.displayName === 'string';
  const hasIsActive    = typeof body.isActive === 'boolean';

  if (!hasDisplayName && !hasIsActive) {
    return NextResponse.json({ error: 'displayName or isActive must be provided' }, { status: 400 });
  }

  const targetEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : undefined;

  if (hasIsActive && !targetEmail) {
    return NextResponse.json({ error: 'email is required to enable/disable a specific account' }, { status: 400 });
  }

  await connectDB();

  const set: Record<string, unknown> = {};
  const unset: Record<string, unknown> = {};
  if (hasDisplayName) {
    const displayName = (body.displayName as string).trim();
    if (displayName) set.displayName = displayName;
    else unset.displayName = '';
  }
  if (hasIsActive) set.isActive = body.isActive as boolean;

  const update: Record<string, unknown> = {};
  if (Object.keys(set).length > 0) update.$set = set;
  if (Object.keys(unset).length > 0) update.$unset = unset;

  const filter: Record<string, unknown> = targetEmail
    ? { provider: 'gmail', email: targetEmail }
    : { provider: 'gmail', isActive: true };

  const account = await InboxAccount.findOneAndUpdate(
    filter,
    update,
    { new: true, sort: { updatedAt: -1 } }
  );

  if (!account) {
    return NextResponse.json({ error: 'Gmail account not found' }, { status: 404 });
  }

  if (hasIsActive) {
    // Enabling/disabling changes which accounts count as "connected".
    invalidateHealthCache();
    invalidateConfigCache();
  }

  return NextResponse.json({
    success: true,
    email: account.email,
    displayName: account.displayName ?? null,
    isActive: account.isActive,
  });
}

/**
 * POST — on-demand token health check for one mailbox ("Refresh Status").
 * Reuses ensureFreshToken() (the same helper getMailboxForSend() calls
 * before every send) rather than duplicating OAuth refresh logic. Cheap
 * when the token isn't near expiry (no network call); only hits Google
 * when a refresh is actually due, surfacing a real auth failure if the
 * stored refresh token has been revoked. Nothing is persisted beyond what
 * ensureFreshToken already writes on a successful refresh.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : undefined;
  if (!email) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 });
  }

  await connectDB();
  const account = await InboxAccount.findOne({ provider: 'gmail', email });
  if (!account) {
    return NextResponse.json({ error: 'Gmail account not found' }, { status: 404 });
  }

  try {
    await ensureFreshToken(account);
    return NextResponse.json({ email, healthy: true });
  } catch (err) {
    return NextResponse.json({ email, healthy: false, error: String(err) });
  }
}

/** DELETE — permanently remove a mailbox (?email=...). Other accounts are untouched. */
export async function DELETE(req: NextRequest) {
  const email = new URL(req.url).searchParams.get('email')?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 });
  }

  await connectDB();
  const deleted = await InboxAccount.findOneAndDelete({ provider: 'gmail', email });
  if (!deleted) {
    return NextResponse.json({ error: 'Gmail account not found' }, { status: 404 });
  }

  invalidateHealthCache();
  invalidateConfigCache();

  return NextResponse.json({ success: true, email });
}
