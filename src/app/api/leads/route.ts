import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongoose';
import Lead from '@/lib/models/Lead';
import { scoreLead } from '@/lib/utils/scoreLead';
import { z } from 'zod';

const LeadSchema = z.object({
  companyName: z.string().min(1),
  country: z.string().min(1),
  city: z.string().optional(),
  category: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  website: z.string().optional(),
  source: z.string().optional(),
  notes: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
    const limit = Math.min(200, parseInt(searchParams.get('limit') ?? '50'));
    const status = searchParams.get('status');
    const country = searchParams.get('country');
    const fromDate = searchParams.get('fromDate');
    const toDate = searchParams.get('toDate');

    const filter: Record<string, unknown> = {};
    if (status === 'rejected') {
      // Include 'do_not_contact' status — semantically equivalent to rejected
      filter.status = { $in: ['rejected', 'do_not_contact'] };
    } else if (status) {
      filter.status = status;
    }
    if (country) filter.country = new RegExp(country, 'i');
    if (fromDate || toDate) {
      const dateFilter: Record<string, Date> = {};
      if (fromDate) dateFilter.$gte = new Date(fromDate);
      if (toDate) {
        const to = new Date(toDate);
        to.setHours(23, 59, 59, 999);
        dateFilter.$lte = to;
      }
      filter.createdAt = dateFilter;
    }

    const [leads, total] = await Promise.all([
      Lead.find(filter).sort({ score: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Lead.countDocuments(filter),
    ]);

    return NextResponse.json({ leads, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('[GET /api/leads]', err);
    return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const body = await req.json();
    const parsed = LeadSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
    }

    const data = parsed.data;

    // Duplicate check — rule-based, no Claude
    if (data.email) {
      const existing = await Lead.findOne({ email: data.email.toLowerCase() }).lean();
      if (existing) {
        return NextResponse.json({ error: 'Lead with this email already exists', duplicate: true }, { status: 409 });
      }
    }

    // Rule-based scoring — no Claude
    const { score, status } = scoreLead(data);

    const lead = await Lead.create({
      ...data,
      email: data.email || undefined,
      score,
      status,
    });

    return NextResponse.json({ lead }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/leads]', err);
    return NextResponse.json({ error: 'Failed to create lead' }, { status: 500 });
  }
}
