import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongoose';
import Lead from '@/lib/models/Lead';
import { scoreLead } from '@/lib/utils/scoreLead';

// Normalize header for alias lookup: lowercase, strip all spaces & underscores
function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/[\s_]+/g, '');
}

// Normalized key → canonical field name
const FIELD_ALIASES: Record<string, string> = {
  // companyName
  company: 'companyName',
  companyname: 'companyName',
  business: 'companyName',
  businessname: 'companyName',
  organization: 'companyName',
  organizationname: 'companyName',
  // country  (countryregion = Microsoft Excel export; countrycode = ISO 3166-1 alpha-2)
  country: 'country',
  countryname: 'country',
  countrycode: 'country',
  countryregion: 'country',
  nation: 'country',
  // category
  category: 'category',
  industry: 'category',
  businesscategory: 'category',
  segment: 'category',
  type: 'category',
  // email
  email: 'email',
  emailaddress: 'email',
  emailid: 'email',
  contactemail: 'email',
  // phone
  phone: 'phone',
  phonenumber: 'phone',
  phoneno: 'phone',
  phonenos: 'phone',
  mobile: 'phone',
  mobilenumber: 'phone',
  contactnumber: 'phone',
  // website
  website: 'website',
  websiteurl: 'website',
  url: 'website',
  companywebsite: 'website',
  // city
  city: 'city',
  town: 'city',
  location: 'city',
  // passthrough
  source: 'source',
  notes: 'notes',
};

const KNOWN_FIELDS = new Set([
  'companyName', 'country', 'category', 'email', 'phone', 'website', 'city', 'source', 'notes',
]);

// Re-key a row using the alias map, dropping unknown fields
function applyMapping(row: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  const seen = new Set<string>();
  for (const [k, v] of Object.entries(row)) {
    const canon = FIELD_ALIASES[normalizeKey(k)];
    if (canon && KNOWN_FIELDS.has(canon) && !seen.has(canon)) {
      out[canon] = v;
      seen.add(canon);
    }
  }
  return out;
}

function parseLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === ',' && !inQuotes) { values.push(current); current = ''; continue; }
    current += ch;
  }
  values.push(current);
  return values;
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const rawHeaders = parseLine(lines[0]);
  const seen = new Set<string>();
  const headerFields: (string | null)[] = rawHeaders.map((h) => {
    const canon = FIELD_ALIASES[normalizeKey(h.trim())];
    if (canon && KNOWN_FIELDS.has(canon) && !seen.has(canon)) {
      seen.add(canon);
      return canon;
    }
    return null;
  });

  return lines.slice(1).map((line) => {
    const values = parseLine(line);
    const obj: Record<string, string> = {};
    headerFields.forEach((field, i) => {
      if (field) obj[field] = (values[i] ?? '').trim();
    });
    return obj;
  });
}

function normalizeRow(row: Record<string, string>) {
  return {
    companyName: (row.companyName ?? '').trim(),
    country: (row.country ?? '').trim(),
    category: (row.category ?? '').trim(),
    email: (row.email ?? '').trim().toLowerCase(),
    city: (row.city ?? '').trim(),
    phone: (row.phone ?? '').trim(),
    website: (row.website ?? '').trim(),
    source: (row.source ?? 'CSV Import').trim(),
    notes: (row.notes ?? '').trim(),
  };
}

export async function POST(req: NextRequest) {
  try {
    await connectDB();

    const contentType = req.headers.get('content-type') ?? '';
    let rows: Record<string, string>[] = [];

    if (contentType.includes('application/json')) {
      const body = await req.json();
      const raw: Record<string, string>[] = Array.isArray(body.rows) ? body.rows : [];
      rows = raw.map(applyMapping);
    } else {
      const text = await req.text();
      rows = parseCSV(text);
    }

    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid rows found in import data' },
        { status: 400 },
      );
    }

    const existingEmails = new Set<string>(
      (await Lead.find({}, { email: 1 }).lean())
        .map((l) => l.email?.toLowerCase() ?? '')
        .filter(Boolean),
    );

    const results = {
      imported: 0,
      duplicates: 0,
      skipped: 0,
      errors: [] as string[],
      skipReasons: {} as Record<string, number>,
    };

    const toInsert = [];

    for (let i = 0; i < rows.length; i++) {
      const raw = normalizeRow(rows[i]);
      const rowNum = i + 2;

      if (!raw.companyName) {
        results.errors.push(`Row ${rowNum}: Missing company name — cell was empty`);
        results.skipReasons['Missing companyName'] = (results.skipReasons['Missing companyName'] ?? 0) + 1;
        results.skipped++;
        continue;
      }
      if (!raw.email) {
        results.errors.push(`Row ${rowNum}: Missing email (${raw.companyName})`);
        results.skipReasons['Missing email'] = (results.skipReasons['Missing email'] ?? 0) + 1;
        results.skipped++;
        continue;
      }
      if (!raw.country) {
        raw.country = 'Unknown';
      }
      if (!raw.category) {
        raw.category = 'General';
      }

      if (existingEmails.has(raw.email)) {
        results.duplicates++;
        continue;
      }

      const { score, status } = scoreLead(raw);

      const doc = {
        companyName: raw.companyName,
        country: raw.country,
        category: raw.category,
        email: raw.email || undefined,
        city: raw.city || undefined,
        phone: raw.phone || undefined,
        website: raw.website || undefined,
        source: raw.source || 'CSV Import',
        notes: raw.notes || undefined,
        score,
        status,
        aiProcessed: false,
      };

      if (raw.email) existingEmails.add(raw.email);
      toInsert.push(doc);
    }

    if (toInsert.length > 0) {
      try {
        const inserted = await Lead.insertMany(toInsert, { ordered: false });
        results.imported = inserted.length;
      } catch (insertErr: unknown) {
        const e = insertErr as { insertedDocs?: unknown[]; message?: string };
        results.imported = e.insertedDocs?.length ?? 0;
        if (e.message) results.errors.push(`Partial insert: ${e.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      imported: results.imported,
      duplicates: results.duplicates,
      skipped: results.skipped,
      skipReasons: results.skipReasons,
      errors: results.errors,
      total: rows.length,
    });
  } catch (err) {
    console.error('[POST /api/leads/import]', err);
    return NextResponse.json(
      { success: false, error: 'Import failed — please try again' },
      { status: 500 },
    );
  }
}
