'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';
import {
  Upload, FileText, CheckCircle, AlertTriangle, ArrowLeft, Download, XCircle,
} from 'lucide-react';

// ---------- alias map (must stay in sync with backend FIELD_ALIASES) ----------

function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/[\s_.-]+/g, '');
}

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
  // category  (type & segment are low-confidence — see LOW_CONFIDENCE_KEYS)
  category: 'category',
  industry: 'category',
  businesscategory: 'category',
  segment: 'category',
  type: 'category',
  // email
  email: 'email',
  emails: 'email',
  emailaddress: 'email',
  emailid: 'email',
  contactemail: 'email',
  primaryemail: 'email',
  workemail: 'email',
  businessemail: 'email',
  mail: 'email',
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

// Aliases that are plausible but could be ambiguous — shown with a warning badge in the UI
const LOW_CONFIDENCE_KEYS = new Set(['type', 'segment']);

const REQUIRED_FIELDS = ['email'] as const;
type RequiredField = (typeof REQUIRED_FIELDS)[number];

// ---------- types ----------

interface MappedColumn {
  header: string;
  field: string;
  lowConfidence: boolean;
}

interface Collision {
  field: string;
  used: string;
  duplicate: string;
}

interface MappingAnalysis {
  totalHeaders: number;
  mapped: MappedColumn[];
  ignored: string[];
  collisions: Collision[];
  missingRequired: RequiredField[];
}

interface ImportResult {
  imported: number;
  duplicates?: number;
  skipped: number;
  skipReasons?: Record<string, number>;
  errors: string[];
  total: number;
}

// ---------- CSV helpers ----------

function parseLine(line: string): string[] {
  const cols: string[] = [];
  let current = '';
  let inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === ',' && !inQ) { cols.push(current); current = ''; continue; }
    current += ch;
  }
  cols.push(current);
  return cols;
}

function parsePreview(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .slice(0, 6)
    .map(parseLine);
}

function analyzeHeaders(rawHeaders: string[]): MappingAnalysis {
  const mapped: MappedColumn[] = [];
  const ignored: string[] = [];
  const collisions: Collision[] = [];
  // Map from canonical field → the first CSV header that claimed it
  const seen = new Map<string, string>();

  for (const h of rawHeaders) {
    const trimmed = h.trim();
    if (!trimmed) continue;
    const key = normalizeKey(trimmed);
    const field = FIELD_ALIASES[key];

    if (field) {
      if (!seen.has(field)) {
        mapped.push({ header: trimmed, field, lowConfidence: LOW_CONFIDENCE_KEYS.has(key) });
        seen.set(field, trimmed);
      } else {
        collisions.push({ field, used: seen.get(field)!, duplicate: trimmed });
        ignored.push(trimmed);
      }
    } else {
      ignored.push(trimmed);
    }
  }

  return {
    totalHeaders: rawHeaders.filter((h) => h.trim()).length,
    mapped,
    ignored,
    collisions,
    missingRequired: REQUIRED_FIELDS.filter((f) => !seen.has(f)),
  };
}

// ---------- sample ----------

const SAMPLE_CSV = `companyName,country,category,email,city,phone,website,source,notes
Al Dawaa Pharmacy,Saudi Arabia,Pharmacy,contact@aldawaa.com,Riyadh,+966-11-123456,https://aldawaa.com,Manual,Large chain pharmacy
MedPharm Distributors,UAE,Distributor,info@medpharm.ae,Dubai,+971-4-9876543,https://medpharm.ae,LinkedIn,Wholesale distributor
City Clinic Group,Kuwait,Clinic,admin@cityclinic.kw,Kuwait City,+965-22334455,,Manual,Multi-branch clinic
HealthPlus Wholesale,Egypt,Wholesaler,sales@healthplus.eg,Cairo,+20-2-12345678,https://healthplus.eg,Apollo,Pharma wholesaler`;

// ---------- component ----------

