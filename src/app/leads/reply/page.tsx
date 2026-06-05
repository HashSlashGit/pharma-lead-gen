'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import AppShell from '@/components/layout/AppShell';
import { Inbox, ChevronRight, RefreshCw, AlertCircle, CheckCircle2, MessageSquare } from 'lucide-react';
import { type ReplyRow } from '@/types';

const FILTERS = [
  { key: 'all',               label: 'All' },
  { key: 'needs_review',      label: 'Needs Review' },
  { key: 'awaiting_approval', label: 'Draft Ready' },
  { key: 'interested',        label: 'Interested' },
  { key: 'not_interested',    label: 'Not Interested' },
  { key: 'handled',           label: 'Handled' },
];

const CLASSIFICATION_STYLES: Record<string, string> = {
  interested:         'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  pricing_query:      'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  certificate_query:  'bg-violet-50 text-violet-700 ring-1 ring-violet-200',
  shipping_query:     'bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200',
  not_interested:     'bg-slate-50 text-slate-500 ring-1 ring-slate-200',
  do_not_contact:     'bg-rose-50 text-rose-600 ring-1 ring-rose-200',
  out_of_office:      'bg-slate-50 text-slate-500 ring-1 ring-slate-200',
  needs_review:       'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  unclassified:       'bg-amber-50 text-amber-600 ring-1 ring-amber-200',
};

const CLASSIFICATION_LABELS: Record<string, string> = {
  interested:         'Interested',
  pricing_query:      'Pricing Query',
  certificate_query:  'Certificate Query',
  shipping_query:     'Shipping Query',
  not_interested:     'Not Interested',
  do_not_contact:     'Do Not Contact',
  out_of_office:      'Out of Office',
  needs_review:       'Needs Review',
  unclassified:       'Unclassified',
};

const SOURCE_LABELS: Record<string, string> = {
  webhook:          'Webhook',
  smartlead_sync:   'Smartlead',
  mailbox_sync:     'Mailbox',
  manual:           'Manual',
  gmail:            'Gmail',
};

const STATUS_STYLES: Record<string, string> = {
  pending:         'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  draft_generated: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  draft_approved:  'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  draft_rejected:  'bg-rose-50 text-rose-600 ring-1 ring-rose-200',
  handled:         'bg-slate-50 text-slate-500 ring-1 ring-slate-200',
};

