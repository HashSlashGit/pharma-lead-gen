export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongoose';
import User from '@/lib/models/User';
import { hashPassword } from '@/lib/utils/password';
import { writeAuditLog } from '@/lib/utils/auditLog';
import { getRequestActor } from '@/lib/utils/requestActor';

/** POST /api/users/[id]/reset-password */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { password } = body;
  if (!password?.trim()) return NextResponse.json({ error: 'New password is required.' }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });

  try {
    await connectDB();
    const user = await User.findByIdAndUpdate(
      id,
      { $set: { passwordHash: hashPassword(password) } },
      { new: true, projection: { passwordHash: 0 } }
    ).lean();
    if (!user) return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    const actor = await getRequestActor(req);
    void writeAuditLog({
      action: 'password_reset',
      ...actor,
      targetId: id,
      targetLabel: (user as { email?: string }).email ?? null,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'Failed to reset password.', details: msg }, { status: 500 });
  }
}
