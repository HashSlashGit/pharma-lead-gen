'use client';

import { redirect } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import AppShell from '@/components/layout/AppShell';

// Dev/internal tool only — never exposed to clients in production
if (process.env.NODE_ENV === 'production') {
  redirect('/dashboard');
}
import {
  CheckSquare,
  Square,
  RefreshCw,
  Loader2,
  Rocket,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RotateCcw,
  ExternalLink,
} from 'lucide-react';
import Link from 'next/link';

interface ProductionCheckData {
  nodeEnv: string;
  isProduction: boolean;
  required: {
    mongodbUri: boolean;
    smartleadApiKey: boolean;
    smartleadCampaignId: boolean;
    devRoutesBlocked: boolean;
  };
  safety: {
    dryRunEnabled: boolean;
    dryRunValue: string;
  };
  optional: {
    claudeConfigured: boolean;
    apolloConfigured: boolean;
    apifyConfigured: boolean;
    websiteEnrichment: boolean;
  };
}

type ManualId =
  | 'atlas-ip'
  | 'gmail-connected'
  | 'gmail-sync-confirmed'
  | 'test-email-sent'
  | 'gmail-reply-sent'
  | 'reply-inbox-confirmed'
  | 'dry-run-tested'
  | 'sample-removed'
  | 'domain-ready'
  | 'ssl-active'
  | 'live-enabled';

function AutoCheck({
  label,
  ok,
  okText,
  failText,
  warn,
}: {
  label: string;
  ok: boolean;
  okText: string;
  failText: string;
  warn?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
      <span className="text-sm text-slate-700">{label}</span>
      <div className="flex items-center gap-1.5">
        {ok ? (
          <CheckCircle size={15} className="text-emerald-500" />
        ) : warn ? (
          <AlertTriangle size={15} className="text-amber-500" />
        ) : (
          <XCircle size={15} className="text-rose-500" />
        )}
        <span
          className={`text-xs font-medium ${
            ok ? 'text-emerald-700' : warn ? 'text-amber-700' : 'text-rose-700'
          }`}
        >
          {ok ? okText : failText}
        </span>
      </div>
    </div>
  );
}

