'use client';

import { useEffect, useState, useCallback, useRef, type MouseEvent } from 'react';
import Link from 'next/link';
import AppShell from '@/components/layout/AppShell';
import StatusBadge from '@/components/ui/StatusBadge';
import ScoreBadge from '@/components/ui/ScoreBadge';
import LeadDrawer from '@/components/ui/LeadDrawer';
import { LeadRow, CampaignRow } from '@/types';
import {
  PlusCircle, Globe, Mail, Phone, Brain, Upload, CheckSquare, Square,
  ChevronDown, CheckCircle2, AlertCircle, Loader2, X, Users, Search,
  Filter, Archive, RotateCcw, Trash2, Download, Tag, ChevronRight,
  SlidersHorizontal, Info,
} from 'lucide-react';

const PAGE_SIZE = 100;

const STATUSES = [
  { value: '', label: 'All' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'warm', label: 'Warm' },
  { value: 'needs_review', label: 'Needs Review' },
  { value: 'new', label: 'New' },
  { value: 'low_priority', label: 'Low Priority' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'cold', label: 'Cold' },
  { value: 'rejected', label: 'Rejected' },
];

const PROVIDERS = [
  { value: '', label: 'All Providers' },
  { value: 'gmail', label: 'Gmail' },
  { value: 'yahoo', label: 'Yahoo' },
  { value: 'outlook', label: 'Outlook' },
  { value: 'hotmail', label: 'Hotmail' },
  { value: 'aol', label: 'AOL' },
  { value: 'custom', label: 'Custom Domain' },
];

const ALL_LEAD_STATUSES = [
  'new', 'qualified', 'needs_review', 'low_priority', 'contacted',
  'warm', 'cold', 'rejected', 'no_response', 'do_not_contact',
] as const;

function getPageRange(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const delta = 2;
  const range: number[] = [];
  for (let i = Math.max(2, current - delta); i <= Math.min(total - 1, current + delta); i++) range.push(i);
  const result: (number | '...')[] = [1];
  if (range[0] > 2) result.push('...');
  result.push(...range);
  if (range[range.length - 1] < total - 1) result.push('...');
  if (total > 1) result.push(total);
  return result;
}

type ConfirmDialogState = {
  title: string;
  message: string;
  count: number;
  onConfirm: () => Promise<void>;
  requireTyping?: string;
} | null;

