'use client';

import { useEffect, useState, useCallback } from 'react';
import AppShell from '@/components/layout/AppShell';
import { LeadAnalytics } from '@/types';
import { RefreshCw, TrendingUp, Users, Archive, Mail } from 'lucide-react';

function StatCard({ label, value, sub, icon }: { label: string; value: number; sub?: string; icon?: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex items-start gap-4">
      {icon && (
        <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center shrink-0">
          {icon}
        </div>
      )}
      <div>
        <p className="text-2xl font-bold text-slate-800 tabular-nums">{value.toLocaleString()}</p>
        <p className="text-sm font-medium text-slate-600 mt-0.5">{label}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function BarChart({ data, labelKey, valueKey, total, colorClass = 'bg-emerald-500' }: {
  data: Record<string, unknown>[];
  labelKey: string;
  valueKey: string;
  total: number;
  colorClass?: string;
}) {
  if (!data.length) return <p className="text-sm text-slate-400 py-4 text-center">No data</p>;
  return (
    <div className="space-y-2.5">
      {data.map((row, i) => {
        const label = String(row[labelKey] ?? '—');
        const count = Number(row[valueKey]) || 0;
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        return (
          <div key={i}>
            <div className="flex justify-between text-sm mb-1">
              <span className="font-medium text-slate-700 truncate max-w-[180px] capitalize">{label}</span>
              <span className="text-slate-400 shrink-0 ml-2">{count.toLocaleString()} <span className="text-slate-300">({pct}%)</span></span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full ${colorClass} rounded-full transition-all duration-700`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SparkLine({ data }: { data: Array<{ date: string; count: number }> }) {
  if (!data.length) return <p className="text-sm text-slate-400 py-4 text-center">No import data in the last 30 days</p>;
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="flex items-end gap-1 h-24">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center group relative" title={`${d.date}: ${d.count}`}>
          <div
            className="w-full bg-emerald-400 hover:bg-emerald-500 rounded-t transition-colors cursor-pointer"
            style={{ height: `${Math.round((d.count / max) * 100)}%`, minHeight: 2 }}
          />
          <div className="absolute bottom-full mb-1 hidden group-hover:block bg-slate-800 text-white text-[10px] rounded px-1.5 py-0.5 whitespace-nowrap z-10">
            {d.date}: {d.count}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function LeadAnalyticsPage() {
  const [data, setData] = useState<LeadAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/leads/analytics');
      const d = await res.json();
      if (!d.error) setData(d as LeadAnalytics);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Lead Analytics</h1>
          <p className="text-slate-500 text-sm mt-1">Overview of your lead database</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 border border-slate-200 text-slate-600 px-4 py-2 rounded-xl text-sm font-medium hover:bg-slate-50 disabled:opacity-40 transition-colors"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {loading || !data ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatCard
              label="Total Leads"
              value={data.total}
              icon={<Users size={20} className="text-slate-400" />}
            />
            <StatCard
              label="Active"
              value={data.active}
              sub="not archived"
              icon={<TrendingUp size={20} className="text-emerald-400" />}
            />
            <StatCard
              label="Archived"
              value={data.archived}
              sub="hidden from main list"
              icon={<Archive size={20} className="text-amber-400" />}
            />
            <StatCard
              label="No Email"
              value={data.noEmail}
              sub="cannot be emailed"
              icon={<Mail size={20} className="text-rose-400" />}
            />
            <StatCard label="Imported Today" value={data.today} />
            <StatCard label="Imported This Week" value={data.thisWeek} />
            <StatCard label="Imported This Month" value={data.thisMonth} />
            <StatCard label="With Email" value={data.total - data.noEmail} sub="have email addresses" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Imports per day (30d) */}
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-5">
              <h2 className="font-semibold text-slate-800 mb-1">Imports Last 30 Days</h2>
              <p className="text-xs text-slate-400 mb-4">Daily import volume</p>
              <SparkLine data={data.byDay} />
            </div>

            {/* By Provider */}
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-5">
              <h2 className="font-semibold text-slate-800 mb-1">Leads by Email Provider</h2>
              <p className="text-xs text-slate-400 mb-4">Distribution across email services</p>
              <BarChart
                data={data.byProvider}
                labelKey="provider"
                valueKey="count"
                total={data.total}
                colorClass="bg-violet-400"
              />
            </div>

            {/* By Status */}
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-5">
              <h2 className="font-semibold text-slate-800 mb-1">Leads by Status</h2>
              <p className="text-xs text-slate-400 mb-4">Current status distribution</p>
              <BarChart
                data={data.byStatus}
                labelKey="status"
                valueKey="count"
                total={data.total}
                colorClass="bg-emerald-400"
              />
            </div>

            {/* By Country */}
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-5">
              <h2 className="font-semibold text-slate-800 mb-1">Top Countries</h2>
              <p className="text-xs text-slate-400 mb-4">Active leads by country (top 10)</p>
              <BarChart
                data={data.byCountry}
                labelKey="country"
                valueKey="count"
                total={data.active}
                colorClass="bg-blue-400"
              />
            </div>

            {/* By Category */}
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-5 md:col-span-2">
              <h2 className="font-semibold text-slate-800 mb-1">Top Categories</h2>
              <p className="text-xs text-slate-400 mb-4">Active leads by industry/category (top 10)</p>
              <BarChart
                data={data.byCategory}
                labelKey="category"
                valueKey="count"
                total={data.active}
                colorClass="bg-amber-400"
              />
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}
