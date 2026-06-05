'use client';

import AppShell from '@/components/layout/AppShell';
import Link from 'next/link';
import { Archive, Info } from 'lucide-react';

export default function FollowUpsPage() {
  return (
    <AppShell>
      <div className="max-w-xl">
        <h1 className="text-2xl font-bold text-slate-800 mb-1">Follow-Ups</h1>
        <p className="text-slate-500 text-sm mb-6">Automated follow-up scheduling is no longer active.</p>

        <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Info size={15} className="text-slate-400 shrink-0" />
            <span className="text-sm font-semibold text-slate-600">Manual follow-up workflow</span>
          </div>
          <p className="text-sm text-slate-600 leading-relaxed mb-4">
            Follow-ups are handled manually. Go to <strong>No Reply Leads</strong>, select the
            leads you want to follow up with, choose a campaign, and click <strong>Add to Campaign</strong>.
          </p>
          <Link
            href="/leads/no-reply"
            className="inline-flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-700 transition-colors"
          >
            <Archive size={14} />
            Go to No Reply Leads
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
