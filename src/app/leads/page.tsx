'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import AppShell from '@/components/layout/AppShell';
import StatusBadge from '@/components/ui/StatusBadge';
import ScoreBadge from '@/components/ui/ScoreBadge';
import { LeadRow, CampaignRow } from '@/types';
import {
  PlusCircle,
  Globe,
  Mail,
  Phone,
  Brain,
  Upload,
  CheckSquare,
  Square,
  ChevronDown,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Users,
} from 'lucide-react';

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

export default function LeadsPage() {
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [targetCampaignId, setTargetCampaignId] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchLeads = useCallback((status?: string, from?: string, to?: string) => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '100' });
    if (status) params.set('status', status);
    if (from) params.set('fromDate', from);
    if (to) params.set('toDate', to);
    fetch(`/api/leads?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else { setLeads(data.leads); setTotal(data.total); }
      })
      .catch(() => setError('Failed to load leads'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchLeads(statusFilter || undefined, fromDate || undefined, toDate || undefined);
  }, [statusFilter, fromDate, toDate, fetchLeads]);

  useEffect(() => {
    fetch('/api/campaigns')
      .then((r) => r.json())
      .then((d) => setCampaigns(d.campaigns ?? []));
  }, []);

  const allSelected = leads.length > 0 && selected.size === leads.length;
  const someSelected = selected.size > 0 && !allSelected;

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(leads.map((l) => l._id)));
  };

  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const handleAddToCampaign = async () => {
    if (!targetCampaignId) {
      setBulkResult({ type: 'error', message: 'Please select a campaign first.' });
      return;
    }
    if (selected.size === 0) {
      setBulkResult({ type: 'error', message: 'No leads selected.' });
      return;
    }
    setBulkLoading(true);
    setBulkResult(null);
    try {
      const res = await fetch(`/api/campaigns/${targetCampaignId}/leads/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadIds: [...selected] }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBulkResult({ type: 'error', message: data.error ?? 'Failed to add leads.' });
      } else {
        setBulkResult({
          type: 'success',
          message: `${data.added} lead${data.added !== 1 ? 's' : ''} added to campaign.${data.skipped > 0 ? ` (${data.skipped} already in campaign or not found)` : ''}`,
        });
        setSelected(new Set());
        setTargetCampaignId('');
      }
    } catch {
      setBulkResult({ type: 'error', message: 'Network error.' });
    } finally {
      setBulkLoading(false);
    }
  };

  return (
    <AppShell>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Leads</h1>
          <p className="text-slate-500 text-sm mt-1">
            {loading ? '—' : `${total.toLocaleString()} leads`}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/leads/import"
            className="flex items-center gap-2 border border-slate-200 text-slate-600 px-3.5 py-2 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            <Upload size={15} />
            Import CSV
          </Link>
          <Link
            href="/leads/new"
            className="flex items-center gap-2 bg-emerald-600 text-white px-3.5 py-2 rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors shadow-sm"
          >
            <PlusCircle size={15} />
            Add Lead
          </Link>
        </div>
      </div>

      {/* Filters row */}
      <div className="bg-white border border-slate-100 rounded-2xl p-4 mb-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
              From
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => { setFromDate(e.target.value); setSelected(new Set()); }}
              className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-700"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
              To
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => { setToDate(e.target.value); setSelected(new Set()); }}
              className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-700"
            />
          </div>
          {(fromDate || toDate) && (
            <button
              onClick={() => { setFromDate(''); setToDate(''); }}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 px-3 py-1.5 border border-slate-200 rounded-lg"
            >
              <X size={12} />
              Clear dates
            </button>
          )}
        </div>
      </div>

      {/* Status filter pills */}
      <div className="flex flex-wrap gap-1.5 mb-5">
        {STATUSES.map((s) => (
          <button
            key={s.value}
            onClick={() => { setStatusFilter(s.value); setSelected(new Set()); }}
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

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="bg-slate-800 text-white rounded-2xl p-3 mb-4 flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium pl-1">
            {selected.size} selected
          </span>
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <select
              value={targetCampaignId}
              onChange={(e) => setTargetCampaignId(e.target.value)}
              className="border border-slate-600 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-700 text-white"
            >
              <option value="">Select campaign…</option>
              {campaigns.map((c) => (
                <option key={c._id} value={c._id}>{c.name}</option>
              ))}
            </select>
            <button
              onClick={handleAddToCampaign}
              disabled={bulkLoading || !targetCampaignId}
              className="flex items-center gap-2 bg-emerald-500 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-emerald-600 transition-colors disabled:opacity-40"
            >
              {bulkLoading ? <Loader2 size={13} className="animate-spin" /> : <ChevronDown size={13} />}
              Add to Campaign
            </button>
            <button
              onClick={() => { setSelected(new Set()); setBulkResult(null); }}
              className="text-slate-400 hover:text-white p-1.5 transition-colors"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      )}

      {/* Bulk result */}
      {bulkResult && (
        <div className={`flex items-center gap-2 text-sm px-4 py-3 rounded-xl border mb-4 ${
          bulkResult.type === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-rose-50 border-rose-200 text-rose-700'
        }`}>
          {bulkResult.type === 'success'
            ? <CheckCircle2 size={14} className="shrink-0" />
            : <AlertCircle size={14} className="shrink-0" />}
          {bulkResult.message}
          <button onClick={() => setBulkResult(null)} className="ml-auto text-current opacity-50 hover:opacity-100">
            <X size={13} />
          </button>
        </div>
      )}

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-700 text-sm mb-4">
          {error}
        </div>
      )}

      {/* Loading skeleton */}
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
            {statusFilter ? `No leads with status "${statusFilter.replace(/_/g, ' ')}"` : 'Your leads database is empty'}
          </p>
          <Link href="/leads/new" className="inline-flex items-center gap-1.5 text-emerald-600 font-medium text-sm hover:text-emerald-700">
            <PlusCircle size={14} />
            Add your first lead
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
                      {allSelected ? (
                        <CheckSquare size={16} className="text-emerald-500" />
                      ) : someSelected ? (
                        <CheckSquare size={16} className="text-emerald-300" />
                      ) : (
                        <Square size={16} />
                      )}
                    </button>
                  </th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Company</th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Location</th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Category</th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Contact</th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Score</th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">AI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {leads.map((lead) => (
                  <tr
                    key={lead._id}
                    className={`hover:bg-slate-50/70 transition-colors ${selected.has(lead._id) ? 'bg-emerald-50/50' : ''}`}
                  >
                    <td className="px-4 py-3.5">
                      <button onClick={() => toggleOne(lead._id)} className="text-slate-300 hover:text-slate-600 transition-colors">
                        {selected.has(lead._id) ? (
                          <CheckSquare size={16} className="text-emerald-500" />
                        ) : (
                          <Square size={16} />
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3.5">
                      <Link href={`/leads/${lead._id}`} className="font-semibold text-slate-800 hover:text-emerald-600 transition-colors">
                        {lead.companyName}
                      </Link>
                      {lead.source && <div className="text-xs text-slate-400 mt-0.5">via {lead.source}</div>}
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
                      {lead.aiProcessed ? (
                        <span className="flex items-center gap-1 text-violet-600 text-xs font-medium">
                          <Brain size={12} /> Yes
                        </span>
                      ) : (
                        <span className="text-slate-200 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-slate-50 text-xs text-slate-400">
            Showing {leads.length} of {total.toLocaleString()} leads
          </div>
        </div>
      )}
    </AppShell>
  );
}
