import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongoose';
import Lead from '@/lib/models/Lead';
import { PROVIDER_EMAIL_FILTER, KNOWN_PROVIDERS_REGEX } from '@/lib/utils/emailProvider';
import { writeAuditLog } from '@/lib/utils/auditLog';
import { getRequestActor } from '@/lib/utils/requestActor';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildExportFilter(searchParams: URLSearchParams): Record<string, any> {
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
  const archivedParam = searchParams.get('archived');
  const hasEmail = searchParams.get('hasEmail');
  const hasWebsite = searchParams.get('hasWebsite');
  const hasPhone = searchParams.get('hasPhone');
  const tags = searchParams.get('tags');
  const ids = searchParams.get('ids');

  // Specific IDs (selected export)
  if (ids) {
    const idList = ids.split(',').map((s) => s.trim()).filter(Boolean);
    if (idList.length > 0) {
      filter._id = { $in: idList };
      return filter;
    }
  }

  // Archived
  if (archivedParam === 'only') filter.archived = true;
  else if (archivedParam === 'all') { /* no filter */ }
  else filter.archived = { $ne: true };

  if (status === 'rejected') filter.status = { $in: ['rejected', 'do_not_contact'] };
  else if (status) filter.status = status;
  if (country) filter.country = { $regex: country, $options: 'i' };
  if (category) filter.category = { $regex: category, $options: 'i' };
  if (source) filter.source = { $regex: source, $options: 'i' };

  if (fromDate || toDate) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const df: Record<string, any> = {};
    if (fromDate) df.$gte = new Date(fromDate);
    if (toDate) { const t = new Date(toDate); t.setHours(23,59,59,999); df.$lte = t; }
    filter.createdAt = df;
  }
  if (search) {
    const rx = { $regex: search, $options: 'i' };
    filter.$or = [{ companyName: rx }, { email: rx }, { website: rx }, { city: rx }, { country: rx }];
  }
  if (emailProvider && PROVIDER_EMAIL_FILTER[emailProvider]) {
    filter.email = PROVIDER_EMAIL_FILTER[emailProvider];
  } else if (emailProvider === 'custom') {
    filter.email = { $exists: true, $ne: '', $not: { $regex: KNOWN_PROVIDERS_REGEX, $options: 'i' } };
  }
  if (hasEmail === 'true') filter.email = { ...(filter.email ?? {}), $exists: true, $ne: '' };
  if (hasPhone === 'true') filter.phone = { $exists: true, $ne: '' };
  if (hasWebsite === 'true') filter.website = { $exists: true, $ne: '' };
  if (tags) {
    const tagList = tags.split(',').map((t) => t.trim()).filter(Boolean);
    if (tagList.length > 0) filter.tags = { $in: tagList };
  }

  return filter;
}

function escapeCsv(v: unknown): string {
  if (v === undefined || v === null) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const filter = buildExportFilter(searchParams);

    const leads = await Lead.find(filter)
      .sort({ score: -1, createdAt: -1 })
      .limit(50000)
      .lean();

    const headers = [
      'Company', 'Email', 'Phone', 'Website', 'Country', 'City',
      'Category', 'Source', 'Status', 'Score', 'Tags', 'Archived',
      'Email Provider', 'Notes', 'Created At',
    ];

    const rows = leads.map((l) => [
      l.companyName,
      l.email ?? '',
      l.phone ?? '',
      l.website ?? '',
      l.country,
      l.city ?? '',
      l.category,
      l.source ?? '',
      l.status,
      l.score,
      Array.isArray(l.tags) ? l.tags.join('; ') : '',
      l.archived ? 'Yes' : 'No',
      l.emailProvider ?? '',
      l.notes ?? '',
      l.createdAt ? new Date(l.createdAt).toISOString().split('T')[0] : '',
    ]);

    const csv = [headers, ...rows].map((r) => r.map(escapeCsv).join(',')).join('\n');

    const actor = await getRequestActor(req);
    void writeAuditLog({
      action: 'leads_exported',
      actorId: actor?.actorId,
      meta: { count: leads.length, format: 'csv' },
    });

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="leads-export-${Date.now()}.csv"`,
      },
    });
  } catch (err) {
    console.error('[GET /api/leads/export]', err);
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}
