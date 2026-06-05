'use client';

import { useState, useCallback } from 'react';
import AppShell from '@/components/layout/AppShell';
import ScoreBadge from '@/components/ui/ScoreBadge';
import { Search, Download, AlertCircle, CheckCircle2, Loader2, Info, Sparkles } from 'lucide-react';
import { type ApolloLeadPreview } from '@/types';

interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
  total: number;
}

export default function ApolloSearchPage() {
  const [keyword, setKeyword] = useState('');
  const [country, setCountry] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [limit, setLimit] = useState(25);
  const [planLimit, setPlanLimit] = useState<number | null>(null);

  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [leads, setLeads] = useState<ApolloLeadPreview[]>([]);
  const [searched, setSearched] = useState(false);

  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importedIds, setImportedIds] = useState<Set<string>>(new Set());

  const [enrichingLeads, setEnrichingLeads] = useState<Record<string, boolean>>({});
  const [enrichErrors, setEnrichErrors] = useState<Record<string, string>>({});

  const handleSearch = useCallback(async () => {
    if (!keyword.trim() && !country.trim() && !jobTitle.trim()) {
      setSearchError('Enter at least one search term.');
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
    setEnrichingLeads({});
    setEnrichErrors({});
    setImportedIds(new Set());

    try {
      const res = await fetch('/api/apollo/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword: keyword.trim() || undefined,
          country: country.trim() || undefined,
          jobTitle: jobTitle.trim() || undefined,
          limit,
        }),
      });
      const data = await res.json();
      if (data.planLimit) setPlanLimit(data.planLimit);
      if (data.error) {
        setSearchError(data.error);
      } else {
        setLeads(data.leads ?? []);
      }
    } catch {
      setSearchError('Network error — please try again.');
    } finally {
      setSearching(false);
      setSearched(true);
    }
  }, [keyword, country, jobTitle, limit]);

  const handleEnrich = async (lead: ApolloLeadPreview) => {
    setEnrichingLeads((prev) => ({ ...prev, [lead.apolloId]: true }));
    setEnrichErrors((prev) => { const next = { ...prev }; delete next[lead.apolloId]; return next; });

    try {
      const res = await fetch('/api/apollo/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apolloId: lead.apolloId,
          firstName: lead.firstName,
          lastName: lead.lastName,
          companyName: lead.companyName,
          website: lead.website,
          organizationDomain: lead.organizationDomain,
          linkedinUrl: lead.linkedinUrl,
          title: lead.title,
        }),
      });
      const data = await res.json();

      if (data.found && data.email) {
        setLeads((prev) =>
          prev.map((l) =>
            l.apolloId === lead.apolloId
              ? { ...l, email: data.email, needsEnrichment: false, score: l.score + 10 }
              : l
          )
        );
      } else {
        setEnrichErrors((prev) => ({
          ...prev,
          [lead.apolloId]: data.message ?? 'No email found after enrichment.',
        }));
      }
    } catch {
      setEnrichErrors((prev) => ({ ...prev, [lead.apolloId]: 'Enrichment request failed.' }));
    } finally {
      setEnrichingLeads((prev) => { const next = { ...prev }; delete next[lead.apolloId]; return next; });
    }
  };

  const toggleSelect = (apolloId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(apolloId)) next.delete(apolloId);
      else next.add(apolloId);
      return next;
    });
  };

  const importableLeads = leads.filter(
    (l) => !l.isDuplicate && !l.needsEnrichment && !importedIds.has(l.apolloId)
  );

  const toggleSelectAll = () => {
    if (selected.size === importableLeads.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(importableLeads.map((l) => l.apolloId)));
    }
  };

  const doImport = async (leadsToImport: ApolloLeadPreview[]) => {
    const withEmail = leadsToImport.filter((l) => !l.needsEnrichment && l.email);
    if (withEmail.length === 0) return;

    setImporting(true);
    setImportResult(null);

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];
    const newlyImportedIds = new Set<string>();

    for (const lead of withEmail) {
      try {
        const payload = {
          companyName: lead.companyName,
          contactName: lead.contactName,
          email: lead.email,
          phone: lead.phone || '',
          website: lead.website || '',
          country: lead.country || country || 'Unknown',
          city: lead.city || '',
          category: lead.category || 'Apollo Lead',
          source: 'apollo',
          apolloId: lead.apolloId,
          title: lead.title,
          score: lead.score,
        };

        const res = await fetch('/api/apollo/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();

        if (data.imported === true) {
          imported++;
          newlyImportedIds.add(lead.apolloId);
        } else if (data.duplicate === true) {
          skipped++;
          newlyImportedIds.add(lead.apolloId);
        } else {
          errors.push(`${lead.companyName}: ${data.error ?? 'Unknown error'}`);
        }
      } catch {
        errors.push(`${lead.companyName}: Network error`);
      }
    }

    setImportedIds((prev) => new Set([...prev, ...newlyImportedIds]));
    setImportResult({ imported, skipped, errors, total: withEmail.length });
    setSelected(new Set());
    setImporting(false);
  };

  const selectedLeads = leads.filter((l) => selected.has(l.apolloId));
  const allImportableSelected = importableLeads.length > 0 && selected.size === importableLeads.length;
  const needsEnrichmentCount = leads.filter((l) => l.needsEnrichment).length;

  const showImportSuccess = importResult !== null && (importResult.imported > 0 || importResult.skipped > 0);
  const showImportFailure = importResult !== null && importResult.imported === 0 && importResult.skipped === 0;

  return (
    <AppShell>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">Apollo Lead Discovery</h1>
        <p className="text-slate-500 text-sm mt-1">
          Search Apollo.io for contacts — preview scores and duplicates before importing.
        </p>
      </div>

      {/* Search Form */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-1">
            <label className="block text-xs font-semibold text-slate-500 mb-1">Keyword</label>
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="e.g. pharmaceutical distributor"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Country</label>
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
            <label className="block text-xs font-semibold text-slate-500 mb-1">Job Title</label>
            <input
              type="text"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="e.g. Purchasing Manager"
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

        <div className="mt-4 flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <button
              onClick={handleSearch}
              disabled={searching}
              className="flex items-center gap-2 bg-emerald-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-60"
            >
              {searching ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
              {searching ? 'Searching…' : 'Search Apollo'}
            </button>
          </div>
          <p className="text-xs text-slate-400 flex items-center gap-1">
            <Info size={13} />
            Search results may not include emails. Click Enrich Email only for leads you want to verify. This may use Apollo credits.
          </p>
        </div>
      </div>

      {/* Import Success Banner */}
      {showImportSuccess && importResult && (
        <div className="mb-5 bg-white border border-slate-200 rounded-xl p-4 text-sm">
          <p className="font-semibold text-slate-700 mb-2 flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-500" />
            Import Complete
          </p>
          <div className="flex flex-wrap gap-4 text-slate-600">
            <span><strong>{importResult.imported}</strong> imported</span>
            <span><strong>{importResult.skipped}</strong> skipped (duplicates)</span>
            <span><strong>{importResult.total}</strong> total selected</span>
          </div>
          {importResult.errors.length > 0 && (
            <div className="mt-2 text-xs text-rose-600">
              {importResult.errors.map((e, i) => <p key={i}>{e}</p>)}
            </div>
          )}
        </div>
      )}

      {/* Import Failure Banner */}
      {showImportFailure && importResult && (
        <div className="mb-5 bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm">
          <p className="font-semibold text-rose-700 mb-2 flex items-center gap-2">
            <AlertCircle size={16} />
            Import Failed
          </p>
          {importResult.errors.length > 0 ? (
            <div className="text-xs text-rose-600">
              {importResult.errors.map((e, i) => <p key={i}>{e}</p>)}
            </div>
          ) : (
            <p className="text-rose-600 text-xs">No leads were imported.</p>
          )}
        </div>
      )}

      {/* Empty state */}
      {searched && leads.length === 0 && !searchError && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-8 text-center text-slate-500 text-sm">
          No candidates found. Try a different keyword, title, or country.
        </div>
      )}

      {leads.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {/* Table toolbar */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
            <div className="flex items-center gap-3 text-sm text-slate-600">
              <span className="font-medium">{leads.length} leads</span>
              {leads.some((l) => l.isDuplicate) && (
                <span className="text-amber-600 font-medium">
                  · {leads.filter((l) => l.isDuplicate).length} already in DB
                </span>
              )}
              {importedIds.size > 0 && (
                <span className="text-emerald-600 font-medium">
                  · {importedIds.size} imported
                </span>
              )}
              {needsEnrichmentCount > 0 && (
                <span className="text-slate-500 font-medium">
                  · {needsEnrichmentCount} need enrichment
                </span>
              )}
              {selected.size > 0 && (
                <span className="text-emerald-600 font-medium">· {selected.size} selected</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {importableLeads.length === 0 && leads.length > 0 && (
                <span className="text-xs text-slate-400 italic mr-1">Enrich before importing</span>
              )}
              <button
                onClick={() => doImport(selectedLeads)}
                disabled={importing || selected.size === 0}
                className="flex items-center gap-1.5 bg-slate-800 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-slate-700 transition-colors disabled:opacity-40"
              >
                <Download size={13} />
                Import Selected ({selected.size})
              </button>
              <button
                onClick={() => doImport(importableLeads)}
                disabled={importing || importableLeads.length === 0}
                className="flex items-center gap-1.5 bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-emerald-700 transition-colors disabled:opacity-40"
              >
                <Download size={13} />
                Import All ({importableLeads.length})
              </button>
              {importing && <Loader2 size={15} className="animate-spin text-slate-500" />}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  <th className="px-4 py-3 text-left w-10">
                    <input
                      type="checkbox"
                      checked={allImportableSelected}
                      onChange={toggleSelectAll}
                      className="rounded"
                    />
                  </th>
                  <th className="px-4 py-3 text-left">Company</th>
                  <th className="px-4 py-3 text-left">Contact</th>
                  <th className="px-4 py-3 text-left">Email</th>
                  <th className="px-4 py-3 text-left">Country</th>
                  <th className="px-4 py-3 text-left">Industry</th>
                  <th className="px-4 py-3 text-left">Score</th>
                  <th className="px-4 py-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {leads.map((lead) => {
                  const isImported = importedIds.has(lead.apolloId);
                  const canSelect = !lead.isDuplicate && !lead.needsEnrichment && !isImported;
                  const isEnriching = !!enrichingLeads[lead.apolloId];
                  const enrichError = enrichErrors[lead.apolloId];

                  return (
                    <tr
                      key={lead.apolloId}
                      className={`hover:bg-slate-50 transition-colors ${lead.isDuplicate || isImported ? 'opacity-50' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(lead.apolloId)}
                          disabled={!canSelect}
                          onChange={() => canSelect && toggleSelect(lead.apolloId)}
                          className="rounded disabled:opacity-30"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-800 truncate max-w-[160px]">
                            {lead.companyName}
                          </span>
                          {isImported && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700 shrink-0">
                              IMPORTED
                            </span>
                          )}
                          {!isImported && lead.isDuplicate && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700 shrink-0">
                              DUP
                            </span>
                          )}
                        </div>
                        {lead.website && (
                          <a
                            href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-slate-400 hover:text-emerald-600 truncate block max-w-[160px]"
                          >
                            {lead.website}
                          </a>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-slate-700">{lead.contactName}</div>
                        <div className="text-xs text-slate-400">{lead.title}</div>
                      </td>
                      <td className="px-4 py-3">
                        {lead.needsEnrichment ? (
                          <div className="flex flex-col gap-1">
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700 w-fit">
                              Needs enrichment
                            </span>
                            <span className="text-xs text-slate-400">No email</span>
                            {enrichError ? (
                              <span className="text-xs text-rose-500">{enrichError}</span>
                            ) : (
                              <button
                                onClick={() => handleEnrich(lead)}
                                disabled={isEnriching || lead.isDuplicate}
                                className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-800 disabled:opacity-40 font-medium w-fit"
                              >
                                {isEnriching
                                  ? <><Loader2 size={11} className="animate-spin" /> Enriching…</>
                                  : <><Sparkles size={11} /> Enrich Email</>
                                }
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700 w-fit">
                              Email found
                            </span>
                            <span className="font-mono text-xs text-slate-700">{lead.email}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{lead.country || '—'}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs max-w-[120px] truncate">{lead.category || '—'}</td>
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
