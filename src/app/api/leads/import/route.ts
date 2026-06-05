import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongoose';
import Lead from '@/lib/models/Lead';
import { scoreLead } from '@/lib/utils/scoreLead';

interface CsvRow {
  companyName?: string;
  company_name?: string;
  country?: string;
  category?: string;
  email?: string;
  city?: string;
  phone?: string;
  website?: string;
  source?: string;
  notes?: string;
}

function normalizeRow(row: CsvRow) {
  return {
    companyName: (row.companyName ?? row.company_name ?? '').trim(),
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

function parseCSV(text: string): CsvRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/[^a-z_]/g, ''));

  return lines.slice(1).map((line) => {
    // Handle quoted fields with commas inside
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes) { values.push(current); current = ''; continue; }
      current += ch;
    }
    values.push(current);

    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = (values[i] ?? '').trim(); });
    return obj as CsvRow;
  });
}

export async function POST(req: NextRequest) {
  try {
    await connectDB();

    const contentType = req.headers.get('content-type') ?? '';
    let rows: CsvRow[] = [];

    if (contentType.includes('application/json')) {
      // Accept pre-parsed JSON array (from frontend after client-side parse)
      const body = await req.json();
      rows = Array.isArray(body.rows) ? body.rows : [];
    } else {
      // Accept raw CSV text
      const text = await req.text();
      rows = parseCSV(text);
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: 'No valid rows found in import data' }, { status: 400 });
    }

    // Pre-load existing emails to build duplicate set in memory
    const existingEmails = new Set<string>(
      (await Lead.find({}, { email: 1 }).lean())
        .map((l) => l.email?.toLowerCase() ?? '')
        .filter(Boolean)
    );

    const results = {
      imported: 0,
      duplicates: 0,
      skipped: 0,
      errors: [] as string[],
    };

    const toInsert = [];

    for (let i = 0; i < rows.length; i++) {
      const raw = normalizeRow(rows[i]);
      const rowNum = i + 2; // +2 because row 1 is headers

      // Required fields
      if (!raw.companyName) {
        results.errors.push(`Row ${rowNum}: missing companyName`);
        results.skipped++;
        continue;
      }
      if (!raw.category) {
        results.errors.push(`Row ${rowNum}: missing category (${raw.companyName})`);
        results.skipped++;
        continue;
      }
      // Country defaults to 'Unknown' rather than skipping
      if (!raw.country) {
        raw.country = 'Unknown';
      }

      // Duplicate check by email — tracked separately from invalid-row skips
      if (raw.email && existingEmails.has(raw.email)) {
        results.duplicates++;
        continue;
      }

      // Rule-based score — no Claude
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

      if (raw.email) existingEmails.add(raw.email); // prevent intra-batch duplicates
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
      errors: results.errors,
      total: rows.length,
    });
  } catch (err) {
    console.error('[POST /api/leads/import]', err);
    return NextResponse.json({ error: 'Import failed' }, { status: 500 });
  }
}
