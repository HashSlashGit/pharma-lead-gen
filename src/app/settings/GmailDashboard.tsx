'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle,
  XCircle,
  RefreshCw,
  Loader2,
  Inbox,
  Users,
  Copy,
  Pencil,
  Power,
  PowerOff,
  Trash2,
} from 'lucide-react';

// ── Types (mirror the /api/gmail/status response) ──────────────────────────

type AccountStatus = 'active' | 'rate_limited' | 'disabled' | 'auth_error';

interface GmailAccountDetail {
  id: string;
  email: string;
  displayName: string | null;
  isActive: boolean;
  accountType: 'workspace' | 'personal';
  isNewest: boolean;
  status: AccountStatus;
  connectedSince: string;
  lastSyncedAt: string | null;
  lastEmailSentAt: string | null;
  emailsSentToday: number;
  dailyLimit: number;
  remainingQuota: number;
  rotationPosition: number | null;
  diagnostics: {
    mailboxId: string;
    tokenExpiry: string | null;
    hasRefreshToken: boolean;
    lastRotationSelectedAt: string | null;
  };
}

interface RotationInfo {
  enabled: boolean;
  connectedAccounts: number;
  availableAccounts: number;
  totalDailyCapacity: number;
  emailsSentToday: number;
  remainingCapacity: number;
  nextMailbox: string | null;
}

interface GmailStatusResponse {
  configured: boolean;
  connected: boolean;
  accounts: GmailAccountDetail[];
  rotation: RotationInfo;
}

const POLL_INTERVAL_MS = 60_000;

// ── Formatting helpers ──────────────────────────────────────────────────────

function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'Never';
  const diffSec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diffSec < 5) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

// ── Health badge (Feature 3) ────────────────────────────────────────────────

function computeHealthBadge(account: GmailAccountDetail): { color: 'green' | 'yellow' | 'red' | 'gray'; label: string } {
  if (account.status === 'disabled') return { color: 'gray', label: 'Disabled' };
  if (account.status === 'auth_error') return { color: 'red', label: 'Authentication Failed' };
  const pct = account.dailyLimit > 0 ? (account.emailsSentToday / account.dailyLimit) * 100 : 0;
  if (pct >= 100) return { color: 'red', label: 'Daily Limit Reached' };
  if (pct > 75) return { color: 'yellow', label: 'Approaching Daily Limit' };
  return { color: 'green', label: 'Connected · Healthy' };
}

const BADGE_STYLES: Record<string, string> = {
  green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  yellow: 'bg-amber-50 text-amber-700 border-amber-200',
  red: 'bg-rose-50 text-rose-700 border-rose-200',
  gray: 'bg-slate-50 text-slate-500 border-slate-200',
};

