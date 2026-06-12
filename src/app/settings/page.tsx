'use client';

import { useEffect, useState, useCallback } from 'react';
import AppShell from '@/components/layout/AppShell';
import {
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  Lock,
  Database,
  Brain,
  Globe,
  Zap,
  Mail,
  Inbox,
  Activity,
  Loader2,
} from 'lucide-react';

interface HealthData {
  mongoUriSet: boolean;
  mode: 'local' | 'atlas' | 'unknown';
  canConnect: boolean;
  ping: 'OK' | 'Failed';
  claude: 'configured' | 'missing';
  apollo: 'configured' | 'missing';
  apify: 'configured' | 'missing';
  smartlead: {
    configured: boolean;
    dryRun: boolean;
    campaignIdPresent: boolean;
  };
  websiteEnrichment: boolean;
}

type StatusLevel = 'ok' | 'warn' | 'error' | 'off';

function StatusIcon({ level, size = 18 }: { level: StatusLevel; size?: number }) {
  if (level === 'ok') return <CheckCircle size={size} className="text-emerald-500 shrink-0" />;
  if (level === 'warn') return <AlertCircle size={size} className="text-amber-500 shrink-0" />;
  if (level === 'error') return <XCircle size={size} className="text-rose-500 shrink-0" />;
  return <XCircle size={size} className="text-slate-400 shrink-0" />;
}

