'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';
import { Upload, FileText, CheckCircle, AlertTriangle, ArrowLeft, Download } from 'lucide-react';

interface ImportResult {
  imported: number;
  duplicates?: number;
  skipped: number;
  errors: string[];
  total: number;
}

const SAMPLE_CSV = `companyName,country,category,email,city,phone,website,source,notes
Al Dawaa Pharmacy,Saudi Arabia,Pharmacy,contact@aldawaa.com,Riyadh,+966-11-123456,https://aldawaa.com,Manual,Large chain pharmacy
MedPharm Distributors,UAE,Distributor,info@medpharm.ae,Dubai,+971-4-9876543,https://medpharm.ae,LinkedIn,Wholesale distributor
City Clinic Group,Kuwait,Clinic,admin@cityclinic.kw,Kuwait City,+965-22334455,,Manual,Multi-branch clinic
HealthPlus Wholesale,Egypt,Wholesaler,sales@healthplus.eg,Cairo,+20-2-12345678,https://healthplus.eg,Apollo,Pharma wholesaler`;

export default function ImportPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string[][]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');

  const parsePreview = (text: string) => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 6);
    return lines.map((line) => {
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
    });
  };

  const handleFile = (f: File) => {
    if (!f.name.endsWith('.csv')) {
      setError('Please upload a .csv file');
      return;
    }
    setFile(f);
    setError('');
    setResult(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setPreview(parsePreview(text));
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
    if (!file) return;
    setImporting(true);
    setError('');
    setResult(null);

    try {
      const text = await file.text();

      // Parse CSV client-side into rows
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) throw new Error('CSV has no data rows');

      const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));

      const rows = lines.slice(1).map((line) => {
        const values: string[] = [];
        let current = '';
        let inQ = false;
        for (const ch of line) {
          if (ch === '"') { inQ = !inQ; continue; }
          if (ch === ',' && !inQ) { values.push(current); current = ''; continue; }
          current += ch;
        }
        values.push(current);

        const obj: Record<string, string> = {};
        headers.forEach((h, i) => { obj[h] = (values[i] ?? '').trim(); });
        return obj;
      });

      const res = await fetch('/api/leads/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error ?? 'Import failed');
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

  const headers = preview[0] ?? [];
  const rows = preview.slice(1);

  return (
    <AppShell>
      <div className="max-w-3xl">
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
              Bulk import — rule-based scoring runs automatically. No AI credits used.
            </p>
          </div>
        </div>

        {/* CSV Format Guide */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-5 text-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-semibold text-blue-800 mb-1">Required CSV columns:</p>
              <p className="text-blue-700 font-mono text-xs">companyName, country, category</p>
              <p className="font-semibold text-blue-800 mt-2 mb-1">Optional columns:</p>
              <p className="text-blue-700 font-mono text-xs">email, city, phone, website, source, notes</p>
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
                {preview.length > 1 ? `${preview.length - 1} data rows detected` : 'Reading file…'}
              </p>
            </div>
          ) : (
            <div>
              <Upload size={32} className="mx-auto text-slate-300 mb-2" />
              <p className="font-medium text-slate-600">Drop your CSV file here</p>
              <p className="text-xs text-slate-400 mt-1">or click to browse</p>
            </div>
          )}
        </div>

        {/* Preview Table */}
        {preview.length > 1 && (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-5">
            <div className="px-4 py-3 border-b border-slate-100 text-xs font-semibold text-slate-500 uppercase tracking-widest">
              Preview (first {rows.length} rows)
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50">
                    {headers.map((h, i) => (
                      <th key={i} className="px-3 py-2 text-left font-medium text-slate-600">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row, ri) => (
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

        {error && (
          <div className="flex items-center gap-2 text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-4 py-3 text-sm mb-4">
            <AlertTriangle size={16} /> {error}
          </div>
        )}

        {result && (
          <div className="bg-white border border-slate-200 rounded-xl p-5 mb-5">
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle size={18} className="text-emerald-500" />
              <h2 className="font-semibold text-slate-800">Import Complete</h2>
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
            {result.errors.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 max-h-40 overflow-auto">
                <p className="font-semibold mb-1">Skipped rows:</p>
                {result.errors.map((e, i) => <p key={i}>{e}</p>)}
              </div>
            )}
            <button
              onClick={() => router.push('/leads')}
              className="mt-4 w-full bg-emerald-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
            >
              View All Leads
            </button>
          </div>
        )}

        {file && !result && (
          <button
            onClick={handleImport}
            disabled={importing}
            className="w-full bg-emerald-600 text-white py-3 rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-60"
          >
            {importing ? 'Importing…' : `Import ${preview.length > 1 ? preview.length - 1 : ''} Leads`}
          </button>
        )}
      </div>
    </AppShell>
  );
}
