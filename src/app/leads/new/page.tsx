'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';
import { CheckCircle, AlertTriangle } from 'lucide-react';

const CATEGORIES = [
  'Pharmacy',
  'Chain Pharmacy',
  'Distributor',
  'Wholesaler',
  'Clinic',
  'Hospital',
  'Healthcare Provider',
  'Medical Center',
  'Drugstore',
  'Pharmaceutical Company',
  'Health Center',
  'Other',
];

const SOURCES = ['Manual', 'Apollo.io', 'Apify', 'LinkedIn', 'Referral', 'Website', 'Trade Show', 'Other'];

interface FormData {
  companyName: string;
  country: string;
  city: string;
  category: string;
  email: string;
  phone: string;
  website: string;
  source: string;
  notes: string;
}

const empty: FormData = {
  companyName: '',
  country: '',
  city: '',
  category: '',
  email: '',
  phone: '',
  website: '',
  source: 'Manual',
  notes: '',
};

export default function AddLeadPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormData>(empty);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ score?: number; status?: string; error?: string } | null>(null);

  const set = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);

    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (!res.ok) {
        setResult({ error: data.error ?? 'Failed to create lead' });
      } else {
        setResult({ score: data.lead.score, status: data.lead.status });
        setTimeout(() => router.push('/leads'), 1800);
      }
    } catch {
      setResult({ error: 'Network error — please try again' });
    } finally {
      setSubmitting(false);
    }
  };

  const field = (
    label: string,
    key: keyof FormData,
    type = 'text',
    required = false,
    placeholder = ''
  ) => (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">
        {label} {required && <span className="text-rose-500">*</span>}
      </label>
      <input
        type={type}
        value={form[key]}
        onChange={set(key)}
        required={required}
        placeholder={placeholder}
        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
      />
    </div>
  );

  return (
    <AppShell>
      <div className="max-w-2xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800">Add New Lead</h1>
          <p className="text-slate-500 text-sm mt-1">
            Score is calculated automatically using rules — no AI credits used.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
          {/* Section: Company */}
          <div>
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Company Info</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {field('Company Name', 'companyName', 'text', true, 'e.g. Al Dawaa Pharmacy')}
              {field('Country', 'country', 'text', true, 'e.g. Saudi Arabia')}
              {field('City', 'city', 'text', false, 'e.g. Riyadh')}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Category <span className="text-rose-500">*</span>
                </label>
                <select
                  value={form.category}
                  onChange={set('category')}
                  required
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">Select category…</option>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Section: Contact */}
          <div>
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Contact Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {field('Email', 'email', 'email', false, 'contact@company.com')}
              {field('Phone', 'phone', 'tel', false, '+966 ...')}
              {field('Website', 'website', 'url', false, 'https://...')}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Source</label>
                <select
                  value={form.source}
                  onChange={set('source')}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Notes</h2>
            <textarea
              value={form.notes}
              onChange={set('notes')}
              rows={3}
              placeholder="Any additional context about this lead…"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
            />
          </div>

          {/* Scoring hint */}
          <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-500 border border-slate-100">
            <strong>Scoring preview:</strong> email +25 &bull; website +20 &bull; phone +10 &bull; country +10 &bull; category match +25 &bull; source +10.
            Score ≥ 70 = Qualified &bull; 40–69 = Needs Review &bull; &lt;40 = Low Priority
          </div>

          {result?.error && (
            <div className="flex items-center gap-2 text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-4 py-3 text-sm">
              <AlertTriangle size={16} />
              {result.error}
            </div>
          )}

          {result?.status && (
            <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-sm">
              <CheckCircle size={16} />
              Lead created! Score: <strong>{result.score}</strong> &bull; Status: <strong>{result.status?.replace(/_/g, ' ')}</strong>. Redirecting…
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 bg-emerald-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-60"
            >
              {submitting ? 'Saving…' : 'Add Lead'}
            </button>
            <button
              type="button"
              onClick={() => setForm(empty)}
              className="px-4 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Clear
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