export default function LeadsPage() {
  // Core data state
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Filter state
  const [statusFilter, setStatusFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [emailProvider, setEmailProvider] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [hasEmailFilter, setHasEmailFilter] = useState(false);
  const [hasPhoneFilter, setHasPhoneFilter] = useState(false);
  const [hasWebsiteFilter, setHasWebsiteFilter] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [tagFilter, setTagFilter] = useState('');
  const [availableTags, setAvailableTags] = useState<string[]>([]);

  // Selection state
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [allFilteredSelected, setAllFilteredSelected] = useState(false);

  // Campaign assignment
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [targetCampaignId, setTargetCampaignId] = useState('');

  // Bulk action state
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(null);
  const [confirmTyped, setConfirmTyped] = useState('');
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [showAddTags, setShowAddTags] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [showChangeStatus, setShowChangeStatus] = useState(false);

  // Drawer
  const [drawerLeadId, setDrawerLeadId] = useState<string | null>(null);

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => setDebouncedSearch(search), 350);
    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); };
  }, [search]);

  const buildParams = useCallback((page = 1) => {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(page) });
    if (statusFilter) params.set('status', statusFilter);
    if (fromDate) params.set('fromDate', fromDate);
    if (toDate) params.set('toDate', toDate);
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (emailProvider) params.set('emailProvider', emailProvider);
    if (showArchived) params.set('archived', 'only');
    if (hasEmailFilter) params.set('hasEmail', 'true');
    if (hasPhoneFilter) params.set('hasPhone', 'true');
    if (hasWebsiteFilter) params.set('hasWebsite', 'true');
    if (tagFilter) params.set('tags', tagFilter);
    return params;
  }, [statusFilter, fromDate, toDate, debouncedSearch, emailProvider, showArchived, hasEmailFilter, hasPhoneFilter, hasWebsiteFilter, tagFilter]);

  const fetchLeads = useCallback((page = 1) => {
    setLoading(true);
    setAllFilteredSelected(false);
    fetch(`/api/leads?${buildParams(page)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else {
          setLeads(data.leads ?? []);
          setTotal(data.total ?? 0);
          setTotalPages(data.totalPages ?? 1);
        }
      })
      .catch(() => setError('Failed to load leads'))
      .finally(() => setLoading(false));
  }, [buildParams]);

  useEffect(() => {
    setCurrentPage(1);
    setSelected(new Set());
    setLastSelectedIndex(null);
    fetchLeads(1);
  }, [statusFilter, fromDate, toDate, debouncedSearch, emailProvider, showArchived, hasEmailFilter, hasPhoneFilter, hasWebsiteFilter, tagFilter, fetchLeads]);

  useEffect(() => {
    fetchLeads(currentPage);
  }, [currentPage, fetchLeads]);

  useEffect(() => {
    fetch('/api/campaigns').then((r) => r.json()).then((d) => setCampaigns(d.campaigns ?? []));
    fetch('/api/leads/tags').then((r) => r.json()).then((d) => setAvailableTags((d.tags ?? []).map((t: { tag: string }) => t.tag)));
  }, []);

  const allPageSelected = leads.length > 0 && selected.size === leads.length;
  const someSelected = selected.size > 0 && !allPageSelected;

  const toggleAll = () => {
    if (allPageSelected) { setSelected(new Set()); setAllFilteredSelected(false); }
    else setSelected(new Set(leads.map((l) => l._id)));
  };

  const toggleOne = (id: string, index: number, e: MouseEvent) => {
    if (e.shiftKey && lastSelectedIndex !== null) {
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      const next = new Set(selected);
      const adding = !selected.has(id);
      leads.slice(start, end + 1).forEach((l) => { if (adding) next.add(l._id); else next.delete(l._id); });
      setSelected(next);
    } else {
      const next = new Set(selected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setSelected(next);
    }
    setLastSelectedIndex(index);
    setAllFilteredSelected(false);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    setSelected(new Set());
    setLastSelectedIndex(null);
    setAllFilteredSelected(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const filterReset = () => {
    setCurrentPage(1); setSelected(new Set()); setLastSelectedIndex(null); setAllFilteredSelected(false);
  };

  // Returns IDs to operate on (or null = use server-side filter)
  const getOperationIds = (): string[] | null => {
    if (allFilteredSelected) return null;
    return [...selected];
  };

  const doBulkAction = async (action: string, extra?: Record<string, unknown>) => {
    const ids = getOperationIds();
    if (ids !== null && ids.length === 0) {
      setBulkResult({ type: 'error', message: 'No leads selected.' });
      return;
    }
    setBulkLoading(true);
    setBulkResult(null);
    try {
      const res = await fetch('/api/leads/bulk-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ids: ids ?? [...selected], ...extra }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Action failed');
      setBulkResult({ type: 'success', message: `${data.modified ?? data.matched ?? 0} leads ${action === 'archive' ? 'archived' : action === 'restore' ? 'restored' : action === 'delete' ? 'deleted' : 'updated'}.` });
      setSelected(new Set());
      setAllFilteredSelected(false);
      fetchLeads(currentPage);
    } catch (err) {
      setBulkResult({ type: 'error', message: err instanceof Error ? err.message : 'Action failed' });
    } finally {
      setBulkLoading(false);
    }
  };

  const doExport = () => {
    const params = buildParams(1);
    params.delete('page');
    params.delete('limit');
    const ids = getOperationIds();
    if (ids !== null && ids.length > 0) params.set('ids', ids.join(','));
    window.open(`/api/leads/export?${params}`, '_blank');
    setBulkResult({ type: 'success', message: 'Export started — check your downloads.' });
  };

  const doAddToCampaign = async () => {
    if (!targetCampaignId) { setBulkResult({ type: 'error', message: 'Please select a campaign first.' }); return; }
    const ids = [...selected];
    if (ids.length === 0) { setBulkResult({ type: 'error', message: 'No leads selected.' }); return; }
    setBulkLoading(true);
    setBulkResult(null);
    try {
      const res = await fetch(`/api/campaigns/${targetCampaignId}/leads/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadIds: ids }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to add leads.');
      setBulkResult({
        type: 'success',
        message: `${data.added} lead${data.added !== 1 ? 's' : ''} added to campaign.${data.skipped > 0 ? ` (${data.skipped} already in campaign)` : ''}`,
      });
      setSelected(new Set());
      setTargetCampaignId('');
    } catch (err) {
      setBulkResult({ type: 'error', message: err instanceof Error ? err.message : 'Network error.' });
    } finally {
      setBulkLoading(false);
    }
  };

  const showConfirm = (dialog: NonNullable<ConfirmDialogState>) => {
    setConfirmDialog(dialog);
    setConfirmTyped('');
  };

  const handleDrawerUpdate = (id: string, updates: Partial<LeadRow>) => {
    setLeads((prev) => prev.map((l) => l._id === id ? { ...l, ...updates } : l));
  };

  const activeFiltersCount = [statusFilter, fromDate || toDate, emailProvider, hasEmailFilter, hasPhoneFilter, hasWebsiteFilter, tagFilter, showArchived].filter(Boolean).length;

  return (
    <AppShell>
      {bulkLoading && <div className="fixed inset-0 z-50" aria-hidden />}

      {/* Lead detail drawer */}
      <LeadDrawer
        leadId={drawerLeadId}
        onClose={() => setDrawerLeadId(null)}
        onUpdated={handleDrawerUpdate}
      />

      {/* Confirmation Dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4">
            <h3 className="font-bold text-slate-800 text-lg mb-2">{confirmDialog.title}</h3>
            <p className="text-slate-500 text-sm mb-3">{confirmDialog.message}</p>
            {confirmDialog.count > 0 && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-2.5 text-sm font-medium text-rose-700 mb-4">
                This will affect {confirmDialog.count.toLocaleString()} lead{confirmDialog.count !== 1 ? 's' : ''}.
              </div>
            )}
            {confirmDialog.requireTyping && (
              <div className="mb-4">
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                  Type <span className="font-mono font-bold text-rose-700">{confirmDialog.requireTyping}</span> to confirm:
                </label>
                <input
                  className="w-full border border-rose-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-rose-400"
                  value={confirmTyped}
                  onChange={(e) => setConfirmTyped(e.target.value)}
                  placeholder={confirmDialog.requireTyping}
                />
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-2 text-sm font-medium border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={
                  confirmLoading ||
                  (!!confirmDialog.requireTyping && confirmTyped !== confirmDialog.requireTyping)
                }
                onClick={async () => {
                  setConfirmLoading(true);
                  try { await confirmDialog.onConfirm(); }
                  finally { setConfirmLoading(false); setConfirmDialog(null); }
                }}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-rose-600 text-white rounded-xl hover:bg-rose-700 disabled:opacity-40 transition-colors"
              >
                {confirmLoading && <Loader2 size={13} className="animate-spin" />}
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Leads</h1>
          <p className="text-slate-500 text-sm mt-1">
            {loading ? '—' : `${total.toLocaleString()} leads`}
            {showArchived && <span className="ml-1 text-amber-500">(archived)</span>}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link
            href="/leads/cleanup"
            className="flex items-center gap-2 border border-slate-200 text-slate-600 px-3.5 py-2 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            <SlidersHorizontal size={14} />
            Cleanup
          </Link>
          <Link
            href="/leads/analytics"
            className="flex items-center gap-2 border border-slate-200 text-slate-600 px-3.5 py-2 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            <ChevronRight size={14} />
            Analytics
          </Link>
          <Link
            href="/leads/import"
            className="flex items-center gap-2 border border-slate-200 text-slate-600 px-3.5 py-2 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            <Upload size={14} />
            Import CSV
          </Link>
          <Link
            href="/leads/new"
            className="flex items-center gap-2 bg-emerald-600 text-white px-3.5 py-2 rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors shadow-sm"
          >
            <PlusCircle size={14} />
            Add Lead
          </Link>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search company, email, website, phone, city, country…"
          className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white shadow-sm placeholder:text-slate-400"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Status filter pills + filter toggle */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="flex flex-wrap gap-1.5 flex-1">
          {STATUSES.map((s) => (
            <button
              key={s.value}
              onClick={() => { setStatusFilter(s.value); filterReset(); }}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
                statusFilter === s.value
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowFilters((v) => !v)}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium border transition-colors shrink-0 ${
            showFilters || activeFiltersCount > 0
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Filter size={12} />
          Filters
          {activeFiltersCount > 0 && (
            <span className="bg-emerald-600 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
              {activeFiltersCount}
            </span>
          )}
        </button>
      </div>

      {/* Advanced filter panel */}
      {showFilters && (
        <div className="bg-white border border-slate-100 rounded-2xl p-4 mb-4 shadow-sm">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {/* Date from */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">From</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => { setFromDate(e.target.value); filterReset(); }}
                className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            {/* Date to */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">To</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => { setToDate(e.target.value); filterReset(); }}
                className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            {/* Email provider */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Email Provider</label>
              <select
                value={emailProvider}
                onChange={(e) => { setEmailProvider(e.target.value); filterReset(); }}
                className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            {/* Tag filter */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Tag</label>
              <select
                value={tagFilter}
                onChange={(e) => { setTagFilter(e.target.value); filterReset(); }}
                className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">All Tags</option>
                {availableTags.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          {/* Toggles row */}
          <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t border-slate-100">
            {[
              { label: 'Show Archived', value: showArchived, set: (v: boolean) => { setShowArchived(v); filterReset(); } },
              { label: 'Has Email', value: hasEmailFilter, set: (v: boolean) => { setHasEmailFilter(v); filterReset(); } },
              { label: 'Has Phone', value: hasPhoneFilter, set: (v: boolean) => { setHasPhoneFilter(v); filterReset(); } },
              { label: 'Has Website', value: hasWebsiteFilter, set: (v: boolean) => { setHasWebsiteFilter(v); filterReset(); } },
            ].map(({ label, value, set }) => (
              <label key={label} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={value}
                  onChange={(e) => set(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-sm text-slate-600">{label}</span>
              </label>
            ))}
            {(fromDate || toDate || emailProvider || hasEmailFilter || hasPhoneFilter || hasWebsiteFilter || tagFilter || showArchived) && (
              <button
                onClick={() => {
                  setFromDate(''); setToDate(''); setEmailProvider(''); setHasEmailFilter(false);
                  setHasPhoneFilter(false); setHasWebsiteFilter(false); setTagFilter(''); setShowArchived(false);
                  filterReset();
                }}
                className="flex items-center gap-1 text-xs text-rose-500 hover:text-rose-700 font-medium ml-auto"
              >
                <X size={11} /> Clear all filters
              </button>
            )}
          </div>
        </div>
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="bg-slate-800 text-white rounded-2xl p-3 mb-4">
          {/* Selection info row */}
          <div className="flex items-center gap-3 mb-2.5">
            <span className="text-sm font-medium">
              {allFilteredSelected ? `All ${total.toLocaleString()} filtered leads` : `${selected.size} selected`}
            </span>
            {!allFilteredSelected && allPageSelected && total > leads.length && (
              <button
                onClick={() => setAllFilteredSelected(true)}
                className="text-xs text-emerald-300 hover:text-emerald-200 underline"
              >
                Select all {total.toLocaleString()} filtered leads
              </button>
            )}
            {allFilteredSelected && (
              <button
                onClick={() => { setAllFilteredSelected(false); setSelected(new Set()); }}
                className="text-xs text-slate-400 hover:text-white underline"
              >
                Deselect
              </button>
            )}
            <button
              onClick={() => { setSelected(new Set()); setAllFilteredSelected(false); setBulkResult(null); setLastSelectedIndex(null); }}
              className="ml-auto text-slate-400 hover:text-white p-1 transition-colors"
            >
              <X size={15} />
            </button>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            {/* Archive */}
            <button
              onClick={() => showConfirm({
                title: 'Archive Leads',
                message: 'Archived leads will be hidden from the main list but never deleted.',
                count: allFilteredSelected ? total : selected.size,
                onConfirm: () => doBulkAction('archive'),
              })}
              disabled={bulkLoading}
              className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40"
            >
              <Archive size={12} /> Archive
            </button>

            {/* Restore */}
            <button
              onClick={() => showConfirm({
                title: 'Restore Leads',
                message: 'Selected leads will be restored to active status.',
                count: allFilteredSelected ? total : selected.size,
                onConfirm: () => doBulkAction('restore'),
              })}
              disabled={bulkLoading}
              className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40"
            >
              <RotateCcw size={12} /> Restore
            </button>

            {/* Delete */}
            <button
              onClick={() => showConfirm({
                title: 'Delete Leads',
                message: 'This permanently deletes selected leads. Consider archiving instead.',
                count: allFilteredSelected ? total : selected.size,
                onConfirm: () => doBulkAction('delete', { confirm: 'CONFIRM_DELETE' }),
              })}
              disabled={bulkLoading}
              className="flex items-center gap-1.5 bg-rose-500 hover:bg-rose-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40"
            >
              <Trash2 size={12} /> Delete
            </button>

            {/* Export CSV */}
            <button
              onClick={doExport}
              disabled={bulkLoading}
              className="flex items-center gap-1.5 bg-slate-600 hover:bg-slate-500 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40"
            >
              <Download size={12} /> Export CSV
            </button>

            {/* Add Tags */}
            <div className="relative">
              <button
                onClick={() => { setShowAddTags((v) => !v); setShowChangeStatus(false); }}
                disabled={bulkLoading}
                className="flex items-center gap-1.5 bg-violet-500 hover:bg-violet-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40"
              >
                <Tag size={12} /> Add Tags
              </button>
              {showAddTags && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg p-3 z-20 min-w-[220px]">
                  <div className="flex gap-2 mb-2">
                    <input
                      className="flex-1 border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-800"
                      placeholder="Tag name…"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (tagInput.trim()) {
                            doBulkAction('add-tags', { tags: [tagInput.trim()] });
                            setTagInput('');
                            setShowAddTags(false);
                          }
                        }
                      }}
                    />
                    <button
                      onClick={() => {
                        if (tagInput.trim()) {
                          doBulkAction('add-tags', { tags: [tagInput.trim()] });
                          setTagInput('');
                          setShowAddTags(false);
                        }
                      }}
                      className="px-2.5 py-1.5 bg-violet-600 text-white rounded-lg text-xs font-medium"
                    >
                      Add
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {['Pharma', 'VIP', 'High Priority', 'Hot', 'Warm', 'Cold'].map((t) => (
                      <button
                        key={t}
                        onClick={() => {
                          doBulkAction('add-tags', { tags: [t] });
                          setShowAddTags(false);
                        }}
                        className="px-2 py-0.5 text-xs border border-slate-200 rounded-full text-slate-600 hover:bg-slate-50"
                      >
                        + {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Change Status */}
            <div className="relative">
              <button
                onClick={() => { setShowChangeStatus((v) => !v); setShowAddTags(false); }}
                disabled={bulkLoading}
                className="flex items-center gap-1.5 bg-slate-600 hover:bg-slate-500 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40"
              >
                <ChevronDown size={12} /> Status
              </button>
              {showChangeStatus && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg p-2 z-20 min-w-[180px]">
                  {ALL_LEAD_STATUSES.map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        showConfirm({
                          title: `Change Status to "${s.replace(/_/g, ' ')}"`,
                          message: 'This will update the status for all selected leads.',
                          count: allFilteredSelected ? total : selected.size,
                          onConfirm: () => doBulkAction('change-status', { status: s }),
                        });
                        setShowChangeStatus(false);
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 rounded-lg capitalize transition-colors"
                    >
                      {s.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Add to Campaign */}
            <div className="flex items-center gap-2 ml-auto">
              <select
                value={targetCampaignId}
                onChange={(e) => setTargetCampaignId(e.target.value)}
                className="border border-slate-600 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-700 text-white"
              >
                <option value="">Select campaign…</option>
                {campaigns.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
              </select>
              <button
                onClick={doAddToCampaign}
                disabled={bulkLoading || !targetCampaignId}
                className="flex items-center gap-1.5 bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-emerald-600 transition-colors disabled:opacity-40"
              >
                {bulkLoading ? <Loader2 size={12} className="animate-spin" /> : <ChevronDown size={12} />}
                Add to Campaign
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk result */}
      {bulkResult && (
        <div className={`flex items-center gap-2 text-sm px-4 py-3 rounded-xl border mb-4 ${
          bulkResult.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-700'
        }`}>
          {bulkResult.type === 'success' ? <CheckCircle2 size={14} className="shrink-0" /> : <AlertCircle size={14} className="shrink-0" />}
          {bulkResult.message}
          <button onClick={() => setBulkResult(null)} className="ml-auto opacity-50 hover:opacity-100"><X size={13} /></button>
        </div>
      )}

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-700 text-sm mb-4">{error}</div>
      )}

      {/* Table */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-14 border-b border-slate-50 animate-pulse bg-white last:border-0" />
          ))}
        </div>
      ) : leads.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4">
            <Users size={24} className="text-slate-300" />
          </div>
          <p className="text-slate-500 font-medium mb-1">No leads found</p>
          <p className="text-slate-400 text-sm mb-4">
            {statusFilter ? `No leads with status "${statusFilter.replace(/_/g, ' ')}"` : 'No leads match the current filters'}
          </p>
          <Link href="/leads/new" className="inline-flex items-center gap-1.5 text-emerald-600 font-medium text-sm hover:text-emerald-700">
            <PlusCircle size={14} /> Add your first lead
          </Link>
        </div>
      ) : (
        <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-4 py-3.5 w-10">
                    <button onClick={toggleAll} className="text-slate-300 hover:text-slate-600 transition-colors">
                      {allPageSelected ? <CheckSquare size={16} className="text-emerald-500" /> : someSelected ? <CheckSquare size={16} className="text-emerald-300" /> : <Square size={16} />}
                    </button>
                  </th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Company</th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Location</th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Category</th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Contact</th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Score</th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {leads.map((lead, index) => (
                  <tr
                    key={lead._id}
                    className={`hover:bg-slate-50/70 transition-colors ${selected.has(lead._id) ? 'bg-emerald-50/50' : ''} ${lead.archived ? 'opacity-70' : ''}`}
                  >
                    <td className="px-4 py-3.5">
                      <button onClick={(e) => toggleOne(lead._id, index, e)} className="text-slate-300 hover:text-slate-600 transition-colors">
                        {selected.has(lead._id) ? <CheckSquare size={16} className="text-emerald-500" /> : <Square size={16} />}
                      </button>
                    </td>
                    <td className="px-4 py-3.5">
                      <Link href={`/leads/${lead._id}`} className="font-semibold text-slate-800 hover:text-emerald-600 transition-colors">
                        {lead.companyName}
                      </Link>
                      {lead.archived && (
                        <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-600 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded-full">
                          <Archive size={8} /> archived
                        </span>
                      )}
                      {lead.source && <div className="text-xs text-slate-400 mt-0.5">via {lead.source}</div>}
                      {Array.isArray(lead.tags) && lead.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {lead.tags.slice(0, 3).map((t) => (
                            <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-600 border border-violet-100">
                              {t}
                            </span>
                          ))}
                          {lead.tags.length > 3 && (
                            <span className="text-[10px] text-slate-400">+{lead.tags.length - 3}</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-slate-600">
                      <div className="font-medium">{lead.country}</div>
                      {lead.city && <div className="text-xs text-slate-400 mt-0.5">{lead.city}</div>}
                    </td>
                    <td className="px-4 py-3.5 text-slate-600 capitalize text-sm">{lead.category}</td>
                    <td className="px-4 py-3.5">
                      <div className="space-y-0.5">
                        {lead.email && (
                          <div className="flex items-center gap-1.5 text-slate-600">
                            <Mail size={11} className="text-slate-400 shrink-0" />
                            <span className="text-xs truncate max-w-[160px]">{lead.email}</span>
                          </div>
                        )}
                        {lead.phone && (
                          <div className="flex items-center gap-1.5 text-slate-600">
                            <Phone size={11} className="text-slate-400 shrink-0" />
                            <span className="text-xs">{lead.phone}</span>
                          </div>
                        )}
                        {lead.website && (
                          <div className="flex items-center gap-1.5 text-slate-600">
                            <Globe size={11} className="text-slate-400 shrink-0" />
                            <span className="text-xs truncate max-w-[140px]">{lead.website}</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={lead.status} />
                    </td>
                    <td className="px-4 py-3.5">
                      <ScoreBadge score={lead.score} />
                    </td>
                    <td className="px-4 py-3.5">
                      <button
                        onClick={() => setDrawerLeadId(lead._id)}
                        className="text-slate-300 hover:text-emerald-500 transition-colors"
                        title="View details"
                      >
                        <Info size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="px-4 py-3.5 border-t border-slate-100 flex items-center justify-between gap-4 flex-wrap">
            <span className="text-xs text-slate-400">
              {total === 0 ? 'No leads' : (
                <>
                  Showing{' '}
                  <span className="font-medium text-slate-600">
                    {((currentPage - 1) * PAGE_SIZE + 1).toLocaleString()}–{Math.min(currentPage * PAGE_SIZE, total).toLocaleString()}
                  </span>
                  {' '}of{' '}
                  <span className="font-medium text-slate-600">{total.toLocaleString()}</span>
                  {' '}leads
                </>
              )}
            </span>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  ← Previous
                </button>
                {getPageRange(currentPage, totalPages).map((p, i) =>
                  p === '...' ? (
                    <span key={`e-${i}`} className="px-1.5 text-slate-400 text-xs select-none">…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => handlePageChange(p as number)}
                      className={`min-w-[2rem] h-8 px-1.5 rounded-lg text-xs font-medium transition-colors ${
                        p === currentPage ? 'bg-slate-800 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {p}
                    </button>
                  )
                )}
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next →
                </button>
              </div>
            )}
          </div>
        </div>
      )}

    </AppShell>
  );
}
