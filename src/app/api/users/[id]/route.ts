export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongoose';
import User from '@/lib/models/User';
import { writeAuditLog } from '@/lib/utils/auditLog';
import { getRequestActor } from '@/lib/utils/requestActor';
import { checkLastAdminMutation } from '@/lib/utils/adminGuard';

/** GET /api/users/[id] */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await connectDB();
    const user = await User.findById(id, { passwordHash: 0 }).lean();
    if (!user) return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch user.' }, { status: 500 });
  }
}

/** PUT /api/users/[id] — update name, email, role, active */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { name?: string; email?: string; role?: string; active?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (typeof body.name === 'string' && body.name.trim()) update.name = body.name.trim();
  if (typeof body.email === 'string' && body.email.trim()) update.email = body.email.toLowerCase().trim();
  // Role changes to 'admin' are rejected — only 'user' is allowed from the API.
  // Admin accounts are managed via ADMIN_EMAIL/ADMIN_PASSWORD env vars only.
  if (body.role === 'user') update.role = 'user';
  if (typeof body.active === 'boolean') update.active = body.active;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 });
  }

  try {
    await connectDB();

    // Prevent email conflicts
    if (update.email) {
      const conflict = await User.findOne({ email: update.email, _id: { $ne: id } });
      if (conflict) return NextResponse.json({ error: 'That email is already in use.' }, { status: 409 });
    }

    // Fetch the target user so we can check role-based guards before mutating
    const existing = await User.findById(id, { role: 1, active: 1, email: 1 }).lean() as {
      _id: unknown; role: string; active: boolean; email?: string;
    } | null;
    if (!existing) return NextResponse.json({ error: 'User not found.' }, { status: 404 });

    // Prevent the last active admin from being demoted or deactivated
    const activeAdminCount = await User.countDocuments({ role: 'admin', active: true });
    const guardError = checkLastAdminMutation(
      existing.role,
      activeAdminCount,
      update.role as string | undefined,
      update.active as boolean | undefined
    );
    if (guardError) return NextResponse.json({ error: guardError }, { status: 400 });

    const user = await User.findByIdAndUpdate(id, { $set: update }, { new: true, projection: { passwordHash: 0 } }).lean() as { _id: unknown; email?: string } | null;
    if (!user) return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    const actor = await getRequestActor(req);
    void writeAuditLog({
      action: 'user_updated',
      ...actor,
      targetId: id,
      targetLabel: (user as { email?: string }).email ?? null,
      meta: { fields: Object.keys(update) },
    });
    return NextResponse.json({ success: true, user });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'Failed to update user.', details: msg }, { status: 500 });
  }
}

/** DELETE /api/users/[id] */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await connectDB();
    const adminCount = await User.countDocuments({ role: 'admin', active: true });
    const user = await User.findById(id).lean();
    if (!user) return NextResponse.json({ error: 'User not found.' }, { status: 404 });

    // Don't delete the last active admin
    if (user.role === 'admin' && adminCount <= 1) {
      return NextResponse.json({ error: 'Cannot delete the last admin account.' }, { status: 400 });
    }

    const actor = await getRequestActor(_req);
    void writeAuditLog({
      action: 'user_deleted',
      ...actor,
      targetId: id,
      targetLabel: (user as { email?: string }).email ?? null,
    });
    await User.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'Failed to delete user.', details: msg }, { status: 500 });
  }
}
