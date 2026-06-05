import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongoose';
import EmailTemplate from '@/lib/models/EmailTemplate';
import { z } from 'zod';

const TemplateSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['initial', 'follow_up', 'warm_reply', 'cold_reply', 'pricing', 'custom']),
  subject: z.string().min(1),
  body: z.string().min(1),
  isActive: z.boolean().optional(),
});

export async function GET() {
  try {
    await connectDB();
    const templates = await EmailTemplate.find().sort({ createdAt: -1 }).lean();
    return NextResponse.json({ templates });
  } catch (err) {
    console.error('[GET /api/email-templates]', err);
    return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const raw = await req.json();
    const parsed = TemplateSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
    }
    const template = await EmailTemplate.create(parsed.data);
    return NextResponse.json({ template }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/email-templates]', err);
    return NextResponse.json({ error: 'Failed to create template' }, { status: 500 });
  }
}
