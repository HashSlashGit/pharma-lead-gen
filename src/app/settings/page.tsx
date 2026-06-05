'use client';

import { useEffect, useState, useCallback } from 'react';
import AppShell from '@/components/layout/AppShell';
import Link from 'next/link';
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
  Rocket,
  Save,
  Eye,
  EyeOff,
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

// ─── Integration Settings types ───────────────────────────────────────────────

interface IntegrationInfo {
  configured: boolean;
  masked: string | null;
}

interface IntegrationData {
  encryptionAvailable: boolean;
  claude: IntegrationInfo;
  smartlead: IntegrationInfo & {
    campaignId: string | null;
    fromEmail: string | null;
    fromName: string | null;
    dryRun: boolean;
  };
  apollo: IntegrationInfo & { maxResults: number };
  apify: IntegrationInfo & {
    actorId: string | null;
    maxResults: number;
    websiteEnrichment: boolean;
  };
  mailbox: {
    enabled: boolean;
    imapHost: string | null;
    imapPort: number;
    imapSecure: boolean;
    user: string | null;
    lookbackDays: number;
    passwordConfigured: boolean;
  };
  appUrl: string | null;
}

// ─── Masked secret input ──────────────────────────────────────────────────────

function SecretInput({
  label, placeholder, value, onChange, hint,
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? 'Enter value…'}
          autoComplete="new-password"
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-slate-700"
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
        >
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

function FieldInput({
  label, placeholder, value, onChange, type = 'text',
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-700"
      />
    </div>
  );
}

function IntegrationCard({
  title, icon: Icon, iconBg, configured, masked, children, onSave, saving, saveResult,
}: {
  title: string;
  icon: React.ElementType;
  iconBg: string;
  configured: boolean;
  masked?: string | null;
  children: React.ReactNode;
  onSave: () => void;
  saving: boolean;
  saveResult: { ok?: boolean; error?: string } | null;
}) {
  const [open, setOpen] = useState(!configured);
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-slate-50/60 transition-colors"
      >
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
          <Icon size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-800 text-sm">{title}</p>
          {masked ? (
            <p className="text-xs text-slate-400 font-mono mt-0.5">{masked}</p>
          ) : (
            <p className="text-xs text-slate-400 mt-0.5">Not configured</p>
          )}
        </div>
        <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ring-1 ${
          configured
            ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
            : 'bg-slate-50 text-slate-500 ring-slate-200'
        }`}>
          {configured ? 'Connected' : 'Missing'}
        </span>
      </button>

      {open && (
        <div className="border-t border-slate-100 px-5 py-4 space-y-3">
          {children}
          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-sm"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              {saving ? 'Saving…' : 'Save'}
            </button>
            {saveResult?.ok && (
              <span className="flex items-center gap-1 text-emerald-600 text-xs font-medium">
                <CheckCircle size={13} /> Saved
              </span>
            )}
            {saveResult?.error && (
              <span className="flex items-center gap-1 text-rose-600 text-xs">
                <AlertCircle size={13} /> {saveResult.error}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

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

  // ── Integration settings state ────────────────────────────────────────────
  const [integrations, setIntegrations] = useState<IntegrationData | null>(null);
  const [intLoading, setIntLoading] = useState(true);

  // Per-service form state
  const [claudeKey, setClaudeKey]               = useState('');
  const [smartleadKey, setSmartleadKey]         = useState('');
  const [smartleadCampaign, setSmartleadCampaign] = useState('');
  const [smartleadFrom, setSmartleadFrom]       = useState('');
  const [smartleadName, setSmartleadName]       = useState('');
  const [smartleadDryRun, setSmartleadDryRun]   = useState(true);
  const [apolloKey, setApolloKey]               = useState('');
  const [apolloMax, setApolloMax]               = useState('25');
  const [apifyToken, setApifyToken]             = useState('');
  const [apifyActor, setApifyActor]             = useState('');
  const [apifyMax, setApifyMax]                 = useState('50');
  const [apifyEnrich, setApifyEnrich]           = useState(false);
  const [mailboxEnabled, setMailboxEnabled]     = useState(false);
  const [mailboxHost, setMailboxHost]           = useState('');
  const [mailboxPort, setMailboxPort]           = useState('993');
  const [mailboxSecure, setMailboxSecure]       = useState(true);
  const [mailboxUser, setMailboxUser]           = useState('');
  const [mailboxPass, setMailboxPass]           = useState('');
  const [mailboxDays, setMailboxDays]           = useState('14');
  const [appUrl, setAppUrl]                     = useState('');

  // Per-service saving state
  const [saving, setSaving]         = useState<Record<string, boolean>>({});
  const [saveResult, setSaveResult] = useState<Record<string, { ok?: boolean; error?: string } | null>>({});

  const applyIntegrationData = (data: IntegrationData) => {
    setIntegrations(data);
    setSmartleadCampaign(data.smartlead.campaignId ?? '');
    setSmartleadFrom(data.smartlead.fromEmail ?? '');
    setSmartleadName(data.smartlead.fromName ?? '');
    setSmartleadDryRun(data.smartlead.dryRun);
    setApolloMax(String(data.apollo.maxResults));
    setApifyActor(data.apify.actorId ?? '');
    setApifyMax(String(data.apify.maxResults));
    setApifyEnrich(data.apify.websiteEnrichment);
    setMailboxEnabled(data.mailbox.enabled);
    setMailboxHost(data.mailbox.imapHost ?? '');
    setMailboxPort(String(data.mailbox.imapPort));
    setMailboxSecure(data.mailbox.imapSecure);
    setMailboxUser(data.mailbox.user ?? '');
    setMailboxDays(String(data.mailbox.lookbackDays));
    setAppUrl(data.appUrl ?? '');
  };

  // Called by Refresh button and after saves — setIntLoading(true) is fine here
  const fetchIntegrations = useCallback(() => {
    setIntLoading(true);
    fetch('/api/settings/integrations')
      .then((r) => r.json())
      .then((data: IntegrationData) => applyIntegrationData(data))
      .catch(() => { /* non-fatal */ })
      .finally(() => setIntLoading(false));
  }, []);

  useEffect(() => {
    // All setState calls inside applyIntegrationData run asynchronously via .then()
    fetch('/api/settings/integrations')
      .then((r) => r.json())
      .then((data: IntegrationData) => applyIntegrationData(data))
      .catch(() => { /* non-fatal */ })
      .finally(() => setIntLoading(false));
  }, []);

  const saveSection = async (section: string, payload: Record<string, unknown>) => {
    setSaving((p) => ({ ...p, [section]: true }));
    setSaveResult((p) => ({ ...p, [section]: null }));
    try {
      const res = await fetch('/api/settings/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json() as { success?: boolean; error?: string };
      if (res.ok && data.success) {
        setSaveResult((p) => ({ ...p, [section]: { ok: true } }));
        await fetchIntegrations();
      } else {
        setSaveResult((p) => ({ ...p, [section]: { error: data.error ?? 'Save failed' } }));
      }
    } catch {
      setSaveResult((p) => ({ ...p, [section]: { error: 'Network error' } }));
    } finally {
      setSaving((p) => ({ ...p, [section]: false }));
    }
  };

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
    fetch('/api/gmail/status')
      .then((r) => r.json())
      .then((data) => setGmailStatus(data))
      .catch(() => setGmailStatus({ configured: false, connected: false }));
  }, []);

  // Detect ?gmail=connected or ?gmail=error after OAuth redirect
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const gmailParam = params.get('gmail');
    // Read params synchronously, then schedule state updates asynchronously
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

  // Used by Refresh button — not in a useEffect, so setLoading(true) is fine
  const fetchHealth = useCallback(() => {
    setLoading(true);
    setFetchError(null);
    fetch('/api/health')
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data: HealthData) => applyHealthData(data))
      .catch(() => setFetchError('Could not reach /api/health — check the dev server.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    // All setState calls are in async .then()/.catch()/.finally() — not synchronous in effect body
    fetch('/api/health')
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data: HealthData) => applyHealthData(data))
      .catch(() => setFetchError('Could not reach /api/health — check the dev server.'))
      .finally(() => setLoading(false));
  }, [])

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

  // Overall readiness: MongoDB + at least one send channel
  const overallReady =
    (health?.canConnect === true) && (health?.smartlead.configured === true);

  return (
    <AppShell>
      <div className="max-w-2xl">

        {/* ── Integration Settings section ─────────────────────────────── */}
        <div className="mb-10">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Integration Settings</h1>
              <p className="text-slate-500 text-sm mt-1">Configure your API keys and service credentials. Keys are encrypted at rest.</p>
            </div>
            <button onClick={fetchIntegrations} disabled={intLoading}
              className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 px-3 py-2 rounded-xl border border-slate-200 hover:bg-white transition-colors disabled:opacity-40">
              <RefreshCw size={13} className={intLoading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>

          {!integrations?.encryptionAvailable && !intLoading && (
            <div className="mb-4 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Encryption not configured</p>
                <p className="text-xs mt-0.5">Add <code className="bg-amber-100 px-1 rounded font-mono">APP_ENCRYPTION_KEY</code> to your environment (64 hex chars) to enable secure key storage.</p>
              </div>
            </div>
          )}

          {intLoading ? (
            <div className="space-y-3">
              {[1,2,3,4,5].map(i => <div key={i} className="h-16 bg-white rounded-2xl border border-slate-100 animate-pulse" />)}
            </div>
          ) : (
            <div className="space-y-3">

              {/* Claude */}
              <IntegrationCard title="Claude AI" icon={Brain} iconBg="bg-violet-50 text-violet-600"
                configured={integrations?.claude.configured ?? false}
                masked={integrations?.claude.masked}
                onSave={() => saveSection('claude', { claudeApiKey: claudeKey })}
                saving={!!saving['claude']} saveResult={saveResult['claude'] ?? null}>
                <SecretInput label="Claude API Key" placeholder="sk-ant-api03-…"
                  value={claudeKey} onChange={setClaudeKey}
                  hint="Get from console.anthropic.com → API Keys" />
              </IntegrationCard>

              {/* Smartlead */}
              <IntegrationCard title="Smartlead" icon={Zap} iconBg="bg-amber-50 text-amber-600"
                configured={integrations?.smartlead.configured ?? false}
                masked={integrations?.smartlead.masked}
                onSave={() => saveSection('smartlead', {
                  smartleadApiKey: smartleadKey,
                  smartleadCampaignId: smartleadCampaign,
                  smartleadFromEmail: smartleadFrom,
                  smartleadFromName: smartleadName,
                  smartleadDryRun,
                })}
                saving={!!saving['smartlead']} saveResult={saveResult['smartlead'] ?? null}>
                <SecretInput label="Smartlead API Key" placeholder="sl-…"
                  value={smartleadKey} onChange={setSmartleadKey} />
                <FieldInput label="Campaign ID" placeholder="12345"
                  value={smartleadCampaign} onChange={setSmartleadCampaign} />
                <FieldInput label="From Email" placeholder="sales@yourcompany.com"
                  value={smartleadFrom} onChange={setSmartleadFrom} />
                <FieldInput label="From Name" placeholder="Your Name"
                  value={smartleadName} onChange={setSmartleadName} />
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                    <input type="checkbox" checked={smartleadDryRun} onChange={(e) => setSmartleadDryRun(e.target.checked)}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                    Dry-run mode (test only, no real sends)
                  </label>
                </div>
              </IntegrationCard>

              {/* Apollo */}
              <IntegrationCard title="Apollo.io" icon={Globe} iconBg="bg-blue-50 text-blue-600"
                configured={integrations?.apollo.configured ?? false}
                masked={integrations?.apollo.masked}
                onSave={() => saveSection('apollo', {
                  apolloApiKey: apolloKey,
                  apolloMaxResults: parseInt(apolloMax, 10) || 25,
                })}
                saving={!!saving['apollo']} saveResult={saveResult['apollo'] ?? null}>
                <SecretInput label="Apollo API Key"
                  value={apolloKey} onChange={setApolloKey} />
                <FieldInput label="Max Results per Search" placeholder="25" type="number"
                  value={apolloMax} onChange={setApolloMax} />
              </IntegrationCard>

              {/* Apify */}
              <IntegrationCard title="Apify (Google Maps)" icon={Globe} iconBg="bg-emerald-50 text-emerald-600"
                configured={integrations?.apify.configured ?? false}
                masked={integrations?.apify.masked}
                onSave={() => saveSection('apify', {
                  apifyToken,
                  apifyActorId: apifyActor,
                  apifyMaxResults: parseInt(apifyMax, 10) || 50,
                  apifyWebsiteEnrichment: apifyEnrich,
                })}
                saving={!!saving['apify']} saveResult={saveResult['apify'] ?? null}>
                <SecretInput label="Apify API Token" placeholder="apify_api_…"
                  value={apifyToken} onChange={setApifyToken} />
                <FieldInput label="Google Maps Actor ID" placeholder="compass/crawler-google-places"
                  value={apifyActor} onChange={setApifyActor} />
                <FieldInput label="Max Results per Search" placeholder="50" type="number"
                  value={apifyMax} onChange={setApifyMax} />
                <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                  <input type="checkbox" checked={apifyEnrich} onChange={(e) => setApifyEnrich(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                  Enable website email enrichment (uses extra Apify credits)
                </label>
              </IntegrationCard>

              {/* Mailbox */}
              <IntegrationCard title="Mailbox / IMAP Sync" icon={Inbox} iconBg="bg-slate-100 text-slate-600"
                configured={integrations?.mailbox.passwordConfigured ?? false}
                masked={integrations?.mailbox.user ? `${integrations.mailbox.user} — IMAP` : null}
                onSave={() => saveSection('mailbox', {
                  mailboxEnabled,
                  mailboxImapHost: mailboxHost,
                  mailboxImapPort: parseInt(mailboxPort, 10) || 993,
                  mailboxImapSecure: mailboxSecure,
                  mailboxUser,
                  mailboxPassword: mailboxPass,
                  mailboxLookbackDays: parseInt(mailboxDays, 10) || 14,
                })}
                saving={!!saving['mailbox']} saveResult={saveResult['mailbox'] ?? null}>
                <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                  <input type="checkbox" checked={mailboxEnabled} onChange={(e) => setMailboxEnabled(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                  Enable mailbox sync
                </label>
                <FieldInput label="IMAP Host" placeholder="imap.gmail.com"
                  value={mailboxHost} onChange={setMailboxHost} />
                <div className="grid grid-cols-2 gap-3">
                  <FieldInput label="Port" placeholder="993" type="number"
                    value={mailboxPort} onChange={setMailboxPort} />
                  <FieldInput label="Lookback Days" placeholder="14" type="number"
                    value={mailboxDays} onChange={setMailboxDays} />
                </div>
                <FieldInput label="Email / Username"
                  value={mailboxUser} onChange={setMailboxUser} />
                <SecretInput label="App Password" hint="Use an app-specific password, not your account password."
                  value={mailboxPass} onChange={setMailboxPass} />
                <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                  <input type="checkbox" checked={mailboxSecure} onChange={(e) => setMailboxSecure(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                  Use SSL/TLS (recommended)
                </label>
              </IntegrationCard>

              {/* App URL */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-4">
                <p className="text-sm font-semibold text-slate-700 mb-3">App URL</p>
                <FieldInput label="Public app URL (used for webhook references)"
                  placeholder="https://your-app.vercel.app"
                  value={appUrl} onChange={setAppUrl} />
                <div className="flex items-center gap-3 mt-3">
                  <button onClick={() => saveSection('appUrl', { appUrl })} disabled={!!saving['appUrl']}
                    className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                    {saving['appUrl'] ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                    Save
                  </button>
                  {saveResult['appUrl']?.ok && <span className="text-emerald-600 text-xs font-medium flex items-center gap-1"><CheckCircle size={12} /> Saved</span>}
                </div>
              </div>

            </div>
          )}
        </div>

        {/* ── System Health section ─────────────────────────────────────── */}
        {/* Header */}
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
          API keys are never returned by the server — only presence is checked.
          All secrets live in <code className="bg-slate-100 px-1 rounded">.env.local</code> and are never sent to the browser.
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
                      'Copy the connection string and set MONGODB_URI in .env.local.',
                    ]
                  : !health.canConnect
                  ? [
                      'MongoDB URI is loaded, but the connection failed.',
                      'Check the server terminal (npm run dev output) for the exact error.',
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
                      'Set CLAUDE_API_KEY=sk-ant-... in .env.local.',
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
                      'Set APOLLO_API_KEY in .env.local.',
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
                      'Set APIFY_API_TOKEN in .env.local.',
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
                      'Set SMARTLEAD_API_KEY in .env.local.',
                      'Create a campaign in Smartlead — copy its ID from the URL (/campaigns/{id}).',
                      'Set SMARTLEAD_CAMPAIGN_ID in .env.local.',
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
                  <>
                    <div className="flex flex-wrap gap-1">
                      {['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'].map((v) => (
                        <code key={v} className="text-xs bg-slate-100 border border-slate-200 text-slate-600 px-2 py-0.5 rounded">
                          {v}
                        </code>
                      ))}
                    </div>
                    <ol className="space-y-1 text-xs text-slate-500 list-decimal list-inside">
                      <li>Go to console.cloud.google.com and create or select a project.</li>
                      <li>Enable the Gmail API under APIs & Services.</li>
                      <li>Create OAuth 2.0 credentials — type: Web application.</li>
                      <li>Add Authorised redirect URI: <code className="bg-slate-100 px-1 rounded">/api/gmail/callback</code></li>
                      <li>Set the three env vars in .env.local and restart the dev server.</li>
                      <li>Click Connect Gmail above.</li>
                    </ol>
                  </>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {/* Production checklist link */}
        <div className="mt-4">
          <Link
            href="/production-checklist"
            className="flex items-center gap-3 bg-slate-800 hover:bg-slate-700 transition-colors rounded-xl px-5 py-4 text-white"
          >
            <Rocket size={18} className="text-emerald-400 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-sm">Production Checklist</p>
              <p className="text-xs text-slate-400 mt-0.5">Step-by-step readiness check before enabling live sends.</p>
            </div>
            <span className="text-slate-400 text-xs">→</span>
          </Link>
        </div>

        {/* Env var reference block */}
        <div className="mt-6 bg-slate-800 rounded-xl p-5 text-sm">
          <h3 className="font-semibold text-white mb-1">.env.local reference</h3>
          <p className="text-slate-400 text-xs mb-4">Copy to project root — never commit this file.</p>
          <pre className="text-emerald-300 text-xs overflow-x-auto leading-loose">
{`# ── Required ─────────────────────────────────────────────
MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/pharma-leads

# ── Claude AI (optional) ─────────────────────────────────
CLAUDE_API_KEY=sk-ant-...

# ── Smartlead (email sending) ────────────────────────────
SMARTLEAD_API_KEY=
SMARTLEAD_DRY_RUN=true
SMARTLEAD_CAMPAIGN_ID=

# ── Apollo.io (B2B contact discovery) ────────────────────
APOLLO_API_KEY=

# ── Apify (Google Maps scraping) ─────────────────────────
APIFY_API_TOKEN=
APIFY_GOOGLE_MAPS_ACTOR_ID=
APIFY_WEBSITE_ENRICHMENT_ENABLED=false

# ── Gmail Inbox Sync (backup reply source) ────────────────
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/api/gmail/callback`}
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
