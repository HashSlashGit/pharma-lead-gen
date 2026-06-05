import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongoose';
import EmailTemplate from '@/lib/models/EmailTemplate';
import mongoose from 'mongoose';
import { z } from 'zod';

const PatchSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(['initial', 'follow_up', 'warm_reply', 'cold_reply', 'pricing', 'custom']).optional(),
  subject: z.string().min(1).optional(),
  body: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'Invalid template ID' }, { status: 400 });
  }
  try {
    await connectDB();
    const template = await EmailTemplate.findById(id).lean();
    if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    return NextResponse.json({ template });
  } catch (err) {
    console.error('[GET /api/email-templates/[id]]', err);
    return NextResponse.json({ error: 'Failed to fetch template' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'Invalid template ID' }, { status: 400 });
  }
  try {
    await connectDB();
    const raw = await req.json();
    const parsed = PatchSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
    }
    const template = await EmailTemplate.findByIdAndUpdate(id, parsed.data, { new: true }).lean();
    if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    return NextResponse.json({ template });
  } catch (err) {
    console.error('[PATCH /api/email-templates/[id]]', err);
    return NextResponse.json({ error: 'Failed to update template' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'Invalid template ID' }, { status: 400 });
  }
  try {
    await connectDB();
    const template = await EmailTemplate.findByIdAndDelete(id).lean();
    if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/email-templates/[id]]', err);
    return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 });
  }
}
