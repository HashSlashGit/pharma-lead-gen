'use client';

import { useEffect, useState, useCallback, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';
import { NoReplyLeadRow } from '@/types';
import {
  Archive,
  Mail,
  MapPin,
  Tag,
  Search,
  Calendar,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  CheckCircle,
  AlertTriangle,
  X,
} from 'lucide-react';

interface CampaignOption {
  _id: string;
  name: string;
}

export default function NoReplyLeadsPage() {
  const router = useRouter();
  const [leads, setLeads] = useState<NoReplyLeadRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [fromTime, setFromTime] = useState('');
  const [toTime, setToTime] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [assignResult, setAssignResult] = useState<{
    ok?: boolean;
    message?: string;
    error?: string;
  } | null>(null);

  const fetchLeads = useCallback((targetPage = 1) => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '100', page: String(targetPage) });
    if (search) params.set('search', search);
    if (countryFilter) params.set('country', countryFilter);
    if (categoryFilter) params.set('category', categoryFilter);
    if (fromDate) params.set('fromDate', fromDate);
    if (toDate) params.set('toDate', toDate);
    if (fromTime) params.set('fromTime', fromTime);
    if (toTime) params.set('toTime', toTime);

    fetch(`/api/leads/no-reply?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setLeads(data.leads ?? []);
        setTotal(data.total ?? 0);
        setTotalPages(data.totalPages ?? 1);
        setPage(targetPage);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [search, countryFilter, categoryFilter, fromDate, toDate, fromTime, toTime]);

  useEffect(() => {
    const t = setTimeout(() => fetchLeads(1), 300);
    return () => clearTimeout(t);
  }, [fetchLeads]);

  useEffect(() => {
    fetch('/api/campaigns')
      .then((r) => r.json())
      .then((data) => {
        const rows = (data.campaigns ?? []) as { _id: string; name: string }[];
        setCampaigns(rows.map((c) => ({ _id: c._id, name: c.name })));
      })
      .catch(() => {});
  }, []);

  const countries = [...new Set(leads.map((l) => l.country).filter(Boolean))].sort();
  const categories = [...new Set(leads.map((l) => l.category).filter(Boolean))].sort();

  const hasFilters = search || countryFilter || categoryFilter || fromDate || toDate || fromTime || toTime;

  const clearFilters = () => {
    setSearch('');
    setCountryFilter('');
    setCategoryFilter('');
    setFromDate('');
    setToDate('');
    setFromTime('');
    setToTime('');
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectVisible = () => setSelectedIds(new Set(leads.map((l) => l._id)));
  const clearSelection = () => setSelectedIds(new Set());

  const assignToCampaign = async () => {
    if (selectedIds.size === 0) {
      setAssignResult({ error: 'Select at least one lead' });
      return;
    }
    if (!selectedCampaignId) {
      setAssignResult({ error: 'Select a campaign' });
      return;
    }
    setAssigning(true);
    setAssignResult(null);
    try {
      const res = await fetch('/api/leads/no-reply/assign-campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadIds: [...selectedIds], campaignId: selectedCampaignId }),
      });
      const data = await res.json() as { error?: string; message?: string };
      if (!res.ok) {
        setAssignResult({ error: data.error ?? 'Failed to assign no-reply leads' });
      } else {
        setAssignResult({ ok: true, message: data.message });
        setSelectedIds(new Set());
        fetchLeads(page);
      }
    } catch {
      setAssignResult({ error: 'Network error — please try again' });
    } finally {
      setAssigning(false);
    }
  };

  return (
    <AppShell>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">No Reply Leads</h1>
          <p className="text-slate-500 text-sm mt-1">
            {loading ? '—' : `${total.toLocaleString()} lead${total !== 1 ? 's' : ''} awaiting reply`}
          </p>
        </div>
        <button
          onClick={() => fetchLeads(page)}
          disabled={loading}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 px-3 py-2 rounded-xl border border-slate-200 hover:bg-white transition-colors disabled:opacity-40"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Info banner */}
      <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 mb-5 text-sm text-slate-600">
        <p className="font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
          <Archive size={13} className="text-slate-400" /> No-Reply Leads
        </p>
        <p>
          Leads that received a sent email with no reply. Select leads and add to a campaign for follow-up outreach.
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-100 rounded-2xl p-4 mb-4 shadow-sm space-y-3">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search company or email…"
              className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-700"
            />
          </div>
          <select
            value={countryFilter}
            onChange={(e) => setCountryFilter(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-700"
          >
            <option value="">All Countries</option>
            {countries.map((c) => (<option key={c} value={c}>{c}</option>))}
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-700"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (<option key={c} value={c}>{c}</option>))}
          </select>
        </div>

        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-slate-400 mb-1">From Date</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-700" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">From Time (UTC)</label>
            <input type="time" value={fromTime} onChange={(e) => setFromTime(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-700" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">To Date</label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-700" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">To Time (UTC)</label>
            <input type="time" value={toTime} onChange={(e) => setToTime(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-700" />
          </div>
          {hasFilters && (
            <button onClick={clearFilters}
              className="flex items-center gap-1.5 border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors">
              <X size={12} /> Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Selection + campaign assignment bar */}
      {!loading && leads.length > 0 && (
        <div className="bg-white border border-slate-100 rounded-2xl px-4 py-3 mb-4 shadow-sm flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <button onClick={selectVisible}
              className="text-xs font-medium text-emerald-600 hover:text-emerald-700 border border-emerald-200 rounded-lg px-2.5 py-1.5 hover:bg-emerald-50 transition-colors">
              Select visible
            </button>
            <button onClick={clearSelection} disabled={selectedIds.size === 0}
              className="text-xs font-medium text-slate-400 hover:text-slate-600 border border-slate-200 rounded-lg px-2.5 py-1.5 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              Clear
            </button>
            <span className="text-sm text-slate-500">
              {selectedIds.size > 0
                ? <span className="font-medium text-slate-700">{selectedIds.size} selected</span>
                : '0 selected'}
            </span>
          </div>

          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <select value={selectedCampaignId} onChange={(e) => setSelectedCampaignId(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-700">
              <option value="">Select campaign…</option>
              {campaigns.map((c) => (<option key={c._id} value={c._id}>{c.name}</option>))}
            </select>
            <button onClick={assignToCampaign}
              disabled={assigning || selectedIds.size === 0 || !selectedCampaignId}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors shadow-sm">
              {assigning ? 'Adding…' : 'Add to Campaign'}
            </button>
          </div>

          {assignResult?.ok && (
            <div className="w-full flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
              <CheckCircle size={13} /> {assignResult.message}
            </div>
          )}
          {assignResult?.error && (
            <div className="w-full flex items-center gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
              <AlertTriangle size={13} /> {assignResult.error}
            </div>
          )}
        </div>
      )}

      {/* Loading skeleton */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 border-b border-slate-50 animate-pulse last:border-0" />
          ))}
        </div>
      ) : leads.length === 0 ? (
        <div className="bg-white border border-slate-100 rounded-2xl py-20 text-center shadow-sm">
          <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4">
            <Archive size={24} className="text-slate-300" />
          </div>
          <p className="text-slate-500 font-medium mb-1">No active no-reply leads</p>
          <p className="text-slate-400 text-sm">Leads appear here after emails are sent and disappear once they reply.</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="w-10 px-4 py-3.5">
                    <input
                      type="checkbox"
                      checked={leads.length > 0 && leads.every((l) => selectedIds.has(l._id))}
                      onChange={(e) => e.target.checked ? selectVisible() : clearSelection()}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                  </th>
                  <th className="w-8 px-2 py-3.5" />
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Company</th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Country</th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Category</th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Email</th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Campaign</th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Last Emailed</th>
                  <th className="w-10 px-4 py-3.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {leads.map((lead) => {
                  const isExpanded = expandedId === lead._id;
                  const isSelected = selectedIds.has(lead._id);
                  const hasEmail = !!(lead.lastEmailSubject || lead.lastEmailBody);

                  return (
                    <Fragment key={lead._id}>
                      <tr
                        onClick={() => setExpandedId(isExpanded ? null : lead._id)}
                        className={`hover:bg-slate-50/70 transition-colors cursor-pointer select-none ${isSelected ? 'bg-emerald-50/40' : ''}`}
                      >
                        <td className="px-4 py-3.5" onClick={(e) => { e.stopPropagation(); toggleSelect(lead._id); }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(lead._id)}
                            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          />
                        </td>
                        <td className="px-2 py-3.5 text-slate-300">
                          {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="font-semibold text-slate-800">{lead.companyName}</div>
                          <div className="text-xs text-slate-400 mt-0.5">{lead.country} · {lead.category}</div>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1.5 text-slate-600">
                            <MapPin size={11} className="text-slate-400 shrink-0" />
                            {lead.country}
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1.5 text-slate-600">
                            <Tag size={11} className="text-slate-400 shrink-0" />
                            {lead.category}
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          {lead.email ? (
                            <div className="flex items-center gap-1.5 text-slate-600">
                              <Mail size={11} className="text-slate-400 shrink-0" />
                              <span className="text-xs truncate max-w-[180px]">{lead.email}</span>
                            </div>
                          ) : (
                            <span className="text-slate-200 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          {lead.campaignNames ? (
                            <span className="text-xs text-slate-500 truncate max-w-[160px] block">{lead.campaignNames}</span>
                          ) : (
                            <span className="text-slate-200 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          {(lead.lastSentAt ?? lead.archivedAt) ? (
                            <div className="flex items-center gap-1 text-slate-500 text-xs">
                              <Calendar size={11} />
                              {new Date((lead.lastSentAt ?? lead.archivedAt)!).toLocaleDateString()}
                            </div>
                          ) : (
                            <span className="text-slate-200 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <button
                            onClick={(e) => { e.stopPropagation(); router.push(`/leads/${lead.leadId}`); }}
                            className="p-1 rounded text-slate-300 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                            title="View lead"
                          >
                            <ExternalLink size={13} />
                          </button>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="bg-slate-50/50">
                          <td colSpan={9} className="px-6 pb-4 pt-0">
                            {hasEmail ? (
                              <div className="border border-slate-200 rounded-xl overflow-hidden mt-2">
                                <div className="bg-white px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
                                  <p className="text-sm font-medium text-slate-700">
                                    {lead.lastEmailSubject ?? '(No subject)'}
                                  </p>
                                  <span className="text-xs text-slate-400 shrink-0 ml-4">Last sent email</span>
                                </div>
                                <pre className="text-xs text-slate-600 whitespace-pre-wrap bg-white px-4 py-3 max-h-60 overflow-auto font-sans leading-relaxed">
                                  {lead.lastEmailBody ?? '(No body)'}
                                </pre>
                              </div>
                            ) : (
                              <p className="text-xs text-slate-400 mt-2 italic">No email content available for this lead.</p>
                            )}
                            <div className="mt-2 flex justify-end">
                              <button
                                onClick={() => router.push(`/leads/${lead.leadId}`)}
                                className="flex items-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-700 font-medium"
                              >
                                <ExternalLink size={11} /> View full lead & email history
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer + pagination */}
          <div className="px-4 py-3 border-t border-slate-50 flex items-center justify-between text-xs text-slate-400">
            <span>{total.toLocaleString()} lead{total !== 1 ? 's' : ''} awaiting reply</span>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button onClick={() => fetchLeads(page - 1)} disabled={page <= 1 || loading}
                  className="px-2.5 py-1 rounded border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  ‹ Prev
                </button>
                <span className="text-slate-500">Page {page} of {totalPages}</span>
                <button onClick={() => fetchLeads(page + 1)} disabled={page >= totalPages || loading}
                  className="px-2.5 py-1 rounded border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  Next ›
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