export default function ProductionChecklistPage() {
  const [data, setData] = useState<ProductionCheckData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [manual, setManual] = useState<Set<ManualId>>(new Set());
  const fetchCheck = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch('/api/production-check');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch {
      setFetchError('Could not reach /api/production-check');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCheck();
  }, [fetchCheck]);

  function toggleManual(id: ManualId) {
    setManual((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function resetManual() {
    setManual(new Set());
  }

  const autoOk = data
    ? Object.values(data.required).every(Boolean)
    : false;

  const manualItems: { id: ManualId; label: string; description: string }[] = [
    {
      id: 'atlas-ip',
      label: 'MongoDB Atlas IP whitelisted',
      description: 'Add your VPS IP (or 0.0.0.0/0) in Atlas → Network Access.',
    },
    {
      id: 'gmail-connected',
      label: 'Connect Gmail account',
      description: 'Go to Settings → Gmail Inbox Sync and click Connect Gmail to authorise the account.',
    },
    {
      id: 'gmail-sync-confirmed',
      label: 'Confirm Gmail sync runs',
      description: 'Click Sync Now in Settings → Gmail Inbox Sync and confirm the sync completes without errors.',
    },
    {
      id: 'test-email-sent',
      label: 'Send test email',
      description: 'Compose and send a test email via the Compose page to an address you control.',
    },
    {
      id: 'gmail-reply-sent',
      label: 'Reply from recipient email',
      description: 'Reply to the test email from the recipient address, then trigger a Gmail sync.',
    },
    {
      id: 'reply-inbox-confirmed',
      label: 'Confirm reply appears in Reply Inbox',
      description: 'Open Reply Inbox and verify the reply is visible with correct classification.',
    },
    {
      id: 'dry-run-tested',
      label: 'Dry-run send tested successfully',
      description: 'Set DRY_RUN=true, composed an email, clicked Test Send, confirmed "ready_to_send_test" status.',
    },
    {
      id: 'sample-removed',
      label: 'Sample data removed',
      description: 'Ran Dev Tools → Reset to remove all [SAMPLE] records before go-live.',
    },
    {
      id: 'domain-ready',
      label: 'Domain DNS pointing to server',
      description: 'A-record or CNAME resolved and propagated to your VPS IP.',
    },
    {
      id: 'ssl-active',
      label: 'SSL certificate active',
      description: 'Certbot or your host\'s SSL is installed and auto-renewing.',
    },
    {
      id: 'live-enabled',
      label: 'SMARTLEAD_DRY_RUN=false set intentionally',
      description: 'Only check this after all other items are confirmed. Live emails will be sent.',
    },
  ];

  const manualDone = manual.size;
  const totalManual = manualItems.length;
  const autoCount = data
    ? Object.values(data.required).filter(Boolean).length
    : 0;
  const totalAuto = data ? Object.values(data.required).length : 5;
  const overallReady = autoOk && manual.size === totalManual;

  return (
    <AppShell>
      <div className="max-w-2xl">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Production Checklist</h1>
            <p className="text-slate-500 text-sm mt-1">
              Complete every item before switching SMARTLEAD_DRY_RUN to false.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={resetManual}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
            >
              <RotateCcw size={12} />
              Reset
            </button>
            <button
              onClick={fetchCheck}
              disabled={loading}
              className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Refresh
            </button>
          </div>
        </div>

        {/* Overall banner */}
        {!loading && data && (
          <div
            className={`flex items-center gap-3 rounded-lg px-4 py-3 mb-6 border text-sm ${
              overallReady
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}
          >
            <Rocket size={16} className="shrink-0" />
            {overallReady
              ? 'All checks passed — the app is ready for live email sending.'
              : `${autoCount}/${totalAuto} automated + ${manualDone}/${totalManual} manual checks complete.`}
          </div>
        )}

        {fetchError && (
          <div className="bg-rose-50 border border-rose-200 rounded-lg px-4 py-3 mb-6 text-sm text-rose-700">
            {fetchError}
          </div>
        )}

        {/* Automated checks */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-4">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">Automated checks</h2>
            <span className="text-xs text-slate-400">Live from /api/production-check</span>
          </div>

          {loading ? (
            <div className="px-5 py-8 flex justify-center">
              <Loader2 size={20} className="animate-spin text-slate-400" />
            </div>
          ) : data ? (
            <div className="px-5 py-2">
              <AutoCheck
                label="NODE_ENV"
                ok={data.isProduction}
                okText="production"
                failText={`${data.nodeEnv} — set NODE_ENV=production on your server`}
                warn={!data.isProduction}
              />
              <AutoCheck
                label="MONGODB_URI"
                ok={data.required.mongodbUri}
                okText="Set"
                failText="Missing — required"
              />
              <AutoCheck
                label="SMARTLEAD_API_KEY"
                ok={data.required.smartleadApiKey}
                okText="Set"
                failText="Missing — required for sending"
              />
              <AutoCheck
                label="SMARTLEAD_CAMPAIGN_ID"
                ok={data.required.smartleadCampaignId}
                okText="Set"
                failText="Missing — emails cannot be dispatched without a campaign"
              />
              <AutoCheck
                label="Dev routes (/api/dev/*)"
                ok={data.required.devRoutesBlocked}
                okText="Blocked (production)"
                failText="Not blocked — NODE_ENV is not production"
                warn={!data.required.devRoutesBlocked}
              />
              <AutoCheck
                label="Send mode"
                ok={!data.safety.dryRunEnabled}
                okText="Live sends enabled"
                failText={`Dry-run active — safe for testing (${data.safety.dryRunValue})`}
                warn={data.safety.dryRunEnabled}
              />
              <div className="pt-2 pb-1">
                <p className="text-xs text-slate-400 font-medium mb-1">Optional integrations</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: 'Claude AI', ok: data.optional.claudeConfigured },
                    { label: 'Apollo.io', ok: data.optional.apolloConfigured },
                    { label: 'Apify', ok: data.optional.apifyConfigured },
                  ].map(({ label, ok }) => (
                    <span
                      key={label}
                      className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border ${
                        ok
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          : 'bg-slate-50 border-slate-200 text-slate-400'
                      }`}
                    >
                      {ok ? <CheckCircle size={10} /> : <XCircle size={10} />}
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Manual checks */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">Manual confirmations</h2>
            <span className="text-xs text-slate-400">{manualDone}/{totalManual} confirmed</span>
          </div>
          <div className="divide-y divide-slate-100">
            {manualItems.map(({ id, label, description }) => {
              const done = manual.has(id);
              const isLastItem = id === 'live-enabled';
              return (
                <button
                  key={id}
                  onClick={() => toggleManual(id)}
                  className={`w-full flex items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-slate-50 ${
                    isLastItem && !done ? 'opacity-60' : ''
                  }`}
                >
                  <div className="shrink-0 mt-0.5">
                    {done ? (
                      <CheckSquare size={18} className="text-emerald-500" />
                    ) : (
                      <Square size={18} className="text-slate-300" />
                    )}
                  </div>
                  <div>
                    <p className={`text-sm font-medium ${done ? 'text-emerald-800 line-through decoration-emerald-400' : isLastItem ? 'text-rose-700' : 'text-slate-800'}`}>
                      {isLastItem && '⚠ '}{label}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">{description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Links */}
        <div className="flex flex-wrap gap-3">
          <Link
            href="/settings"
            className="flex items-center gap-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg px-3 py-2 hover:bg-slate-50 transition-colors"
          >
            <ExternalLink size={13} />
            System Health
          </Link>
          <Link
            href="/testing-checklist"
            className="flex items-center gap-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg px-3 py-2 hover:bg-slate-50 transition-colors"
          >
            <ExternalLink size={13} />
            QA Checklist
          </Link>
          {process.env.NODE_ENV !== 'production' && (
            <Link
              href="/dev-tools"
              className="flex items-center gap-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg px-3 py-2 hover:bg-slate-50 transition-colors"
            >
              <ExternalLink size={13} />
              Dev Tools (reset sample data)
            </Link>
          )}
        </div>
      </div>
    </AppShell>
  );
}
