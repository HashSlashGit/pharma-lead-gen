'use client';

import { useState, useCallback } from 'react';
import AppShell from '@/components/layout/AppShell';
import ScoreBadge from '@/components/ui/ScoreBadge';
import {
  MapPin,
  Download,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Info,
  ExternalLink,
  Mail,
  MailX,
  Globe,
} from 'lucide-react';
import { type ApifyLeadPreview } from '@/types';

interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
  total: number;
}

const PHARMA_KEYWORDS = [
  'pharmacy',
  'pharmaceutical distributor',
  'drug store',
  'medical supplier',
  'healthcare distributor',
  'clinic',
  'hospital pharmacy',
  'wholesaler pharmaceutical',
];

// ─── Email enrichment badge ───────────────────────────────────────────────────

function EmailEnrichmentBadge({
  status,
}: {
  status: ApifyLeadPreview['emailEnrichmentStatus'];
}) {
  if (status === 'enriched') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700 shrink-0">
        <Globe size={9} />
        Extracted
      </span>
    );
  }
  return null;
}

function ContactCell({ lead }: { lead: ApifyLeadPreview }) {
  const { email, phone, emailEnrichmentStatus } = lead;

  return (
    <div className="min-w-0">
      {email ? (
        <>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700 shrink-0">
              <Mail size={9} />
              Email found
            </span>
            <EmailEnrichmentBadge status={emailEnrichmentStatus} />
          </div>
          <div className="font-mono text-xs text-slate-600 truncate max-w-[160px] mt-0.5">
            {email}
          </div>
        </>
      ) : emailEnrichmentStatus === 'not_found' ? (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700">
          <MailX size={9} />
          No email found
        </span>
      ) : emailEnrichmentStatus === 'skipped' ? (
        <span className="text-slate-400 text-xs italic">Enrichment skipped</span>
      ) : (
        <span className="inline-flex items-center gap-1 text-slate-400 text-xs">
          <MailX size={10} />
          Needs enrichment
        </span>
      )}

      {phone && (
        <div className="text-xs text-slate-400 mt-0.5">{phone}</div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ApifySearchPage() {
  const [keyword, setKeyword] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [limit, setLimit] = useState(25);
  const [planLimit, setPlanLimit] = useState<number | null>(null);

  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [leads, setLeads] = useState<ApifyLeadPreview[]>([]);
  const [searched, setSearched] = useState(false);
  const [enrichmentEnabled, setEnrichmentEnabled] = useState<boolean | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const uniqueKey = (l: ApifyLeadPreview) =>
    `${l.companyName}::${l.country}::${l.mapsUrl ?? ''}`;

  const handleSearch = useCallback(async () => {
    if (!keyword.trim()) {
      setSearchError('Keyword is required.');
      return;
    }
    if (!country.trim()) {
      setSearchError('Country is required.');
      return;
    }
    if (limit < 1) {
      setSearchError('Select a result count (25, 50, or 100).');
      return;
    }
    setSearching(true);
    setSearchError('');
    setLeads([]);
    setSelected(new Set());
    setImportResult(null);
    setSearched(false);
    setEnrichmentEnabled(null);

    try {
      const res = await fetch('/api/apify/maps-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword: keyword.trim(),
          city: city.trim() || undefined,
          country: country.trim(),
          limit,
        }),
      });
      const data = await res.json();
      if (data.planLimit) setPlanLimit(data.planLimit);
      if (data.error) {
        setSearchError(data.error);
      } else {
        const fetchedLeads: ApifyLeadPreview[] = data.leads ?? [];
        setLeads(fetchedLeads);

        // Detect whether enrichment ran by checking if any lead has a non-'not_checked' status
        const anyEnriched = fetchedLeads.some(
          (l) =>
            l.emailEnrichmentStatus === 'enriched' ||
            l.emailEnrichmentStatus === 'not_found' ||
            l.emailEnrichmentStatus === 'skipped'
        );
        setEnrichmentEnabled(anyEnriched);
      }
    } catch {
      setSearchError('Network error — please try again.');
    } finally {
      setSearching(false);
      setSearched(true);
    }
  }, [keyword, city, country, limit]);

  const toggleSelect = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const nonDupe = leads.filter((l) => !l.isDuplicate);
    if (selected.size === nonDupe.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(nonDupe.map(uniqueKey)));
    }
  };

  const doImport = async (leadsToImport: ApifyLeadPreview[]) => {
    if (leadsToImport.length === 0) return;
    setImporting(true);
    setImportResult(null);

    try {
      const res = await fetch('/api/apify/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leads: leadsToImport }),
      });
      const data = await res.json();
      setImportResult(data);

      // Mark imported leads as duplicate so they can't be re-imported.
      const importedKeys = new Set(leadsToImport.map(uniqueKey));
      setLeads((prev) =>
        prev.map((l) => (importedKeys.has(uniqueKey(l)) ? { ...l, isDuplicate: true } : l))
      );
      setSelected(new Set());
    } catch {
      setImportResult({
        imported: 0,
        skipped: 0,
        errors: ['Network error'],
        total: leadsToImport.length,
      });
    } finally {
      setImporting(false);
    }
  };

  const nonDupeLeads = leads.filter((l) => !l.isDuplicate);
  const selectedLeads = leads.filter((l) => selected.has(uniqueKey(l)));
  const allNonDupeSelected =
    nonDupeLeads.length > 0 && selected.size === nonDupeLeads.length;

  // Stats from the result set
  const emailCount = leads.filter((l) => l.email).length;
  const enrichedCount = leads.filter((l) => l.emailEnrichmentStatus === 'enriched').length;
  const noEmailCount = leads.filter((l) => !l.email).length;

  return (
    <AppShell>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">Google Maps Scraper</h1>
        <p className="text-slate-500 text-sm mt-1">
          Find local pharmacies, clinics, and distributors via Apify Google Maps.
        </p>
      </div>

      {/* Search Form */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-1">
            <label className="block text-xs font-semibold text-slate-500 mb-1">
              Keyword <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="e.g. pharmacy"
              list="keyword-suggestions"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <datalist id="keyword-suggestions">
              {PHARMA_KEYWORDS.map((k) => (
                <option key={k} value={k} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">City</label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="e.g. Dubai"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">
              Country <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="e.g. United Arab Emirates"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">
              Max Results{planLimit !== null ? ` (Plan limit: ${planLimit})` : ''}
            </label>
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value={0}>— Select limit —</option>
              {[25, 50, 100].map((n) => (
                <option key={n} value={n}>{n} results</option>
              ))}
            </select>
          </div>
        </div>

        {searchError && (
          <div className="mt-3 flex items-center gap-2 text-rose-600 text-sm">
            <AlertCircle size={15} />
            {searchError}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={handleSearch}
            disabled={searching}
            className="flex items-center gap-2 bg-emerald-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-60"
          >
            {searching ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <MapPin size={15} />
            )}
            {searching ? 'Searching Google Maps…' : 'Search Google Maps'}
          </button>
          <p className="text-xs text-slate-400 flex items-center gap-1">
            <Info size={13} />
            Runs an Apify actor — uses Apify credits. No Claude calls.
          </p>
        </div>

        {searching && (
          <div className="mt-3 space-y-1.5">
            <div className="flex items-center gap-2 text-slate-500 text-sm bg-slate-50 rounded-lg px-4 py-3">
              <Loader2 size={14} className="animate-spin shrink-0" />
              Google Maps scraper is running — this can take 30–90 seconds for small batches.
            </div>
            <div className="flex items-center gap-2 text-slate-400 text-xs px-4">
              <Info size={12} className="shrink-0" />
              If website enrichment is enabled, emails will be extracted from business websites
              after the Maps results arrive.
            </div>
          </div>
        )}

        {/* Website enrichment info note */}
        <div className="mt-4 flex items-start gap-2 text-xs text-slate-400 bg-slate-50 rounded-lg px-4 py-3">
          <Globe size={13} className="shrink-0 mt-0.5 text-slate-400" />
          <span>
            Emails are extracted from business websites when website enrichment is enabled.
            This may use extra Apify credits.
            {enrichmentEnabled === false && (
              <span className="ml-1 text-amber-600 font-medium">
                Enrichment is currently disabled (
                <code className="font-mono">APIFY_WEBSITE_ENRICHMENT_ENABLED=false</code>).
              </span>
            )}
          </span>
        </div>
      </div>

      {/* Import Result Banner */}
      {importResult && (
        <div className="mb-5 bg-white border border-slate-200 rounded-xl p-4 text-sm">
          <p className="font-semibold text-slate-700 mb-2 flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-500" />
            Import Complete
          </p>
          <div className="flex flex-wrap gap-4 text-slate-600">
            <span>
              <strong>{importResult.imported}</strong> imported
            </span>
            <span>
              <strong>{importResult.skipped}</strong> skipped (duplicates)
            </span>
            <span>
              <strong>{importResult.total}</strong> total selected
            </span>
          </div>
          {importResult.errors.length > 0 && (
            <div className="mt-2 text-xs text-rose-600">
              {importResult.errors.map((e, i) => (
                <p key={i}>{e}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {searched && leads.length === 0 && !searchError && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-8 text-center text-slate-500 text-sm">
          No results found. Try a different keyword, city, or country.
        </div>
      )}

      {/* Results Table */}
      {leads.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50 flex-wrap gap-2">
            <div className="flex items-center gap-3 text-sm text-slate-600 flex-wrap">
              <span className="font-medium">{leads.length} results</span>
              {emailCount > 0 && (
                <span className="text-emerald-600 font-medium">
                  · {emailCount} with email
                  {enrichedCount > 0 && (
                    <span className="text-blue-600"> ({enrichedCount} extracted from websites)</span>
                  )}
                </span>
              )}
              {noEmailCount > 0 && (
                <span className="text-amber-600 font-medium">
                  · {noEmailCount} need enrichment
                </span>
              )}
              {leads.some((l) => l.isDuplicate) && (
                <span className="text-amber-600 font-medium">
                  · {leads.filter((l) => l.isDuplicate).length} already in DB
                </span>
              )}
              {selected.size > 0 && (
                <span className="text-emerald-600 font-medium">· {selected.size} selected</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => doImport(selectedLeads)}
                disabled={importing || selected.size === 0}
                className="flex items-center gap-1.5 bg-slate-800 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-slate-700 transition-colors disabled:opacity-40"
              >
                <Download size={13} />
                Import Selected ({selected.size})
              </button>
              <button
                onClick={() => doImport(nonDupeLeads)}
                disabled={importing || nonDupeLeads.length === 0}
                className="flex items-center gap-1.5 bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-emerald-700 transition-colors disabled:opacity-40"
              >
                <Download size={13} />
                Import All ({nonDupeLeads.length})
              </button>
              {importing && <Loader2 size={15} className="animate-spin text-slate-500" />}
            </div>
          </div>

          {/* No-email note when some leads lack emails */}
          {noEmailCount > 0 && (
            <div className="px-4 py-2 border-b border-slate-100 bg-amber-50 flex items-center gap-2 text-xs text-amber-700">
              <AlertCircle size={13} className="shrink-0" />
              {noEmailCount} lead{noEmailCount !== 1 ? 's' : ''} without email — imported leads
              will be saved but marked{' '}
              <em>&quot;Needs email enrichment before outreach&quot;</em> in their notes.
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  <th className="px-4 py-3 text-left w-10">
                    <input
                      type="checkbox"
                      checked={allNonDupeSelected}
                      onChange={toggleSelectAll}
                      className="rounded"
                    />
                  </th>
                  <th className="px-4 py-3 text-left">Company</th>
                  <th className="px-4 py-3 text-left">Category</th>
                  <th className="px-4 py-3 text-left">Contact</th>
                  <th className="px-4 py-3 text-left">Location</th>
                  <th className="px-4 py-3 text-left">Website</th>
                  <th className="px-4 py-3 text-left">Score</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Maps</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {leads.map((lead) => {
                  const key = uniqueKey(lead);
                  return (
                    <tr
                      key={key}
                      className={`hover:bg-slate-50 transition-colors ${
                        lead.isDuplicate ? 'opacity-50' : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(key)}
                          disabled={lead.isDuplicate}
                          onChange={() => toggleSelect(key)}
                          className="rounded"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-800 truncate max-w-[140px]">
                            {lead.companyName}
                          </span>
                          {lead.isDuplicate && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700 shrink-0">
                              DUP
                            </span>
                          )}
                        </div>
                        {lead.address && (
                          <div className="text-xs text-slate-400 truncate max-w-[140px]">
                            {lead.address}
                          </div>
                        )}
                        {lead.rating != null && (
                          <div className="text-xs text-slate-400">
                            ⭐ {lead.rating.toFixed(1)}
                            {lead.reviewsCount != null && (
                              <span className="ml-1">({lead.reviewsCount} reviews)</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs max-w-[110px] truncate">
                        {lead.category || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <ContactCell lead={lead} />
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-xs">
                        <div>{lead.city || '—'}</div>
                        <div className="text-slate-400">{lead.country}</div>
                      </td>
                      <td className="px-4 py-3">
                        {lead.website ? (
                          <a
                            href={
                              lead.website.startsWith('http')
                                ? lead.website
                                : `https://${lead.website}`
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-emerald-600 hover:underline truncate block max-w-[130px]"
                          >
                            {lead.website.replace(/^https?:\/\//, '')}
                          </a>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <ScoreBadge score={lead.score} />
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            lead.scoreStatus === 'qualified'
                              ? 'bg-emerald-100 text-emerald-700'
                              : lead.scoreStatus === 'needs_review'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {lead.scoreStatus.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {lead.mapsUrl ? (
                          <a
                            href={lead.mapsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-slate-400 hover:text-emerald-600 transition-colors"
                            title="Open in Google Maps"
                          >
                            <ExternalLink size={14} />
                          </a>
                        ) : (
                          <span className="text-slate-200">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AppShell>
  );
}
