'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/layout/AppShell';
import StatCard from '@/components/ui/StatCard';
import {
  Users,
  CheckCircle,
  MessageSquare,
  Flame,
  Brain,
  FileText,
  Send,
  Archive,
  Bell,
  XCircle,
  Wifi,
  WifiOff,
  Search,
  MapPin,
  Inbox,
  FileCheck,
  AlertTriangle,
  RefreshCw,
  Package,
  Megaphone,
} from 'lucide-react';
import { DashboardStats } from '@/types';

interface HealthData {
  mongoUriSet: boolean;
  mode: 'local' | 'atlas' | 'unknown';
  canConnect: boolean;
  ping: 'OK' | 'Failed';
  smartlead: { configured: boolean; dryRun: boolean; campaignIdPresent: boolean };
}

function SectionLabel({ label }: { label: string }) {
  return (
    <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">
      {label}
    </p>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [health, setHealth] = useState<HealthData | null>(null);

  const applyStatsData = (data: Record<string, unknown>) => {
    if (data.error) {
      if (data.type === 'missing_env') {
        setError('MONGODB_URI is not configured — add it to .env.local and restart.');
      } else if (data.type === 'connection_failed') {
        setError(`MongoDB connection failed (${(data.errorName as string) ?? 'Error'}). Check server logs.`);
      } else {
        setError(data.error as string);
      }
    } else {
      setStats(data as unknown as DashboardStats);
      setError('');
    }
  };

  // Called by the Refresh button — setLoading(true) here is fine (not inside a useEffect)
  const fetchStats = () => {
    setLoading(true);
    fetch('/api/dashboard/stats')
      .then((r) => r.json())
      .then(applyStatsData)
      .catch(() => setError('Failed to load stats'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    // All setState calls are inside async .then()/.catch()/.finally() — not synchronous in the effect body
    fetch('/api/dashboard/stats')
      .then((r) => r.json())
      .then(applyStatsData)
      .catch(() => setError('Failed to load stats'))
      .finally(() => setLoading(false));

    fetch('/api/health')
      .then((r) => r.json())
      .then((data: HealthData) => setHealth(data))
      .catch(() => null);
  }, []);

  const readinessWarnings: { text: string; link?: { href: string; label: string } }[] = [];
  if (health && !health.canConnect) {
    readinessWarnings.push({
      text: `MongoDB is not connected (mode: ${health.mode}, URI ${health.mongoUriSet ? 'set' : 'missing'}) — check MONGODB_URI.`,
    });
  }

  return (
    <AppShell>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Dashboard</h1>
          <p className="text-slate-500 text-sm mt-1">Lead generation pipeline overview</p>
        </div>
        <button
          onClick={fetchStats}
          disabled={loading}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 px-3 py-2 rounded-lg border border-slate-200 hover:bg-white transition-colors disabled:opacity-40"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Warning banner */}
      {readinessWarnings.length > 0 && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 space-y-1.5">
          <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm mb-1">
            <AlertTriangle size={14} />
            System Warning
          </div>
          {readinessWarnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-amber-700">
              <span className="mt-0.5 shrink-0">•</span>
              <span>
                {w.text}
                {w.link && (
                  <Link href={w.link.href} className="ml-2 underline font-medium text-amber-900 hover:text-amber-700">
                    {w.link.label}
                  </Link>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-100 p-5 h-28 animate-pulse" />
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 text-rose-700 text-sm">
          {error}
        </div>
      )}

      {stats && !loading && (
        <div className="space-y-8">
          {/* Pipeline */}
          <div>
            <SectionLabel label="Pipeline" />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard title="Total Leads" value={stats.totalLeads} icon={Users} color="slate" />
              <StatCard title="Qualified" value={stats.qualifiedLeads} icon={CheckCircle} color="emerald" />
              <StatCard title="Warm Leads" value={stats.warmLeads} icon={Flame} color="amber" />
              <StatCard title="Needs Review" value={stats.needsReviewLeads} icon={AlertTriangle} color="rose" />
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
              <StatCard title="Rejected" value={stats.rejectedLeads} icon={XCircle} color="rose" />
              <StatCard title="AI Processed" value={stats.aiProcessedLeads} icon={Brain} color="violet" />
            </div>
          </div>

          {/* Replies */}
          <div>
            <SectionLabel label="Replies" />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard title="Replies Received" value={stats.replies} icon={MessageSquare} color="violet" />
              <StatCard title="Needs Review" value={stats.repliesNeedingApproval} icon={Bell} color="amber" />
              <StatCard title="Unhandled" value={stats.unhandledReplies} icon={Inbox} color="violet" />
              <StatCard title="AI Drafts Pending" value={stats.aiDraftsPending} icon={FileCheck} color="blue" />
            </div>
          </div>

          {/* Email Activity */}
          <div>
            <SectionLabel label="Email Activity" />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard title="Draft Emails" value={stats.emailsDraft} icon={FileText} color="slate" />
              <StatCard title="Emails Sent" value={stats.emailsSent} icon={Send} color="blue" />
              <StatCard title="Failed Sends" value={stats.emailsFailed} icon={XCircle} color="rose" />
              <StatCard title="No Reply Archived" value={stats.noReplyLeads} icon={Archive} color="slate" />
            </div>
          </div>

          {/* Smartlead status */}
          <div className={`rounded-2xl border p-4 flex items-center gap-3 text-sm ${
            stats.smartleadConfigured && !stats.smartleadDryRun
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : stats.smartleadConfigured
              ? 'bg-amber-50 border-amber-200 text-amber-800'
              : 'bg-slate-50 border-slate-200 text-slate-600'
          }`}>
            {stats.smartleadConfigured && !stats.smartleadDryRun ? (
              <Wifi size={15} className="shrink-0" />
            ) : (
              <WifiOff size={15} className="shrink-0" />
            )}
            <div>
              <span className="font-semibold">Smartlead: </span>
              {!stats.smartleadConfigured && 'Not configured — add your API key in Settings to enable sending.'}
              {stats.smartleadConfigured && stats.smartleadDryRun && 'Dry-run mode — emails validated but not sent. Disable dry run in Settings to go live.'}
              {stats.smartleadConfigured && !stats.smartleadDryRun && 'Live mode — emails are being sent via Smartlead.'}
            </div>
          </div>

          {/* Management */}
          <div>
            <SectionLabel label="Management" />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard title="Products" value={stats.productCount} icon={Package} color="slate" />
              <StatCard title="Campaigns" value={stats.campaignCount} icon={Megaphone} color="blue" />
            </div>
          </div>

          {/* Lead Discovery */}
          <div>
            <SectionLabel label="Lead Discovery" />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard title="Apollo (Today)" value={stats.apolloLeadsToday} icon={Search} color="blue" />
              <StatCard title="Apollo (Total)" value={stats.apolloLeadsTotal} icon={Users} color="slate" />
              <StatCard title="Apify (Today)" value={stats.apifyLeadsToday} icon={MapPin} color="emerald" />
              <StatCard title="Apify (Total)" value={stats.apifyLeadsTotal} icon={Users} color="slate" />
            </div>
          </div>

          {stats.lastUpdated && (
            <p className="text-xs text-slate-400 text-right">
              Last updated: {new Date(stats.lastUpdated).toLocaleString()}
            </p>
          )}
        </div>
      )}
    </AppShell>
  );
}