const STATUS_LABELS: Record<string, string> = {
  pending:         'Pending',
  draft_generated: 'Draft Ready',
  draft_approved:  'Sent',
  draft_rejected:  'Rejected',
  handled:         'Handled',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

interface SyncResult {
  success:      boolean;
  checked:      number;
  created:      number;
  duplicates:   number;
  skippedNoLead: number;
  errors:       string[];
  message:      string;
}

export default function ReplyInboxPage() {
  const [activeFilter, setActiveFilter] = useState('all');
  const [replies, setReplies]           = useState<ReplyRow[]>([]);
  const [total, setTotal]               = useState(0);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');

  const leadReplyCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of replies) {
      const key = r.lead?.companyName ?? r.leadId;
      if (key) map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [replies]);

  const [syncing, setSyncing]       = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  const fetchReplies = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res  = await fetch(`/api/replies?filter=${activeFilter}&limit=50`);
      const data = await res.json();
      if (data.error) setError(data.error);
      else {
        setReplies(data.replies ?? []);
        setTotal(data.total ?? 0);
      }
    } catch {
      setError('Failed to load replies');
    } finally {
      setLoading(false);
    }
  }, [activeFilter]);

  useEffect(() => { fetchReplies(); }, [fetchReplies]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res  = await fetch('/api/gmail/sync', { method: 'POST' });
      const data = (await res.json()) as SyncResult;
      setSyncResult(data);
      if (data.success) {
        await fetchReplies();
      }
    } catch {
      setSyncResult({
        success: false,
        message: 'Sync request failed — check network and try again.',
        checked: 0, created: 0, duplicates: 0, skippedNoLead: 0, errors: [],
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <AppShell>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center">
              <Inbox size={18} className="text-violet-600" />
            </span>
            Reply Inbox
          </h1>
          <p className="text-slate-500 text-sm mt-1.5 ml-0.5">
            Inbound replies — review, draft responses, and approve before sending.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchReplies}
            disabled={loading}
            className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 px-3 py-2 rounded-xl border border-slate-200 hover:bg-white transition-colors disabled:opacity-40"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl text-sm font-medium transition-colors shadow-sm"
          >
            <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing…' : 'Sync Gmail'}
          </button>
        </div>
      </div>

      {/* Sync results */}
      {syncResult?.success && (
        <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 text-sm text-emerald-800 mb-5">
          <CheckCircle2 size={15} className="shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">{syncResult.message}</span>
            <span className="text-emerald-600 ml-1">
              · {syncResult.skippedNoLead} unmatched · {syncResult.duplicates} duplicate{syncResult.duplicates !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      )}

      {syncResult && !syncResult.success && (
        <div className="flex items-start gap-3 bg-rose-50 border border-rose-200 rounded-2xl px-4 py-3 text-sm text-rose-700 mb-5">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Sync failed:</span> {syncResult.message}
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex flex-wrap items-center gap-1.5 mb-6">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setActiveFilter(f.key)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
              activeFilter === f.key
                ? 'bg-slate-800 text-white shadow-sm'
                : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            {f.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-slate-400 font-medium">{total} total</span>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-700 text-sm mb-4">
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-100 h-24 animate-pulse shadow-sm" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && replies.length === 0 && (
        <div className="bg-white border border-slate-100 rounded-2xl p-16 text-center shadow-sm">
          <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4">
            <MessageSquare size={24} className="text-slate-300" />
          </div>
          <p className="text-slate-500 font-medium mb-1">No replies in this view</p>
          <p className="text-slate-400 text-sm">Replies are captured from Gmail, Smartlead, and mailbox sync.</p>
        </div>
      )}

      {/* Reply list */}
      {!loading && replies.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden divide-y divide-slate-50">
          {replies.map((reply) => {
            const replyCountForLead = leadReplyCount.get(reply.lead?.companyName ?? reply.leadId) ?? 1;
            const clsStyle = reply.classification
              ? (CLASSIFICATION_STYLES[reply.classification] ?? 'bg-slate-50 text-slate-500 ring-1 ring-slate-200')
              : null;
            const clsLabel = reply.classification
              ? (CLASSIFICATION_LABELS[reply.classification] ?? reply.classification.replace(/_/g, ' '))
              : null;

            return (
              <Link
                key={reply._id}
                href={`/replies/${reply._id}`}
                className="flex items-start gap-4 px-5 py-4 hover:bg-slate-50/70 transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  {/* Company + meta */}
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-semibold text-slate-800 truncate">
                      {reply.lead?.companyName ?? 'Unknown company'}
                    </span>
                    {replyCountForLead > 1 && (
                      <span className="inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-violet-50 text-violet-700 ring-1 ring-violet-200 shrink-0">
                        {replyCountForLead} replies
                      </span>
                    )}
                    {reply.lead?.email && (
                      <span className="text-xs text-slate-400 truncate">{reply.lead.email}</span>
                    )}
                  </div>

                  {/* Body preview */}
                  <p className="text-sm text-slate-500 line-clamp-2 mb-2">
                    {reply.body.slice(0, 160)}{reply.body.length > 160 ? '…' : ''}
                  </p>

                  {/* Badges */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {clsStyle && clsLabel && (
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-medium ${clsStyle}`}>
                        {clsLabel}
                      </span>
                    )}
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-medium ${STATUS_STYLES[reply.status] ?? 'bg-slate-50 text-slate-500 ring-1 ring-slate-200'}`}>
                      {STATUS_LABELS[reply.status] ?? reply.status}
                    </span>
                    {reply.needsApproval && reply.status === 'pending' && (
                      <span className="inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-rose-50 text-rose-600 ring-1 ring-rose-200">
                        Needs Review
                      </span>
                    )}
                    {reply.source && (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] text-slate-400">
                        via {SOURCE_LABELS[reply.source] ?? reply.source}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right meta */}
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span className="text-xs text-slate-400">{formatDate(reply.receivedAt ?? reply.createdAt)}</span>
                  {reply.lead?.score !== undefined && (
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      reply.lead.score >= 70 ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                      : reply.lead.score >= 40 ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                      : 'bg-slate-50 text-slate-500 ring-1 ring-slate-200'
                    }`}>
                      {reply.lead.score}
                    </span>
                  )}
                  <ChevronRight size={15} className="text-slate-300 group-hover:text-slate-500 transition-colors" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