function HealthBadge({ account }: { account: GmailAccountDetail }) {
  const { color, label } = computeHealthBadge(account);
  return (
    <span
      role="status"
      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border shrink-0 ${BADGE_STYLES[color]}`}
    >
      <span className="sr-only">Mailbox status:</span>
      {label}
    </span>
  );
}

// ── Actionable error copy (Feature 7) ───────────────────────────────────────

function actionableMessage(account: GmailAccountDetail, rotation: RotationInfo): string | null {
  if (account.status === 'auth_error') {
    return 'Authentication expired — reconnect this Gmail account to resume sending.';
  }
  if (account.status === 'disabled') {
    return 'Mailbox disabled — enable it to resume sending.';
  }
  if (account.status === 'rate_limited') {
    return rotation.connectedAccounts > 1
      ? 'Daily quota reached — sending will automatically switch to another mailbox.'
      : 'Daily quota reached — connect another Gmail account to keep sending today.';
  }
  return null;
}

// ── Usage progress bar (Feature 4) ──────────────────────────────────────────

function UsageBar({ sent, limit }: { sent: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, Math.round((sent / limit) * 100)) : 0;
  const colorClass =
    pct > 95 ? 'bg-rose-500' : pct > 90 ? 'bg-orange-500' : pct > 75 ? 'bg-amber-400' : 'bg-emerald-500';

  return (
    <div>
      <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
        <span>{sent.toLocaleString()} / {limit.toLocaleString()} emails</span>
        <span>{pct}%</span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Daily send usage: ${sent} of ${limit} emails (${pct}%)`}
        className="h-1.5 rounded-full bg-slate-100 overflow-hidden"
      >
        <div className={`h-full rounded-full transition-all ${colorClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── Small stat block for the rotation summary ───────────────────────────────

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="text-sm font-semibold text-slate-800 truncate">{value}</dd>
    </div>
  );
}

// ── Feature 2: Mailbox Rotation summary ─────────────────────────────────────

function RotationSummary({ rotation }: { rotation: RotationInfo }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4" aria-label="Mailbox rotation status">
      <div className="flex items-center gap-2 mb-3">
        <Users size={16} className="text-blue-600" aria-hidden="true" />
        <h2 className="font-semibold text-slate-800">Mailbox Rotation</h2>
        <span
          role="status"
          className={`ml-auto inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${
            rotation.enabled ? BADGE_STYLES.green : BADGE_STYLES.gray
          }`}
        >
          {rotation.enabled ? <CheckCircle size={12} aria-hidden="true" /> : <XCircle size={12} aria-hidden="true" />}
          {rotation.enabled ? 'Enabled' : 'Disabled'}
        </span>
      </div>
      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Stat label="Connected Accounts" value={rotation.connectedAccounts} />
        <Stat label="Available Accounts" value={rotation.availableAccounts} />
        <Stat label="Total Daily Capacity" value={rotation.totalDailyCapacity.toLocaleString()} />
        <Stat label="Emails Sent Today" value={rotation.emailsSentToday.toLocaleString()} />
        <Stat label="Remaining Capacity" value={rotation.remainingCapacity.toLocaleString()} />
        <Stat label="Next Mailbox" value={rotation.nextMailbox ?? '—'} />
      </dl>
    </div>
  );
}

// ── Feature 1/3/4/5/7/8: per-mailbox card ───────────────────────────────────

function MailboxCard({
  account,
  rotation,
  onChanged,
}: {
  account: GmailAccountDetail;
  rotation: RotationInfo;
  onChanged: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [nameInput, setNameInput] = useState(account.displayName ?? '');
  const [savingName, setSavingName] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<{ healthy: boolean; error?: string } | null>(null);
  const [toggling, setToggling] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [copied, setCopied] = useState(false);

  const patch = async (body: Record<string, unknown>) => {
    const res = await fetch('/api/gmail/account', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: account.email, ...body }),
    });
    return res.json();
  };

  const handleRename = async () => {
    setSavingName(true);
    try {
      await patch({ displayName: nameInput });
      setRenaming(false);
      onChanged();
    } finally {
      setSavingName(false);
    }
  };

  const handleToggleActive = async () => {
    setToggling(true);
    try {
      await patch({ isActive: !account.isActive });
      onChanged();
    } finally {
      setToggling(false);
    }
  };

  const handleRefreshStatus = async () => {
    setChecking(true);
    setCheckResult(null);
    try {
      const res = await fetch('/api/gmail/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: account.email }),
      });
      setCheckResult(await res.json());
      onChanged();
    } finally {
      setChecking(false);
    }
  };

  const handleRemove = async () => {
    if (!window.confirm(`Remove ${account.email}? This can't be undone — this mailbox will stop receiving sends.`)) {
      return;
    }
    setRemoving(true);
    try {
      await fetch(`/api/gmail/account?email=${encodeURIComponent(account.email)}`, { method: 'DELETE' });
      onChanged();
    } finally {
      setRemoving(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(account.email);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — nothing to fall back to.
    }
  };

  const message = actionableMessage(account, rotation);
  const actionBtn = 'flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-50';

  return (
    <div className="rounded-lg border border-slate-200 p-4 space-y-3" role="group" aria-label={`Gmail account ${account.email}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-slate-800 truncate">{account.displayName || account.email}</span>
            {account.isNewest && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200 shrink-0">
                Newest
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
            <span className="truncate">{account.email}</span>
            <button
              type="button"
              onClick={handleCopy}
              aria-label={`Copy address ${account.email}`}
              className="text-slate-400 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded"
            >
              <Copy size={11} />
            </button>
            {copied && <span className="text-emerald-600">Copied</span>}
          </div>
        </div>
        <HealthBadge account={account} />
      </div>

      {message && (
        <div role="status" className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {message}
        </div>
      )}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-500">
        <div>Connected since <span className="text-slate-700">{formatDateTime(account.connectedSince)}</span></div>
        <div>Last sync <span className="text-slate-700">{formatRelativeTime(account.lastSyncedAt)}</span></div>
        <div>Last sent <span className="text-slate-700">{formatRelativeTime(account.lastEmailSentAt)}</span></div>
        <div>Remaining quota <span className="text-slate-700">{account.remainingQuota.toLocaleString()}</span></div>
      </dl>

      <UsageBar sent={account.emailsSentToday} limit={account.dailyLimit} />

      <div className="flex flex-wrap gap-2" role="group" aria-label={`Actions for ${account.email}`}>
        <a href="/api/gmail/connect" className={actionBtn} aria-label={`Reconnect ${account.email}`}>
          <Inbox size={12} aria-hidden="true" /> Reconnect
        </a>
        <button type="button" onClick={handleRefreshStatus} disabled={checking} className={actionBtn} aria-label={`Refresh status for ${account.email}`}>
          {checking ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={12} aria-hidden="true" />}
          Refresh Status
        </button>
        <button
          type="button"
          onClick={() => { setRenaming((r) => !r); setNameInput(account.displayName ?? ''); }}
          className={actionBtn}
          aria-expanded={renaming}
          aria-label={`Rename sender for ${account.email}`}
        >
          <Pencil size={12} aria-hidden="true" /> {renaming ? 'Cancel' : 'Edit Name'}
        </button>
        <button
          type="button"
          onClick={handleToggleActive}
          disabled={toggling}
          className={actionBtn}
          aria-label={account.isActive ? `Disable ${account.email}` : `Enable ${account.email}`}
        >
          {toggling ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : account.isActive ? <PowerOff size={12} aria-hidden="true" /> : <Power size={12} aria-hidden="true" />}
          {account.isActive ? 'Disable' : 'Enable'}
        </button>
        <button
          type="button"
          onClick={handleRemove}
          disabled={removing}
          className={`${actionBtn} text-rose-600 border-rose-200 hover:bg-rose-50`}
          aria-label={`Remove ${account.email}`}
        >
          {removing ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : <Trash2 size={12} aria-hidden="true" />}
          Remove
        </button>
      </div>

      {renaming && (
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor={`display-name-${account.id}`}>Sender display name for {account.email}</label>
          <input
            id={`display-name-${account.id}`}
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="e.g. United Pharmacy Online"
            className="text-xs border border-slate-200 rounded px-2 py-1 flex-1 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <button
            type="button"
            onClick={handleRename}
            disabled={savingName}
            className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            {savingName ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}

      {checkResult && (
        <div role="status" className={`text-xs ${checkResult.healthy ? 'text-emerald-700' : 'text-rose-700'}`}>
          {checkResult.healthy ? 'Token check passed — account is authenticated.' : `Auth check failed: ${checkResult.error ?? 'unknown error'}`}
        </div>
      )}

      {/* Feature 8: diagnostics, native <details> — accessible + collapsed by default, no extra state or dependency needed */}
      <details className="text-xs">
        <summary className="cursor-pointer select-none text-slate-500 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded">
          Diagnostics
        </summary>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-slate-500">
          <dt>OAuth Status</dt><dd className="text-slate-700">{account.status === 'auth_error' ? 'Invalid' : 'Valid'}</dd>
          <dt>Token Expiry</dt><dd className="text-slate-700">{formatDateTime(account.diagnostics.tokenExpiry)}</dd>
          <dt>Refresh Token Present</dt><dd className="text-slate-700">{account.diagnostics.hasRefreshToken ? 'Yes' : 'No'}</dd>
          <dt>Last OAuth Refresh</dt><dd className="text-slate-700">{formatDateTime(account.diagnostics.tokenExpiry)} (est. from token expiry)</dd>
          <dt>Mailbox ID</dt><dd className="text-slate-700 truncate" title={account.diagnostics.mailboxId}>{account.diagnostics.mailboxId}</dd>
          <dt>Rotation Position</dt>
          <dd className="text-slate-700">
            {account.rotationPosition ? `${account.rotationPosition} of ${rotation.connectedAccounts}` : 'Not in rotation'}
          </dd>
          <dt>Last API Error</dt>
          <dd className="text-slate-700">{checkResult && !checkResult.healthy ? checkResult.error : 'None recorded this session'}</dd>
          <dt>Current Send Queue</dt><dd className="text-slate-700">N/A — sends are synchronous</dd>
          <dt>Last Successful Send</dt><dd className="text-slate-700">{formatDateTime(account.lastEmailSentAt)}</dd>
        </dl>
      </details>
    </div>
  );
}

// ── Main dashboard ───────────────────────────────────────────────────────────

export default function GmailDashboard() {
  const [data, setData] = useState<GmailStatusResponse | null>(null);
  const [loadError, setLoadError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ success: boolean; message: string; checked: number; duplicates: number; skippedNoLead: number } | null>(null);
  const [connectedNotice, setConnectedNotice] = useState('');
  const [errorNotice, setErrorNotice] = useState('');
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Holds the latest fetchStatus so the retry timeout below can call it
  // without capturing a stale closure or self-referencing before it's declared.
  const fetchStatusRef = useRef<() => void>(() => {});

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/gmail/status');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: GmailStatusResponse = await res.json();
      setData(json);
      setLoadError('');
    } catch {
      // Feature 7: actionable, transient message + a single quick retry
      // rather than silently failing or hammering the endpoint.
      setLoadError('Connection lost. Retrying…');
      if (!retryTimer.current) {
        retryTimer.current = setTimeout(() => {
          retryTimer.current = null;
          fetchStatusRef.current();
        }, 5000);
      }
    }
  }, []);

  useEffect(() => {
    fetchStatusRef.current = fetchStatus;
  }, [fetchStatus]);

  useEffect(() => {
    Promise.resolve().then(() => fetchStatus());
    return () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, [fetchStatus]);

  // Detect ?gmail=connected / ?gmail=error after the OAuth redirect. The
  // setState calls are deferred a tick (Promise.resolve().then) so they
  // don't run synchronously inside the effect body.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const gmailParam = params.get('gmail');
    Promise.resolve(gmailParam).then((gp) => {
      if (gp === 'connected') {
        const connectedEmail = params.get('gmail_email');
        setConnectedNotice(connectedEmail ? `Gmail connected: ${connectedEmail}` : 'Gmail connected successfully!');
        fetchStatus();
      } else if (gp === 'error') {
        const errCode = params.get('gmail_error') ?? 'unknown';
        setErrorNotice(`Gmail connection failed (${errCode}). Check credentials and try again.`);
      }
    });
  }, [fetchStatus]);

  // Feature 6: poll every 60s, but only while the tab is visible, and stop on unmount.
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') fetchStatus();
    }, POLL_INTERVAL_MS);

    function handleVisibility() {
      if (document.visibilityState === 'visible') fetchStatus();
    }
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [fetchStatus]);

  const handleGmailSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/gmail/sync', { method: 'POST' });
      const json = await res.json();
      setSyncResult(json);
      if (json.success) fetchStatus();
    } catch {
      setSyncResult({ success: false, message: 'Sync request failed — check network and try again.', checked: 0, duplicates: 0, skippedNoLead: 0 });
    } finally {
      setSyncing(false);
    }
  };

  if (!data) {
    return (
      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm h-24 animate-pulse" />
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm h-32 animate-pulse" />
      </div>
    );
  }

  if (!data.configured) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4 text-sm text-amber-700 bg-amber-50">
        Add your Google OAuth credentials (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI) to enable Gmail.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Feature 2 */}
      <RotationSummary rotation={data.rotation} />

      {/* Feature 1/3/4/5/7/8: account dashboard */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
          <div className="p-2 rounded-lg text-blue-600 bg-blue-50">
            <Inbox size={16} aria-hidden="true" />
          </div>
          <div className="flex-1">
            <h2 className="font-semibold text-slate-800">Gmail Accounts</h2>
            <p className="text-xs text-slate-400 mt-0.5">Every connected account is used for send rotation and inbox reply sync.</p>
          </div>
        </div>

        {data.accounts.length > 0 && (
          <div className="px-5 py-4 border-b border-slate-100 space-y-3">
            {data.accounts.map((account) => (
              <MailboxCard key={account.id} account={account} rotation={data.rotation} onChanged={fetchStatus} />
            ))}
          </div>
        )}

        <div className="px-5 py-4 space-y-3">
          {connectedNotice && (
            <div role="status" className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              <CheckCircle size={12} aria-hidden="true" /> {connectedNotice}
            </div>
          )}
          {errorNotice && (
            <div role="alert" className="flex items-center gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              <XCircle size={12} aria-hidden="true" /> {errorNotice}
            </div>
          )}
          {loadError && (
            <div role="alert" className="flex items-center gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              <XCircle size={12} aria-hidden="true" /> {loadError}
            </div>
          )}
          {syncResult && (
            <div role="status" className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2 ${syncResult.success ? 'text-emerald-700 bg-emerald-50 border border-emerald-200' : 'text-rose-700 bg-rose-50 border border-rose-200'}`}>
              {syncResult.success ? <CheckCircle size={12} className="shrink-0 mt-0.5" aria-hidden="true" /> : <XCircle size={12} className="shrink-0 mt-0.5" aria-hidden="true" />}
              <div>
                <span className="font-medium">{syncResult.message}</span>
                {syncResult.success && (
                  <span className="ml-1 text-slate-500">
                    · {syncResult.checked} checked · {syncResult.duplicates} duplicate{syncResult.duplicates !== 1 ? 's' : ''} · {syncResult.skippedNoLead} unmatched
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            {data.accounts.length > 0 && (
              <button
                type="button"
                onClick={handleGmailSync}
                disabled={syncing}
                className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              >
                {syncing ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={12} aria-hidden="true" />}
                {syncing ? 'Syncing…' : 'Sync Now'}
              </button>
            )}
            <a
              href="/api/gmail/connect"
              className="flex items-center gap-2 px-3 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            >
              <Inbox size={12} aria-hidden="true" />
              {data.accounts.length > 0 ? 'Connect Another Account' : 'Connect Gmail'}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
