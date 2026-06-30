import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongoose';
import Lead from '@/lib/models/Lead';
import { scoreLead } from '@/lib/utils/scoreLead';
import { getEmailProvider, PROVIDER_EMAIL_FILTER, KNOWN_PROVIDERS_REGEX } from '@/lib/utils/emailProvider';
import { z } from 'zod';
import type { SortOrder } from 'mongoose';

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildFilter(searchParams: URLSearchParams): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = {};

  const status = searchParams.get('status');
  const country = searchParams.get('country');
  const fromDate = searchParams.get('fromDate');
  const toDate = searchParams.get('toDate');
  const search = searchParams.get('search');
  const emailProvider = searchParams.get('emailProvider');
  const category = searchParams.get('category');
  const source = searchParams.get('source');
  const archivedParam = searchParams.get('archived'); // 'true' | 'only' | 'all' | null
  const hasEmail = searchParams.get('hasEmail');
  const hasPhone = searchParams.get('hasPhone');
  const hasWebsite = searchParams.get('hasWebsite');
  const tags = searchParams.get('tags');
  const scoreMin = searchParams.get('scoreMin');
  const scoreMax = searchParams.get('scoreMax');

  // Archived filter — default: exclude archived (backward compatible)
  if (archivedParam === 'only') {
    filter.archived = true;
  } else if (archivedParam === 'all') {
    // no archived filter — show everything
  } else {
    filter.archived = { $ne: true };
  }

  // Status filter
  if (status === 'rejected') {
    filter.status = { $in: ['rejected', 'do_not_contact'] };
  } else if (status) {
    filter.status = status;
  }

  // Country filter
  if (country) filter.country = { $regex: country, $options: 'i' };

  // Category filter
  if (category) filter.category = { $regex: category, $options: 'i' };

  // Source filter
  if (source) filter.source = { $regex: source, $options: 'i' };

  // Date range filter
  if (fromDate || toDate) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dateFilter: Record<string, any> = {};
    if (fromDate) dateFilter.$gte = new Date(fromDate);
    if (toDate) {
      const to = new Date(toDate);
      to.setHours(23, 59, 59, 999);
      dateFilter.$lte = to;
    }
    filter.createdAt = dateFilter;
  }

  // Full-text search across key fields
  if (search) {
    const rx = { $regex: search, $options: 'i' };
    filter.$or = [
      { companyName: rx },
      { email: rx },
      { website: rx },
      { phone: rx },
      { city: rx },
      { country: rx },
      { notes: rx },
    ];
  }

  // Email provider filter
  if (emailProvider && PROVIDER_EMAIL_FILTER[emailProvider]) {
    filter.email = PROVIDER_EMAIL_FILTER[emailProvider];
  } else if (emailProvider === 'custom') {
    filter.email = {
      $exists: true,
      $ne: '',
      $not: { $regex: KNOWN_PROVIDERS_REGEX, $options: 'i' },
    };
  }

  // Has email / phone / website filters
  if (hasEmail === 'true') filter.email = { ...(filter.email ?? {}), $exists: true, $ne: '' };
  if (hasEmail === 'false') filter.$or = [...(filter.$or ?? []), { email: { $exists: false } }, { email: '' }];
  if (hasPhone === 'true') filter.phone = { $exists: true, $ne: '' };
  if (hasWebsite === 'true') filter.website = { $exists: true, $ne: '' };

  // Tags filter (comma-separated, match any)
  if (tags) {
    const tagList = tags.split(',').map((t) => t.trim()).filter(Boolean);
    if (tagList.length > 0) filter.tags = { $in: tagList };
  }

  // Score range
  if (scoreMin || scoreMax) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scoreFilter: Record<string, any> = {};
    if (scoreMin) scoreFilter.$gte = parseInt(scoreMin, 10);
    if (scoreMax) scoreFilter.$lte = parseInt(scoreMax, 10);
    filter.score = scoreFilter;
  }

  return filter;
}

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
    const limit = Math.min(200, parseInt(searchParams.get('limit') ?? '50'));
    const sortBy = searchParams.get('sort') ?? 'score';

    const filter = buildFilter(searchParams);

    const sortMap: Record<string, Record<string, SortOrder>> = {
      score:  { score: -1, createdAt: -1 },
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      name:   { companyName: 1 },
    };
    const sort = sortMap[sortBy] ?? sortMap.score;

    const [leads, total] = await Promise.all([
      Lead.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).lean(),
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
      emailProvider: data.email ? getEmailProvider(data.email) : undefined,
      score,
      status,
      tags: [],
      archived: false,
    });

    return NextResponse.json({ lead }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/leads]', err);
    return NextResponse.json({ error: 'Failed to create lead' }, { status: 500 });
  }
}
