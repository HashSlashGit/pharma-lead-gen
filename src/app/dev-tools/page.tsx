'use client';

import { useState } from 'react';
import { redirect } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';
import {
  FlaskConical,
  Trash2,
  LayoutDashboard,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
  ChevronRight,
  Database,
  RefreshCw,
} from 'lucide-react';
import Link from 'next/link';

interface MongoDiagnoseResult {
  envLoaded: boolean;
  uriHost: string | null;
  canConnect: boolean;
  canPing: boolean;
  databaseName: string | null;
  collections: string[];
  errorName: string | null;
  errorCode: number | string | null;
  errorCodeName: string | null;
  errorMessage: string | null;
  errorReason: string | null;
  errorCause: string | null;
}

// Block this page entirely in production at render time.
// Routes are already blocked server-side; this is a belt-and-suspenders guard.
if (process.env.NODE_ENV === 'production') {
  redirect('/dashboard');
}

type ActionState = 'idle' | 'loading' | 'success' | 'error';

interface ActionResult {
  message: string;
  detail?: Record<string, number | string | boolean>;
}

function ActionCard({
  icon: Icon,
  iconColor,
  title,
  description,
  buttonLabel,
  buttonVariant,
  state,
  result,
  onAction,
}: {
  icon: React.ElementType;
  iconColor: string;
  title: string;
  description: string;
  buttonLabel: string;
  buttonVariant: 'primary' | 'danger';
  state: ActionState;
  result: ActionResult | null;
  onAction: () => void;
}) {
  const buttonStyles =
    buttonVariant === 'primary'
      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
      : 'bg-rose-600 hover:bg-rose-700 text-white';

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 flex items-start gap-4">
        <div className={`p-2.5 rounded-lg shrink-0 ${iconColor}`}>
          <Icon size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-slate-800">{title}</h2>
          <p className="text-sm text-slate-500 mt-0.5">{description}</p>
        </div>
        <button
          onClick={onAction}
          disabled={state === 'loading'}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 shrink-0 ${buttonStyles}`}
        >
          {state === 'loading' ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Icon size={14} />
          )}
          {state === 'loading' ? 'Running...' : buttonLabel}
        </button>
      </div>

      {result && (
        <div
          className={`mx-5 mb-4 rounded-lg px-4 py-3 text-sm border ${
            state === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2 font-medium mb-1">
            {state === 'success' ? (
              <CheckCircle size={14} />
            ) : (
              <XCircle size={14} />
            )}
            {result.message}
          </div>
          {result.detail && (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs opacity-80">
              {Object.entries(result.detail).map(([k, v]) => (
                <span key={k}>
                  <span className="font-medium">{k}:</span> {String(v)}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DevToolsPage() {
  const [seedState, setSeedState] = useState<ActionState>('idle');
  const [seedResult, setSeedResult] = useState<ActionResult | null>(null);

  const [resetState, setResetState] = useState<ActionState>('idle');
  const [resetResult, setResetResult] = useState<ActionResult | null>(null);

  const [diagState, setDiagState] = useState<ActionState>('idle');
  const [diagResult, setDiagResult] = useState<MongoDiagnoseResult | null>(null);

  async function handleDiagnose() {
    setDiagState('loading');
    setDiagResult(null);
    try {
      const res = await fetch('/api/dev/mongo-diagnose');
      const data: MongoDiagnoseResult = await res.json();
      setDiagResult(data);
      setDiagState(data.canPing ? 'success' : 'error');
    } catch {
      setDiagState('error');
      setDiagResult(null);
    }
  }

  async function handleSeed() {
    setSeedState('loading');
    setSeedResult(null);
    try {
      const res = await fetch('/api/dev/seed', { method: 'POST' });
      const data = await res.json();

      if (data.alreadySeeded) {
        setSeedState('error');
        setSeedResult({ message: data.message });
        return;
      }
      if (!res.ok || !data.success) {
        throw new Error(data.error ?? 'Seed failed');
      }
      setSeedState('success');
      setSeedResult({
        message: 'Sample data created successfully.',
        detail: data.created,
      });
    } catch (e) {
      setSeedState('error');
      setSeedResult({ message: e instanceof Error ? e.message : 'Seed failed' });
    }
  }

  async function handleReset() {
    setResetState('loading');
    setResetResult(null);
    try {
      const res = await fetch('/api/dev/reset', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error ?? 'Reset failed');
      }
      setResetState('success');
      setResetResult({
        message: 'Sample data deleted.',
        detail: data.deleted,
      });
    } catch (e) {
      setResetState('error');
      setResetResult({ message: e instanceof Error ? e.message : 'Reset failed' });
    }
  }

  return (
    <AppShell>
      <div className="max-w-2xl">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800">Dev Tools</h1>
          <p className="text-slate-500 text-sm mt-1">
            Test helpers for local development. Not available in production.
          </p>
        </div>

        {/* Warning banner */}
        <div className="flex gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-6 text-sm text-amber-800">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <div>
            <strong>Development only.</strong> These buttons write to and delete from your real MongoDB database.
            Only use against a local or staging database — never against production data.
          </div>
        </div>

        <div className="space-y-4">
          {/* MongoDB Diagnostics */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 flex items-start gap-4">
              <div className="p-2.5 rounded-lg shrink-0 text-blue-600 bg-blue-50">
                <Database size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-slate-800">MongoDB Diagnostics</h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  Checks env var, connection, ping, and lists collections. Credentials are never shown.
                </p>
              </div>
              <button
                onClick={handleDiagnose}
                disabled={diagState === 'loading'}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 shrink-0 bg-blue-600 hover:bg-blue-700 text-white"
              >
                {diagState === 'loading' ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <RefreshCw size={14} />
                )}
                {diagState === 'loading' ? 'Running...' : 'Run Diagnostics'}
              </button>
            </div>

            {diagResult && (
              <div className={`mx-5 mb-4 rounded-lg px-4 py-3 text-sm border ${
                diagState === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}>
                <div className="flex items-center gap-2 font-medium mb-2">
                  {diagState === 'success' ? <CheckCircle size={14} /> : <XCircle size={14} />}
                  {diagState === 'success' ? 'MongoDB is reachable' : 'MongoDB connection problem'}
                </div>
                <div className="space-y-1 text-xs">
                  <div className="flex gap-2">
                    <span className="text-current opacity-60 w-28 shrink-0">MONGODB_URI set</span>
                    <span className="font-medium">{diagResult.envLoaded ? 'Yes' : 'No — add it to .env.local'}</span>
                  </div>
                  {diagResult.uriHost && (
                    <div className="flex gap-2">
                      <span className="text-current opacity-60 w-28 shrink-0">Host</span>
                      <span className="font-mono">{diagResult.uriHost}</span>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <span className="text-current opacity-60 w-28 shrink-0">Can connect</span>
                    <span className="font-medium">{diagResult.canConnect ? 'Yes' : 'No'}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-current opacity-60 w-28 shrink-0">Ping</span>
                    <span className="font-medium">{diagResult.canPing ? 'OK' : 'Failed'}</span>
                  </div>
                  {diagResult.databaseName && (
                    <div className="flex gap-2">
                      <span className="text-current opacity-60 w-28 shrink-0">Database</span>
                      <span className="font-mono">{diagResult.databaseName}</span>
                    </div>
                  )}
                  {diagResult.collections.length > 0 && (
                    <div className="flex gap-2">
                      <span className="text-current opacity-60 w-28 shrink-0">Collections</span>
                      <span className="font-mono">{diagResult.collections.join(', ')}</span>
                    </div>
                  )}
                  {diagResult.errorName && (
                    <div className="flex gap-2">
                      <span className="text-current opacity-60 w-28 shrink-0">Error name</span>
                      <span className="font-medium font-mono">{diagResult.errorName}</span>
                    </div>
                  )}
                  {diagResult.errorCode != null && (
                    <div className="flex gap-2">
                      <span className="text-current opacity-60 w-28 shrink-0">Error code</span>
                      <span className="font-mono">{String(diagResult.errorCode)}{diagResult.errorCodeName ? ` (${diagResult.errorCodeName})` : ''}</span>
                    </div>
                  )}
                  {diagResult.errorMessage && (
                    <div className="flex gap-2">
                      <span className="text-current opacity-60 w-28 shrink-0">Message</span>
                      <span className="break-all">{diagResult.errorMessage}</span>
                    </div>
                  )}
                  {diagResult.errorReason && (
                    <div className="flex gap-2">
                      <span className="text-current opacity-60 w-28 shrink-0">Reason</span>
                      <span className="break-all">{diagResult.errorReason}</span>
                    </div>
                  )}
                  {diagResult.errorCause && (
                    <div className="flex gap-2">
                      <span className="text-current opacity-60 w-28 shrink-0">Cause</span>
                      <span className="break-all">{diagResult.errorCause}</span>
                    </div>
                  )}
                  {!diagResult.envLoaded && (
                    <p className="mt-2 font-medium">
                      MONGODB_URI is missing — add it to .env.local.
                    </p>
                  )}
                </div>
              </div>
            )}

            {diagState === 'error' && !diagResult && (
              <div className="mx-5 mb-4 rounded-lg px-4 py-3 text-sm border bg-rose-50 border-rose-200 text-rose-800">
                <div className="flex items-center gap-2 font-medium">
                  <XCircle size={14} />
                  Could not reach /api/dev/mongo-diagnose — is the dev server running?
                </div>
              </div>
            )}
          </div>

          {/* Seed */}
          <ActionCard
            icon={FlaskConical}
            iconColor="text-violet-600 bg-violet-50"
            title="Seed sample data"
            description="Creates 3 products, 1 campaign, 5 leads (all statuses), 4 email logs, 2 replies, and 1 no-reply archive. Safe to run once — re-seeding requires a reset first."
            buttonLabel="Seed sample data"
            buttonVariant="primary"
            state={seedState}
            result={seedResult}
            onAction={handleSeed}
          />

          {/* Reset */}
          <ActionCard
            icon={Trash2}
            iconColor="text-rose-600 bg-rose-50"
            title="Reset sample data"
            description="Deletes all records where source = 'sample' or name starts with '[SAMPLE]'. Real leads, products, and campaigns are never touched."
            buttonLabel="Reset sample data"
            buttonVariant="danger"
            state={resetState}
            result={resetResult}
            onAction={handleReset}
          />

          {/* Quick links */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">Quick navigation</h2>
              <p className="text-xs text-slate-400 mt-0.5">Verify seeded data is visible across pages.</p>
            </div>
            <div className="px-5 py-3 space-y-1">
              {[
                { href: '/dashboard', label: 'Dashboard — check stats updated' },
                { href: '/leads', label: 'Leads — 5 sample leads visible' },
                { href: '/replies', label: 'Reply Inbox — 2 replies waiting' },
                { href: '/leads/no-reply', label: 'No-Reply Archive — 1 archived lead' },
                { href: '/products', label: 'Products — 3 sample products' },
                { href: '/compose', label: 'Compose — pick a sample lead and draft' },
                { href: '/settings', label: 'Settings — health check' },
                { href: '/testing-checklist', label: 'QA Checklist — full test plan' },
              ].map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center justify-between px-3 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-800 transition-colors group"
                >
                  <div className="flex items-center gap-2">
                    <LayoutDashboard size={14} className="text-slate-400" />
                    {label}
                  </div>
                  <ChevronRight size={14} className="text-slate-300 group-hover:text-slate-500 transition-colors" />
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Workflow reminder */}
        <div className="mt-6 bg-slate-50 border border-slate-200 rounded-lg px-4 py-4 text-sm text-slate-600">
          <p className="font-medium text-slate-700 mb-2">Recommended test workflow</p>
          <ol className="space-y-1 list-decimal list-inside text-xs text-slate-500">
            <li>Click <strong>Seed sample data</strong> to populate the database.</li>
            <li>Visit each page in the Quick navigation list above.</li>
            <li>Follow the <Link href="/testing-checklist" className="text-emerald-600 underline underline-offset-2">QA Checklist</Link> to walk through every feature.</li>
            <li>When done, click <strong>Reset sample data</strong> to clean up.</li>
          </ol>
        </div>
      </div>
    </AppShell>
  );
}
