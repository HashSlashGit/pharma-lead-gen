import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongoose';
import Lead from '@/lib/models/Lead';
import { scoreLead } from '@/lib/utils/scoreLead';
import { getEmailProvider } from '@/lib/utils/emailProvider';

// ─── Column alias map (must stay in sync with frontend) ─────────────────────

function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/[\s_]+/g, '');
}

const FIELD_ALIASES: Record<string, string> = {
  // companyName
  company: 'companyName',
  companyname: 'companyName',
  business: 'companyName',
  businessname: 'companyName',
  organization: 'companyName',
  organizationname: 'companyName',
  // country
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

// ─── CSV parser ─────────────────────────────────────────────────────────────

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

function parseCSV(raw: string): Record<string, string>[] {
  // Strip UTF-8 BOM — present in most Excel-exported CSVs
  const text = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
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
    country:     (row.country     ?? '').trim(),
    category:    (row.category    ?? '').trim(),
    email:       (row.email       ?? '').trim().toLowerCase(),
    city:        (row.city        ?? '').trim(),
    phone:       (row.phone       ?? '').trim(),
    website:     (row.website     ?? '').trim(),
    source:      (row.source      ?? 'CSV Import').trim(),
    notes:       (row.notes       ?? '').trim(),
  };
}

// ─── Route handler ───────────────────────────────────────────────────────────

const MAX_FILE_BYTES  = 100 * 1024 * 1024; // 100 MB hard limit
const INSERT_BATCH    = 500;               // MongoDB insertMany batch size

export async function POST(req: NextRequest) {
  try {
    await connectDB();

    const contentType = req.headers.get('content-type') ?? '';
    let rows: Record<string, string>[] = [];

    // ── 1. Parse incoming body ──────────────────────────────────────────────
    if (contentType.includes('multipart/form-data')) {
      // PRIMARY PATH — FormData file upload (no JSON body-size limit)
      let formData: FormData;
      try {
        formData = await req.formData();
      } catch {
        return NextResponse.json(
          { success: false, error: 'Could not read uploaded file. It may be corrupted or the upload was interrupted.' },
          { status: 400 }
        );
      }

      const uploaded = formData.get('file');
      if (!uploaded || !(uploaded instanceof Blob)) {
        return NextResponse.json(
          { success: false, error: 'No CSV file found in the upload. Please attach a file named "file".' },
          { status: 400 }
        );
      }

      if (uploaded.size > MAX_FILE_BYTES) {
        return NextResponse.json(
          { success: false, error: `File exceeds the 100 MB limit (${(uploaded.size / 1024 / 1024).toFixed(1)} MB uploaded). Split it into smaller files.` },
          { status: 413 }
        );
      }

      let text: string;
      try {
        text = await uploaded.text();
      } catch {
        return NextResponse.json(
          { success: false, error: 'Failed to read file contents. Ensure the file is a valid UTF-8 CSV.' },
          { status: 400 }
        );
      }

      rows = parseCSV(text);

    } else if (contentType.includes('application/json')) {
      // LEGACY PATH — rows pre-parsed on the client (kept for backward compat)
      let body: { rows?: Record<string, string>[] };
      try {
        body = await req.json();
      } catch {
        // req.json() throws when the body exceeds ~4 MB — give a helpful message
        return NextResponse.json(
          {
            success: false,
            error:
              'Request body is too large. Upload the file directly instead of sending pre-parsed JSON rows.',
          },
          { status: 413 }
        );
      }
      const raw: Record<string, string>[] = Array.isArray(body.rows) ? body.rows : [];
      rows = raw.map(applyMapping);

    } else {
      // RAW TEXT / TEXT-CSV fallback
      let text: string;
      try {
        text = await req.text();
      } catch {
        return NextResponse.json(
          { success: false, error: 'Failed to read request body.' },
          { status: 400 }
        );
      }
      rows = parseCSV(text);
    }

    // ── 2. Validate parsed rows ──────────────────────────────────────────────
    if (rows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            'No valid rows found. Ensure the CSV has a header row with an "email" column and at least one data row.',
        },
        { status: 400 }
      );
    }

    // ── 3. Load existing emails for deduplication ────────────────────────────
    const existingEmails = new Set<string>(
      (await Lead.find({}, { email: 1 }).lean())
        .map((l) => l.email?.toLowerCase() ?? '')
        .filter(Boolean)
    );

    // ── 4. Validate & score rows ─────────────────────────────────────────────
    const results = {
      imported:    0,
      duplicates:  0,
      skipped:     0,
      errors:      [] as string[],
      skipReasons: {} as Record<string, number>,
    };

    const toInsert: ReturnType<typeof normalizeRow>[] = [];

    for (let i = 0; i < rows.length; i++) {
      const raw    = normalizeRow(rows[i]);
      const rowNum = i + 2;

      if (!raw.email) {
        const reason = 'Missing email';
        results.errors.push(`Row ${rowNum}: ${reason} — row skipped`);
        results.skipReasons[reason] = (results.skipReasons[reason] ?? 0) + 1;
        results.skipped++;
        continue;
      }

      // Email format sanity check (basic)
      if (!raw.email.includes('@') || !raw.email.includes('.')) {
        const reason = 'Invalid email format';
        results.errors.push(`Row ${rowNum}: ${reason} (${raw.email}) — row skipped`);
        results.skipReasons[reason] = (results.skipReasons[reason] ?? 0) + 1;
        results.skipped++;
        continue;
      }

      if (!raw.companyName) raw.companyName = 'Unknown Company';
      if (!raw.country)     raw.country     = 'Unknown';
      if (!raw.category)    raw.category    = 'General';

      if (existingEmails.has(raw.email)) {
        results.duplicates++;
        continue;
      }

      const { score, status } = scoreLead(raw);

      toInsert.push({
        ...raw,
        email:         raw.email || undefined,
        emailProvider: raw.email ? getEmailProvider(raw.email) : undefined,
        city:          raw.city     || undefined,
        phone:         raw.phone    || undefined,
        website:       raw.website  || undefined,
        source:        raw.source   || 'CSV Import',
        notes:         raw.notes    || undefined,
        score,
        status,
        aiProcessed:   false,
        tags:          [],
        archived:      false,
      } as unknown as ReturnType<typeof normalizeRow>);

      existingEmails.add(raw.email);
    }

    // ── 5. Batch insert ──────────────────────────────────────────────────────
    if (toInsert.length > 0) {
      for (let b = 0; b < toInsert.length; b += INSERT_BATCH) {
        const batch = toInsert.slice(b, b + INSERT_BATCH);
        try {
          const inserted = await Lead.insertMany(batch, { ordered: false });
          results.imported += inserted.length;
        } catch (insertErr: unknown) {
          const e = insertErr as { insertedDocs?: unknown[]; message?: string };
          results.imported += e.insertedDocs?.length ?? 0;
          const batchNum = Math.floor(b / INSERT_BATCH) + 1;
          if (e.message) {
            results.errors.push(`Batch ${batchNum} partial insert: ${e.message.slice(0, 120)}`);
          }
        }
      }
    }

    return NextResponse.json({
      success:     true,
      imported:    results.imported,
      duplicates:  results.duplicates,
      skipped:     results.skipped,
      skipReasons: results.skipReasons,
      errors:      results.errors,
      total:       rows.length,
    });

  } catch (err) {
    // Outer safety net — always return JSON
    console.error('[POST /api/leads/import]', err);
    const message =
      err instanceof Error ? err.message : 'Unknown error during import';
    return NextResponse.json(
      { success: false, error: `Import failed: ${message}` },
      { status: 500 }
    );
  }
}
