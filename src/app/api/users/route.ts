export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongoose';
import User from '@/lib/models/User';
import { hashPassword } from '@/lib/utils/password';
import { writeAuditLog } from '@/lib/utils/auditLog';
import { getRequestActor } from '@/lib/utils/requestActor';

/** GET /api/users — list all users (admin only, enforced by middleware) */
export async function GET() {
  try {
    await connectDB();
    const users = await User.find({}, { passwordHash: 0 }).sort({ createdAt: 1 }).lean();
    return NextResponse.json({ users });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'Failed to load users', details: msg }, { status: 500 });
  }
}

/** POST /api/users — create a new user (admin only, enforced by middleware) */
export async function POST(req: NextRequest) {
  let body: { name?: string; email?: string; password?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { name, email, password } = body;
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required.' }, { status: 400 });
  if (!email?.trim()) return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
  if (!password?.trim()) return NextResponse.json({ error: 'Password is required.' }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
  // Role is always 'user' — admins are created only via ADMIN_EMAIL/ADMIN_PASSWORD env vars.
  const role = 'user';

  try {
    await connectDB();
    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) return NextResponse.json({ error: 'A user with that email already exists.' }, { status: 409 });

    await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      passwordHash: hashPassword(password),
      role,
      active: true,
    });

    const safe = await User.findOne({ email: email.toLowerCase().trim() }, { passwordHash: 0 }).lean() as { _id: unknown; email: string } | null;
    const actor = await getRequestActor(req);
    void writeAuditLog({
      action: 'user_created',
      ...actor,
      targetId: safe ? String(safe._id) : null,
      targetLabel: email.toLowerCase().trim(),
      meta: { role },
    });
    return NextResponse.json({ success: true, user: safe }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'Failed to create user', details: msg }, { status: 500 });
  }
}