function StatusBadge({ level, label }: { level: StatusLevel; label: string }) {
  const styles: Record<StatusLevel, string> = {
    ok: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warn: 'bg-amber-50 text-amber-700 border-amber-200',
    error: 'bg-rose-50 text-rose-700 border-rose-200',
    off: 'bg-slate-50 text-slate-500 border-slate-200',
  };
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${styles[level]}`}>
      {label}
    </span>
  );
}

interface ServiceCardProps {
  icon: React.ElementType;
  iconColor: string;
  title: string;
  level: StatusLevel;
  statusLabel: string;
  rows?: { label: string; level: StatusLevel; value: string }[];
  instructions?: string[];
  envVars?: string[];
}

function ServiceCard({
  icon: Icon,
  iconColor,
  title,
  level,
  statusLabel,
  rows,
  instructions,
  envVars,
}: ServiceCardProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
        <div className={`p-2 rounded-lg ${iconColor}`}>
          <Icon size={16} />
        </div>
        <div className="flex-1">
          <h2 className="font-semibold text-slate-800">{title}</h2>
        </div>
        <StatusBadge level={level} label={statusLabel} />
        <StatusIcon level={level} />
      </div>

      {rows && rows.length > 0 && (
        <div className="px-5 py-3 border-b border-slate-100 space-y-2">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between text-sm">
              <span className="text-slate-500">{row.label}</span>
              <div className="flex items-center gap-1.5">
                <StatusIcon level={row.level} size={14} />
                <span
                  className={
                    row.level === 'ok'
                      ? 'text-emerald-700 font-medium'
                      : row.level === 'warn'
                      ? 'text-amber-700 font-medium'
                      : row.level === 'off'
                      ? 'text-slate-400'
                      : 'text-rose-700 font-medium'
                  }
                >
                  {row.value}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {(instructions || envVars) && (
        <div className="px-5 py-4 space-y-3">
          {envVars && envVars.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {envVars.map((v) => (
                <code key={v} className="text-xs bg-slate-100 border border-slate-200 text-slate-600 px-2 py-0.5 rounded">
                  {v}
                </code>
              ))}
            </div>
          )}
          {instructions && instructions.length > 0 && (
            <ol className="space-y-1 text-xs text-slate-500 list-decimal list-inside">
              {instructions.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-sm h-20 animate-pulse" />
      ))}
    </div>
  );
}

export default function SettingsPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  // ── Gmail state ────────────────────────────────────────────────────────────
  const [gmailStatus, setGmailStatus] = useState<{
    configured: boolean;
    connected: boolean;
    email?: string;
    lastSyncedAt?: string;
  } | null>(null);
  const [gmailSyncing, setGmailSyncing]     = useState(false);
  const [gmailSyncResult, setGmailSyncResult] = useState<{
    success: boolean;
    message: string;
    checked: number;
    created: number;
    duplicates: number;
    skippedNoLead: number;
    errors: string[];
  } | null>(null);
  const [gmailConnectedNotice, setGmailConnectedNotice] = useState(false);
  const [gmailErrorNotice, setGmailErrorNotice]         = useState('');

  const fetchGmailStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/gmail/status');
      const data = await res.json();
      setGmailStatus(data);
    } catch {
      setGmailStatus({ configured: false, connected: false });
    }
  }, []);

  useEffect(() => {
    fetchGmailStatus();
  }, [fetchGmailStatus]);

  // Detect ?gmail=connected or ?gmail=error after OAuth redirect
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const gmailParam = params.get('gmail');
    Promise.resolve(gmailParam).then((gp) => {
      if (gp === 'connected') {
        setGmailConnectedNotice(true);
        fetchGmailStatus();
      } else if (gp === 'error') {
        const errCode = params.get('gmail_error') ?? 'unknown';
        setGmailErrorNotice(`Gmail connection failed (${errCode}). Check credentials and try again.`);
      }
    });
  }, [fetchGmailStatus]);

  const handleGmailSync = async () => {
    setGmailSyncing(true);
    setGmailSyncResult(null);
    try {
      const res = await fetch('/api/gmail/sync', { method: 'POST' });
      const data = await res.json();
      setGmailSyncResult(data);
      if (data.success) fetchGmailStatus();
    } catch {
      setGmailSyncResult({
        success: false,
        message: 'Sync request failed — check network and try again.',
        checked: 0, created: 0, duplicates: 0, skippedNoLead: 0, errors: [],
      });
    } finally {
      setGmailSyncing(false);
    }
  };

  const applyHealthData = (data: HealthData) => {
    setHealth(data);
    setLastChecked(new Date());
  };

  const fetchHealth = useCallback(() => {
    setLoading(true);
    setFetchError(null);
    fetch('/api/health')
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data: HealthData) => applyHealthData(data))
      .catch(() => setFetchError('Could not reach /api/health — check the server.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  // ── Derive card data from health ─────────────────────────────────────
  const mongoLevel: StatusLevel =
    !health ? 'off'
    : health.canConnect ? 'ok'
    : health.mongoUriSet ? 'error'
    : 'off';

  const claudeLevel: StatusLevel = health?.claude === 'configured' ? 'ok' : 'off';
  const apolloLevel: StatusLevel = health?.apollo === 'configured' ? 'ok' : 'off';
  const apifyLevel: StatusLevel = health?.apify === 'configured' ? 'ok' : 'off';

  const smartleadLevel: StatusLevel = !health?.smartlead.configured
    ? 'off'
    : !health.smartlead.campaignIdPresent
    ? 'error'
    : health.smartlead.dryRun
    ? 'warn'
    : 'ok';

  const smartleadLabel = !health?.smartlead.configured
    ? 'Missing'
    : !health.smartlead.campaignIdPresent
    ? 'No Campaign'
    : health.smartlead.dryRun
    ? 'Test Mode'
    : 'Live';

  const overallReady =
    (health?.canConnect === true) && (health?.smartlead.configured === true);

  return (
    <AppShell>
      <div className="max-w-2xl">

        {/* ── System Health section ─────────────────────────────────────── */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Settings & System Health</h1>
            <p className="text-slate-500 text-sm mt-1">
              Live status of all integrations — no paid API calls made during checks.
            </p>
            {lastChecked && (
              <p className="text-xs text-slate-400 mt-0.5">
                Last checked: {lastChecked.toLocaleTimeString()}
              </p>
            )}
          </div>
          <button
            onClick={fetchHealth}
            disabled={loading}
            className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors shrink-0"
          >
            {loading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <RefreshCw size={14} />
            )}
            Refresh
          </button>
        </div>

        {/* Overall status banner */}
        {health && !loading && (
          <div
            className={`flex items-center gap-3 rounded-lg px-4 py-3 mb-6 border text-sm ${
              overallReady
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}
          >
            <Activity size={16} className="shrink-0" />
            {overallReady
              ? 'System is operational. All core services are configured.'
              : 'Some required configuration is missing. See details below.'}
          </div>
        )}

        {/* Fetch error */}
        {fetchError && (
          <div className="bg-rose-50 border border-rose-200 rounded-lg px-4 py-3 mb-6 text-sm text-rose-700">
            {fetchError}
          </div>
        )}

        {/* Security note */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 mb-6 flex gap-2 text-xs text-slate-600">
          <Lock size={14} className="shrink-0 mt-0.5 text-slate-400" />
          API keys are never returned by the server — only their presence is checked.
          Credentials are stored encrypted in the database and may also be provided via environment variables (env takes effect if DB is unavailable).
        </div>

        {/* Cards */}
        {loading ? (
          <LoadingSkeleton />
        ) : health ? (
          <div className="space-y-4">
            {/* MongoDB */}
            <ServiceCard
              icon={Database}
              iconColor="text-blue-600 bg-blue-50"
              title="MongoDB"
              level={mongoLevel}
              statusLabel={
                health.canConnect ? 'Connected'
                : health.mongoUriSet ? 'Connection Error'
                : 'Missing'
              }
              envVars={['MONGODB_URI']}
              instructions={
                !health.mongoUriSet
                  ? [
                      'Go to mongodb.com/atlas and create a free M0 cluster.',
                      'Create a database user and whitelist 0.0.0.0/0 in Network Access.',
                      'Copy the connection string and add MONGODB_URI to your environment variables.',
                    ]
                  : !health.canConnect
                  ? [
                      'MongoDB URI is set, but the connection failed.',
                      'Check your deployment logs for the exact error.',
                      'Common causes: wrong password, IP not whitelisted in Atlas Network Access, cluster paused.',
                    ]
                  : undefined
              }
            />

            {/* Claude AI */}
            <ServiceCard
              icon={Brain}
              iconColor="text-violet-600 bg-violet-50"
              title="Claude AI"
              level={claudeLevel}
              statusLabel={health.claude === 'configured' ? 'Configured' : 'Not Configured'}
              envVars={['CLAUDE_API_KEY']}
              instructions={
                health.claude === 'missing'
                  ? [
                      'Optional — the app works without it.',
                      'Get a key at console.anthropic.com.',
                      'Add CLAUDE_API_KEY to your environment variables.',
                      'Used only when you click "Personalize with AI" or "Improve with AI".',
                    ]
                  : undefined
              }
            />

            {/* Apollo */}
            <ServiceCard
              icon={Globe}
              iconColor="text-emerald-600 bg-emerald-50"
              title="Apollo.io"
              level={apolloLevel}
              statusLabel={health.apollo === 'configured' ? 'Configured' : 'Not Configured'}
              envVars={['APOLLO_API_KEY']}
              instructions={
                health.apollo === 'missing'
                  ? [
                      'Optional — only needed for /apollo lead search.',
                      'Sign up at app.apollo.io and go to Settings → Integrations → API.',
                      'Add APOLLO_API_KEY to your environment variables.',
                    ]
                  : undefined
              }
            />

            {/* Apify */}
            <ServiceCard
              icon={Zap}
              iconColor="text-amber-600 bg-amber-50"
              title="Apify (Google Maps)"
              level={apifyLevel}
              statusLabel={health.apify === 'configured' ? 'Configured' : 'Not Configured'}
              rows={[
                {
                  label: 'Website Enrichment',
                  level: health.websiteEnrichment ? 'ok' : 'off',
                  value: health.websiteEnrichment ? 'Enabled' : 'Disabled (default)',
                },
              ]}
              envVars={['APIFY_API_TOKEN', 'APIFY_WEBSITE_ENRICHMENT_ENABLED']}
              instructions={
                health.apify === 'missing'
                  ? [
                      'Optional — only needed for /apify Google Maps scraping.',
                      'Sign up at console.apify.com and copy your API token from Settings → Integrations.',
                      'Add APIFY_API_TOKEN to your environment variables.',
                      'Leave APIFY_WEBSITE_ENRICHMENT_ENABLED=false unless you need contact-page scraping.',
                    ]
                  : undefined
              }
            />

            {/* Smartlead */}
            <ServiceCard
              icon={Mail}
              iconColor="text-rose-600 bg-rose-50"
              title="Smartlead (Email Sending)"
              level={smartleadLevel}
              statusLabel={smartleadLabel}
              rows={[
                {
                  label: 'API Key',
                  level: health.smartlead.configured ? 'ok' : 'off',
                  value: health.smartlead.configured ? 'Present' : 'Missing',
                },
                {
                  label: 'Send Mode',
                  level: !health.smartlead.configured ? 'off' : health.smartlead.dryRun ? 'warn' : 'ok',
                  value: !health.smartlead.configured
                    ? '—'
                    : health.smartlead.dryRun
                    ? 'Dry Run (test only — no real emails sent)'
                    : 'Live (real emails will be sent)',
                },
                {
                  label: 'Campaign ID',
                  level: health.smartlead.campaignIdPresent ? 'ok' : 'off',
                  value: health.smartlead.campaignIdPresent ? 'Present' : 'Missing — required for sending',
                },
              ]}
              envVars={['SMARTLEAD_API_KEY', 'SMARTLEAD_DRY_RUN', 'SMARTLEAD_CAMPAIGN_ID']}
              instructions={
                !health.smartlead.configured || !health.smartlead.campaignIdPresent
                  ? [
                      'Sign up at smartlead.ai and get your API key from Settings → API Key.',
                      'Add SMARTLEAD_API_KEY to your environment variables.',
                      'Create a campaign in Smartlead — copy its ID from the URL (/campaigns/{id}).',
                      'Add SMARTLEAD_CAMPAIGN_ID to your environment variables.',
                      'Set SMARTLEAD_DRY_RUN=true to test without sending real emails.',
                      'Switch to SMARTLEAD_DRY_RUN=false when ready to go live.',
                    ]
                  : undefined
              }
            />

            {/* Gmail Inbox Sync */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
                <div className="p-2 rounded-lg text-blue-600 bg-blue-50">
                  <Inbox size={16} />
                </div>
                <div className="flex-1">
                  <h2 className="font-semibold text-slate-800">Gmail Inbox Sync</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Replies are synced from the connected Gmail inbox and classified into the Reply Inbox.</p>
                </div>
                {gmailStatus && (
                  <>
                    <StatusBadge
                      level={!gmailStatus.configured ? 'off' : !gmailStatus.connected ? 'warn' : 'ok'}
                      label={!gmailStatus.configured ? 'Not Configured' : !gmailStatus.connected ? 'Not Connected' : 'Connected'}
                    />
                    <StatusIcon level={!gmailStatus.configured ? 'off' : !gmailStatus.connected ? 'warn' : 'ok'} />
                  </>
                )}
              </div>

              <div className="px-5 py-3 border-b border-slate-100 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">OAuth Credentials</span>
                  <div className="flex items-center gap-1.5">
                    <StatusIcon level={gmailStatus?.configured ? 'ok' : 'off'} size={14} />
                    <span className={gmailStatus?.configured ? 'text-emerald-700 font-medium' : 'text-slate-400'}>
                      {gmailStatus?.configured ? 'Configured' : 'Missing'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Connected Account</span>
                  <div className="flex items-center gap-1.5">
                    <StatusIcon level={gmailStatus?.connected ? 'ok' : 'off'} size={14} />
                    <span className={gmailStatus?.connected ? 'text-emerald-700 font-medium' : 'text-slate-400'}>
                      {gmailStatus?.email ?? (gmailStatus?.connected ? 'Connected' : 'Not connected')}
                    </span>
                  </div>
                </div>
                {gmailStatus?.lastSyncedAt && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">Last Synced</span>
                    <span className="text-slate-500 text-xs">
                      {new Date(gmailStatus.lastSyncedAt).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>

              <div className="px-5 py-4 space-y-3">
                {/* Notices */}
                {gmailConnectedNotice && (
                  <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                    <CheckCircle size={12} />
                    Gmail connected successfully!
                  </div>
                )}
                {gmailErrorNotice && (
                  <div className="flex items-center gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                    <XCircle size={12} />
                    {gmailErrorNotice}
                  </div>
                )}
                {gmailSyncResult && (
                  <div className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2 ${
                    gmailSyncResult.success
                      ? 'text-emerald-700 bg-emerald-50 border border-emerald-200'
                      : 'text-rose-700 bg-rose-50 border border-rose-200'
                  }`}>
                    {gmailSyncResult.success
                      ? <CheckCircle size={12} className="shrink-0 mt-0.5" />
                      : <XCircle size={12} className="shrink-0 mt-0.5" />}
                    <div>
                      <span className="font-medium">{gmailSyncResult.message}</span>
                      {gmailSyncResult.success && (
                        <span className="ml-1 text-slate-500">
                          · {gmailSyncResult.checked} checked · {gmailSyncResult.duplicates} duplicate{gmailSyncResult.duplicates !== 1 ? 's' : ''} · {gmailSyncResult.skippedNoLead} unmatched
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex items-center gap-2 flex-wrap">
                  {gmailStatus?.configured && !gmailStatus.connected && (
                    <a
                      href="/api/gmail/connect"
                      className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-colors"
                    >
                      <Inbox size={12} />
                      Connect Gmail
                    </a>
                  )}
                  {gmailStatus?.connected && (
                    <>
                      <button
                        onClick={handleGmailSync}
                        disabled={gmailSyncing}
                        className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg text-xs font-medium transition-colors"
                      >
                        <RefreshCw size={12} className={gmailSyncing ? 'animate-spin' : ''} />
                        {gmailSyncing ? 'Syncing…' : 'Sync Now'}
                      </button>
                      <a
                        href="/api/gmail/connect"
                        className="flex items-center gap-2 px-3 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-xs font-medium transition-colors"
                      >
                        Reconnect
                      </a>
                    </>
                  )}
                </div>

                {/* Setup instructions when not configured */}
                {gmailStatus && !gmailStatus.configured && (
                  <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <AlertCircle size={13} className="shrink-0 mt-0.5" />
                    <span>Add your Google OAuth credentials (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI) to your environment variables, then click <strong>Connect Gmail</strong>.</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}


        {/* Environment variables reference block */}
        <div className="mt-6 bg-slate-800 rounded-xl p-5 text-sm">
          <h3 className="font-semibold text-white mb-1">Environment Variables Reference</h3>
          <p className="text-slate-400 text-xs mb-4">Add these in your deployment settings (e.g. Vercel → Settings → Environment Variables).</p>
          <pre className="text-emerald-300 text-xs overflow-x-auto leading-loose">
{`# ── Required ─────────────────────────────────────────────
MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/pharma-leads
JWT_SECRET=<64-char-hex>
APP_ENCRYPTION_KEY=<64-char-hex>

# ── Admin account ─────────────────────────────────────────
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=<strong-password>

# ── App URL ───────────────────────────────────────────────
APP_URL=https://your-app.vercel.app

# ── Integrations ──────────────────────────────────────────
CLAUDE_API_KEY=sk-ant-...
SMARTLEAD_API_KEY=...
SMARTLEAD_CAMPAIGN_ID=...
SMARTLEAD_DRY_RUN=true
APOLLO_API_KEY=...
APIFY_API_TOKEN=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://your-app.vercel.app/api/gmail/callback`}
          </pre>
        </div>

        {/* First-run checklist */}
        <div className="mt-6 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-800">First-Run Checklist</h3>
            <p className="text-xs text-slate-400 mt-0.5">Complete these steps before using the app in production.</p>
          </div>
          <ol className="px-5 py-4 space-y-3 text-sm text-slate-600 list-none">
            {[
              { step: '1', text: 'Set MONGODB_URI — all data is stored here. The app will not start without it.' },
              { step: '2', text: 'Set SMARTLEAD_DRY_RUN=true and confirm Test Send works on the Compose page.' },
              { step: '3', text: 'Create a campaign in Smartlead and set SMARTLEAD_CAMPAIGN_ID.' },
              { step: '4', text: 'Import a few leads via CSV or the Apollo search to verify the pipeline.' },
              { step: '5', text: 'Optionally add CLAUDE_API_KEY and test "Personalize with AI" on a qualified lead.' },
              { step: '6', text: 'When ready for real sends, set SMARTLEAD_DRY_RUN=false.' },
            ].map(({ step, text }) => (
              <li key={step} className="flex gap-3">
                <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-500 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {step}
                </span>
                <span>{text}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </AppShell>
  );
}