export default function ImportPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string[][]>([]);
  const [dataRowCount, setDataRowCount] = useState(0);
  const [mappingAnalysis, setMappingAnalysis] = useState<MappingAnalysis | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');

  const handleFile = (f: File) => {
    if (!f.name.endsWith('.csv') && !f.name.endsWith('.txt')) {
      setError('Please upload a .csv file');
      return;
    }
    if (f.size > 100 * 1024 * 1024) {
      setError('File exceeds 100 MB. Please split it into smaller files.');
      return;
    }
    setFile(f);
    setError('');
    setResult(null);
    setMappingAnalysis(null);
    setDataRowCount(0);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parsePreview(text);
      setPreview(parsed);
      if (parsed.length > 0) {
        setMappingAnalysis(analyzeHeaders(parsed[0]));
        const total = text.split(/\r?\n/).filter((l) => l.trim()).length;
        setDataRowCount(Math.max(0, total - 1));
      }
    };
    reader.readAsText(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleImport = async () => {
    if (!file || !mappingAnalysis) return;
    setImporting(true);
    setError('');
    setResult(null);

    try {
      // Send the raw CSV file as multipart/form-data — avoids the ~4 MB JSON body limit
      // that was causing "Request Entity Too Large" → "Unexpected token 'R'..." errors.
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/leads/import', {
        method: 'POST',
        // No Content-Type header — browser sets multipart/form-data with boundary automatically
        body: formData,
      });

      // Always read as text first, then parse safely — avoids crashes when the
      // server returns a non-JSON body (413, 500, HTML error page, etc.)
      const responseText = await res.text();
      let data: ImportResult & { success?: boolean; error?: string };
      try {
        data = JSON.parse(responseText);
      } catch {
        if (res.status === 413) {
          throw new Error('File is too large for upload. Try splitting it into smaller files.');
        }
        const preview = responseText.slice(0, 200).replace(/<[^>]+>/g, '').trim();
        throw new Error(
          `Unexpected server response (HTTP ${res.status}): ${preview || 'empty response'}`
        );
      }

      if (!res.ok || data.success === false) {
        throw new Error(data.error ?? `Import failed (${res.status})`);
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const downloadSample = () => {
    const blob = new Blob([SAMPLE_CSV], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pharma-leads-sample.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const previewHeaders = preview[0] ?? [];
  const previewRows = preview.slice(1);
  const canImport = mappingAnalysis !== null && mappingAnalysis.missingRequired.length === 0;
  const successRate = result && result.total > 0
    ? Math.round((result.imported / result.total) * 100)
    : null;

  return (
    <AppShell>
      <div className="max-w-3xl">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.push('/leads')}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Import Leads from CSV</h1>
            <p className="text-slate-500 text-sm mt-1">
              Upload any spreadsheet — column names are detected automatically, extras are ignored.
            </p>
          </div>
        </div>

        {/* Info box */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-5 text-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-semibold text-blue-800 mb-1">
                Required column{' '}
                <span className="font-normal text-blue-600">(any of these names are recognised)</span>
              </p>
              <p className="text-blue-700 font-mono text-xs">
                email · emails · emailAddress · contactEmail · mail
              </p>
              <p className="font-semibold text-blue-800 mt-2 mb-1">Optional columns</p>
              <p className="text-blue-700 font-mono text-xs">
                companyName · company · country · category · city · phone · website · source · notes
              </p>
            </div>
            <button
              onClick={downloadSample}
              className="flex items-center gap-1.5 text-blue-700 border border-blue-300 bg-white rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-blue-50 transition-colors shrink-0"
            >
              <Download size={12} /> Sample CSV
            </button>
          </div>
        </div>

        {/* Drop Zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors mb-5 ${
            dragging
              ? 'border-emerald-400 bg-emerald-50'
              : file
              ? 'border-emerald-300 bg-emerald-50'
              : 'border-slate-300 bg-white hover:border-slate-400 hover:bg-slate-50'
          }`}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
          />
          {file ? (
            <div>
              <FileText size={32} className="mx-auto text-emerald-500 mb-2" />
              <p className="font-medium text-emerald-700">{file.name}</p>
              <p className="text-xs text-slate-400 mt-1">
                {dataRowCount > 0 ? `${dataRowCount} data rows detected` : 'Reading file…'}
              </p>
            </div>
          ) : (
            <div>
              <Upload size={32} className="mx-auto text-slate-300 mb-2" />
              <p className="font-medium text-slate-600">Drop your CSV file here</p>
              <p className="text-xs text-slate-400 mt-1">
                or click to browse — extra columns are ignored automatically
              </p>
            </div>
          )}
        </div>

        {/* Preview Table */}
        {previewRows.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-5">
            <div className="px-4 py-3 border-b border-slate-100 text-xs font-semibold text-slate-500 uppercase tracking-widest">
              Preview (first {previewRows.length} rows)
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50">
                    {previewHeaders.map((h, i) => (
                      <th key={i} className="px-3 py-2 text-left font-medium text-slate-600">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {previewRows.map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td key={ci} className="px-3 py-2 text-slate-600 max-w-[140px] truncate">{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Column Mapping Analysis */}
        {mappingAnalysis && (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-5">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
                Column Analysis
              </span>
              <span className="text-xs text-slate-400">
                {mappingAnalysis.totalHeaders} detected &middot; {mappingAnalysis.mapped.length} mapped &middot; {mappingAnalysis.ignored.length} ignored
              </span>
            </div>
            <div className="p-4 space-y-4">

              {/* Mapped columns */}
              {mappingAnalysis.mapped.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Mapped Columns
                  </p>
                  <div className="space-y-1.5">
                    {mappingAnalysis.mapped.map(({ header, field, lowConfidence }, i) => (
                      <div key={`mapped-${i}`} className="flex items-center gap-2 text-xs flex-wrap">
                        <CheckCircle size={13} className="text-emerald-500 shrink-0" />
                        <span className="text-slate-600 font-mono">{header}</span>
                        <span className="text-slate-300">→</span>
                        <span className="text-emerald-700 font-mono font-medium">{field}</span>
                        {lowConfidence && (
                          <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-medium">
                            Low confidence
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Collision warnings */}
              {mappingAnalysis.collisions.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-2">
                    Column Conflicts
                  </p>
                  <div className="space-y-1.5">
                    {mappingAnalysis.collisions.map((c, i) => (
                      <div key={`collision-${i}`} className="flex items-start gap-1.5 text-xs text-amber-700">
                        <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                        <span>
                          Multiple columns map to{' '}
                          <span className="font-mono font-medium">{c.field}</span>
                          . Using &ldquo;
                          <span className="font-mono">{c.used}</span>
                          &rdquo;, ignoring &ldquo;
                          <span className="font-mono">{c.duplicate}</span>
                          &rdquo;.
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Ignored columns */}
              {mappingAnalysis.ignored.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Ignored Columns
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {mappingAnalysis.ignored.map((h, i) => (
                      <span
                        key={`ignored-${i}`}
                        className="flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-xs font-mono"
                      >
                        <span className="text-slate-400">○</span> {h}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Missing required */}
              {mappingAnalysis.missingRequired.length > 0 && (
                <div className="bg-rose-50 border border-rose-200 rounded-lg p-3">
                  <p className="text-xs font-semibold text-rose-700 uppercase tracking-wider mb-2">
                    Missing Required Fields
                  </p>
                  <div className="space-y-1.5">
                    {mappingAnalysis.missingRequired.includes('email') && (
                      <div className="flex items-center gap-1.5 text-xs text-rose-700">
                        <XCircle size={13} className="shrink-0" />
                        Email column is missing.
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-4 py-3 text-sm mb-4">
            <AlertTriangle size={16} /> {error}
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="bg-white border border-slate-200 rounded-xl p-5 mb-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <CheckCircle size={18} className="text-emerald-500" />
                <h2 className="font-semibold text-slate-800">Import Complete</h2>
              </div>
              {successRate !== null && (
                <span className={`text-sm font-semibold ${
                  successRate >= 80 ? 'text-emerald-600' :
                  successRate >= 50 ? 'text-amber-500' :
                  'text-rose-600'
                }`}>
                  {successRate}% success rate
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-emerald-600">{result.imported}</div>
                <div className="text-xs text-slate-500 mt-1">Imported</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-amber-500">{result.skipped}</div>
                <div className="text-xs text-slate-500 mt-1">Skipped</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-slate-600">{result.total}</div>
                <div className="text-xs text-slate-500 mt-1">Total Rows</div>
              </div>
            </div>

            {/* Analytics */}
            <div className="border-t border-slate-100 pt-4 mb-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Import Analytics
              </p>
              <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Total columns detected</span>
                  <span className="font-medium">{mappingAnalysis?.totalHeaders ?? '—'}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Rows detected</span>
                  <span className="font-medium">{result.total}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Columns mapped</span>
                  <span className="font-medium text-emerald-600">{mappingAnalysis?.mapped.length ?? '—'}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Rows eligible</span>
                  <span className="font-medium text-emerald-600">
                    {result.imported + (result.duplicates ?? 0)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Columns ignored</span>
                  <span className="font-medium text-slate-400">{mappingAnalysis?.ignored.length ?? '—'}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Rows skipped</span>
                  <span className="font-medium text-amber-500">{result.skipped}</span>
                </div>
              </div>
            </div>

            {/* Skip reasons breakdown */}
            {result.skipReasons && Object.keys(result.skipReasons).length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                <p className="text-xs font-semibold text-amber-800 mb-2">Skipped Row Breakdown</p>
                <div className="space-y-1">
                  {Object.entries(result.skipReasons).map(([reason, count]) => (
                    <div key={reason} className="flex justify-between text-xs text-amber-700">
                      <span>{reason}</span>
                      <span className="font-medium">{count} row{count !== 1 ? 's' : ''}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Per-row error details */}
            {result.errors.length > 0 && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600 max-h-40 overflow-auto mb-4">
                <p className="font-semibold text-slate-700 mb-1">Skipped row details:</p>
                {result.errors.map((e, i) => <p key={i} className="font-mono">{e}</p>)}
              </div>
            )}

            <button
              onClick={() => router.push('/leads')}
              className="w-full bg-emerald-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
            >
              View All Leads
            </button>
          </div>
        )}

        {/* Import button */}
        {file && !result && (
          <button
            onClick={handleImport}
            disabled={importing || !canImport}
            title={
              !canImport && mappingAnalysis
                ? `Missing required columns: ${mappingAnalysis.missingRequired.join(', ')}`
                : undefined
            }
            className="w-full bg-emerald-600 text-white py-3 rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {importing
              ? 'Importing…'
              : !canImport && mappingAnalysis
              ? 'Cannot import — fix missing columns first'
              : `Import ${dataRowCount > 0 ? dataRowCount : ''} Leads`}
          </button>
        )}

      </div>
    </AppShell>
  );
}
