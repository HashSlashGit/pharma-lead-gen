'use client';

import { useEffect, useState, useCallback } from 'react';
import AppShell from '@/components/layout/AppShell';
import { CleanupStats } from '@/types';
import {
  Archive, Trash2, RotateCcw, Users, Mail, Globe, CheckCircle2,
  AlertCircle, Loader2, X, RefreshCw, Copy,
} from 'lucide-react';

interface ConfirmState {
  title: string;
  description: string;
  operation: string;
  provider?: string;
  danger?: boolean;
  requireTyping?: string;
  affectedCount?: number;
}

function StatCard({ label, value, sub, color = 'slate' }: { label: string; value: number; sub?: string; color?: string }) {
  const colorMap: Record<string, string> = {
    slate:   'bg-slate-50 text-slate-700 border-slate-100',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    amber:   'bg-amber-50 text-amber-700 border-amber-100',
    rose:    'bg-rose-50 text-rose-700 border-rose-100',
    violet:  'bg-violet-50 text-violet-700 border-violet-100',
    blue:    'bg-blue-50 text-blue-700 border-blue-100',
  };
  return (
    <div className={`rounded-2xl border p-4 ${colorMap[color] ?? colorMap.slate}`}>
      <p className="text-2xl font-bold tabular-nums">{value.toLocaleString()}</p>
      <p className="text-sm font-medium mt-0.5">{label}</p>
      {sub && <p className="text-xs opacity-60 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function CleanupPage() {
  const [stats, setStats] = useState<CleanupStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [confirmTyped, setConfirmTyped] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/leads/cleanup/stats');
      const data = await res.json();
      if (!data.error) setStats(data as CleanupStats);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  const runOperation = async (operation: string, provider?: string) => {
    setRunning(true);
    setResult(null);
    try {
      const body: Record<string, string> = { operation };
      if (provider) body.provider = provider;
      if (confirm?.requireTyping) body.confirm = confirmTyped;
      else body.confirm = 'CONFIRM_DELETE';

      const res = await fetch('/api/leads/cleanup/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Operation failed');
      setResult({ type: 'success', message: `Done — ${data.affected} lead${data.affected !== 1 ? 's' : ''} affected.` });
      loadStats();
    } catch (err) {
      setResult({ type: 'error', message: err instanceof Error ? err.message : 'Operation failed' });
    } finally {
      setRunning(false);
      setConfirm(null);
      setConfirmTyped('');
    }
  };

  const openConfirm = (state: ConfirmState) => {
    setConfirm(state);
    setConfirmTyped('');
  };

  return (
    <AppShell>
      {/* Confirmation modal */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4">
            <h3 className={`font-bold text-lg mb-2 ${confirm.danger ? 'text-rose-700' : 'text-slate-800'}`}>
              {confirm.title}
            </h3>
            <p className="text-slate-500 text-sm mb-3">{confirm.description}</p>
            {confirm.affectedCount !== undefined && (
              <div className={`rounded-xl px-4 py-2.5 text-sm font-medium mb-4 ${
                confirm.danger
                  ? 'bg-rose-50 border border-rose-200 text-rose-700'
                  : 'bg-amber-50 border border-amber-200 text-amber-700'
              }`}>
                {confirm.affectedCount.toLocaleString()} lead{confirm.affectedCount !== 1 ? 's' : ''} will be affected.
              </div>
            )}
            {confirm.requireTyping && (
              <div className="mb-4">
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                  Type <span className="font-mono font-bold text-rose-700">{confirm.requireTyping}</span> to confirm:
                </label>
                <input
                  autoFocus
                  className="w-full border border-rose-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-rose-400"
                  value={confirmTyped}
                  onChange={(e) => setConfirmTyped(e.target.value)}
                  placeholder={confirm.requireTyping}
                />
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirm(null)}
                className="px-4 py-2 text-sm font-medium border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                disabled={running || (!!confirm.requireTyping && confirmTyped !== confirm.requireTyping)}
                onClick={() => runOperation(confirm.operation, confirm.provider)}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl text-white disabled:opacity-40 transition-colors ${
                  confirm.danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-amber-500 hover:bg-amber-600'
                }`}
              >
                {running && <Loader2 size={13} className="animate-spin" />}
                {confirm.danger ? 'Delete' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Lead Cleanup Center</h1>
          <p className="text-slate-500 text-sm mt-1">Manage, archive, and clean your lead database</p>
        </div>
        <button
          onClick={loadStats}
          disabled={loading}
          className="flex items-center gap-2 border border-slate-200 text-slate-600 px-4 py-2 rounded-xl text-sm font-medium hover:bg-slate-50 disabled:opacity-40 transition-colors"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Result banner */}
      {result && (
        <div className={`flex items-center gap-2 text-sm px-4 py-3 rounded-xl border mb-5 ${
          result.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'
        }`}>
          {result.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          {result.message}
          <button onClick={() => setResult(null)} className="ml-auto opacity-50 hover:opacity-100"><X size={13} /></button>
        </div>
      )}

      {/* Stats cards */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
          <StatCard label="Total Leads" value={stats.total} color="slate" />
          <StatCard label="Active" value={stats.active} sub="non-archived, active status" color="emerald" />
          <StatCard label="Archived" value={stats.archived} sub="hidden from main list" color="amber" />
          <StatCard label="No Email" value={stats.noEmail} sub="missing email address" color="rose" />
          <StatCard label="Duplicates" value={stats.duplicates} sub="extra copies (by email)" color="violet" />
          <StatCard label="Gmail" value={stats.gmail} sub="@gmail.com" color="slate" />
          <StatCard label="Yahoo" value={stats.yahoo} sub="@yahoo.*" color="slate" />
          <StatCard label="Outlook" value={stats.outlook} sub="@outlook / live / msn" color="slate" />
          <StatCard label="Hotmail" value={stats.hotmail} sub="@hotmail.*" color="slate" />
          <StatCard label="AOL" value={stats.aol} sub="@aol.com" color="slate" />
          <StatCard label="Custom Domain" value={stats.custom} sub="business / other domains" color="blue" />
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Safe actions */}
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-800">Safe Actions</h2>
            <p className="text-xs text-slate-400 mt-0.5">These archive or organize leads — no permanent data loss</p>
          </div>
          <div className="divide-y divide-slate-50">
            <ActionRow
              icon={<Archive size={16} className="text-amber-500" />}
              title="Archive Used Leads"
              description={`Archive leads with status: contacted, no_response, cold, rejected${stats ? ` (est. ${(stats.total - stats.active - stats.archived).toLocaleString()} leads)` : ''}`}
              onClick={() => openConfirm({
                title: 'Archive Used Leads',
                description: 'Leads with status contacted, no_response, cold, rejected, or do_not_contact will be archived. You can restore them at any time.',
                operation: 'archive-used',
                affectedCount: stats ? Math.max(0, stats.total - stats.active - stats.archived) : 0,
              })}
            />
            <ActionRow
              icon={<Copy size={16} className="text-violet-500" />}
              title="Remove Duplicates"
              description={`Find leads with the same email — keep highest score, archive the rest${stats ? ` (~${stats.duplicates} duplicates)` : ''}`}
              onClick={() => openConfirm({
                title: 'Remove Duplicate Leads',
                description: 'For each group of leads sharing an email address, the one with the highest score is kept active. All others are archived (not deleted).',
                operation: 'remove-duplicates',
                affectedCount: stats?.duplicates ?? 0,
              })}
            />
          </div>
        </div>

        {/* Provider cleanup */}
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-800">Delete by Provider</h2>
            <p className="text-xs text-slate-400 mt-0.5">Permanently deletes all leads from the selected email provider</p>
          </div>
          <div className="divide-y divide-slate-50">
            {[
              { provider: 'gmail',   label: 'Delete Gmail Leads',   count: stats?.gmail   ?? 0, icon: <Mail size={14} className="text-red-400" /> },
              { provider: 'yahoo',   label: 'Delete Yahoo Leads',   count: stats?.yahoo   ?? 0, icon: <Mail size={14} className="text-purple-400" /> },
              { provider: 'outlook', label: 'Delete Outlook Leads', count: stats?.outlook ?? 0, icon: <Mail size={14} className="text-blue-400" /> },
              { provider: 'hotmail', label: 'Delete Hotmail Leads', count: stats?.hotmail ?? 0, icon: <Mail size={14} className="text-sky-400" /> },
              { provider: 'aol',     label: 'Delete AOL Leads',     count: stats?.aol     ?? 0, icon: <Mail size={14} className="text-orange-400" /> },
            ].map(({ provider, label, count, icon }) => (
              <ActionRow
                key={provider}
                icon={icon}
                title={label}
                description={`${count.toLocaleString()} leads`}
                onClick={() => openConfirm({
                  title: label,
                  description: `Permanently deletes all leads with a ${provider} email address. This cannot be undone.`,
                  operation: `delete-${provider}`,
                  provider,
                  danger: true,
                  affectedCount: count,
                })}
              />
            ))}
          </div>
        </div>

        {/* Archive management */}
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-800">Archive Management</h2>
            <p className="text-xs text-slate-400 mt-0.5">Manage archived leads</p>
          </div>
          <div className="divide-y divide-slate-50">
            <ActionRow
              icon={<RotateCcw size={16} className="text-emerald-500" />}
              title="View Archived Leads"
              description={`${stats?.archived ?? 0} archived leads — click to view in main list`}
              href="/leads?archived=only"
            />
            <ActionRow
              icon={<Trash2 size={16} className="text-rose-500" />}
              title="Delete Archived Leads"
              description={`Permanently delete all ${stats?.archived ?? 0} archived leads`}
              onClick={() => openConfirm({
                title: 'Delete All Archived Leads',
                description: 'Permanently deletes all archived leads. This cannot be undone. Active leads are NOT affected.',
                operation: 'delete-archived',
                danger: true,
                affectedCount: stats?.archived ?? 0,
              })}
            />
            <ActionRow
              icon={<Trash2 size={16} className="text-rose-500" />}
              title="Delete Leads Without Email"
              description={`${stats?.noEmail ?? 0} leads have no email address`}
              onClick={() => openConfirm({
                title: 'Delete Leads Without Email',
                description: 'Permanently deletes all leads that have no email address. Since these cannot be contacted by email, they have no email to preserve.',
                operation: 'delete-no-email',
                danger: true,
                affectedCount: stats?.noEmail ?? 0,
              })}
            />
          </div>
        </div>

        {/* Danger zone */}
        <div className="bg-white border border-rose-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-rose-100 bg-rose-50">
            <h2 className="font-semibold text-rose-700 flex items-center gap-2">
              <AlertCircle size={16} /> Danger Zone
            </h2>
            <p className="text-xs text-rose-400 mt-0.5">Irreversible operations — proceed with extreme caution</p>
          </div>
          <div className="divide-y divide-rose-50">
            <ActionRow
              icon={<Trash2 size={16} className="text-rose-600" />}
              title="Clear All Leads"
              description={`Permanently deletes ALL ${stats?.total.toLocaleString() ?? 0} leads from the database`}
              danger
              onClick={() => openConfirm({
                title: 'Clear ALL Leads',
                description: 'This permanently deletes every lead in the database. There is no undo. Your campaigns and email logs will be orphaned. Only proceed if you are absolutely certain.',
                operation: 'clear-all',
                danger: true,
                requireTyping: 'DELETE ALL LEADS',
                affectedCount: stats?.total ?? 0,
              })}
            />
          </div>
        </div>
      </div>

      <div className="mt-6 bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex items-start gap-3">
        <CheckCircle2 size={18} className="text-emerald-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-emerald-800">Email Retention Policy</p>
          <p className="text-xs text-emerald-600 mt-0.5">
            All imported email addresses are preserved by default. Safe actions archive leads (reversible). Only Danger Zone actions permanently delete data.
          </p>
        </div>
      </div>
    </AppShell>
  );
}

function ActionRow({
  icon, title, description, onClick, href, danger,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick?: () => void;
  href?: string;
  danger?: boolean;
}) {
  const inner = (
    <div className={`flex items-center gap-3 px-5 py-3.5 group cursor-pointer transition-colors ${
      danger ? 'hover:bg-rose-50' : 'hover:bg-slate-50'
    }`}>
      <span className="shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${danger ? 'text-rose-700' : 'text-slate-700'}`}>{title}</p>
        <p className="text-xs text-slate-400 mt-0.5">{description}</p>
      </div>
      <Users size={13} className="text-slate-200 group-hover:text-slate-400 shrink-0 transition-colors" />
    </div>
  );

  if (href) {
    return <a href={href}>{inner}</a>;
  }
  return <button className="w-full text-left" onClick={onClick}>{inner}</button>;
}
