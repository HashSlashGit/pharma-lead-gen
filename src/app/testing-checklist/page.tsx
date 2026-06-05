'use client';

import { redirect } from 'next/navigation';
import { useState } from 'react';
import AppShell from '@/components/layout/AppShell';

if (process.env.NODE_ENV === 'production') {
  redirect('/dashboard');
}
import { CheckSquare, Square, ExternalLink, AlertTriangle, RotateCcw } from 'lucide-react';
import Link from 'next/link';

interface CheckItem {
  id: string;
  title: string;
  description: string;
  steps: string[];
  pass: string;
  href?: string;
  linkLabel?: string;
  warn?: string;
}

const CHECKS: CheckItem[] = [
  {
    id: 'mongodb',
    title: 'MongoDB connection',
    description: 'Verify the database is reachable before testing anything else.',
    steps: [
      'Open the Settings page.',
      'Check that the MongoDB row shows a green "Connected" badge.',
      'If red: verify MONGODB_URI in .env.local and that your IP is whitelisted in Atlas Network Access.',
    ],
    pass: 'Settings page shows "Connected" in green.',
    href: '/settings',
    linkLabel: 'Settings',
  },
  {
    id: 'seed',
    title: 'Seed sample data',
    description: 'Populate the database with realistic test records before running other checks.',
    steps: [
      'Open Dev Tools.',
      'Click "Seed sample data".',
      'Confirm success message shows created counts.',
    ],
    pass: 'Success message: 3 products, 1 campaign, 5 leads, 4 email logs, 2 replies, 1 no-reply lead.',
    href: '/dev-tools',
    linkLabel: 'Dev Tools',
  },
  {
    id: 'add-product',
    title: 'Add product',
    description: 'Create a new product manually to verify the Products CRUD.',
    steps: [
      'Open Products page.',
      'Fill in name, category, pricing, MOQ.',
      'Submit and confirm the product appears in the list.',
    ],
    pass: 'Product visible in the Products list with correct fields.',
    href: '/products',
    linkLabel: 'Products',
  },
  {
    id: 'add-lead',
    title: 'Add lead manually',
    description: 'Create a single lead via the Add Lead form.',
    steps: [
      'Open Add Lead page.',
      'Fill in company name, country, category, and email.',
      'Submit and verify the lead appears in Leads with a computed score.',
    ],
    pass: 'Lead created with correct status based on score (email+25 + country+10 + category keyword+25 = ≥60 → needs_review or qualified).',
    href: '/leads/new',
    linkLabel: 'Add Lead',
  },
  {
    id: 'csv-import',
    title: 'CSV import',
    description: 'Import multiple leads from a CSV file.',
    steps: [
      'Open Import CSV page.',
      'Download or create a CSV with columns: companyName, country, category, email, phone, website.',
      'Upload the file and review the preview.',
      'Confirm import — check the Leads list for new entries.',
      'Verify duplicates are skipped if you import the same file twice.',
    ],
    pass: 'Leads imported with correct scores. Duplicate import shows 0 new records.',
    href: '/leads/import',
    linkLabel: 'Import CSV',
  },
  {
    id: 'apollo',
    title: 'Apollo search',
    description: 'Search for B2B contacts via Apollo.io (requires APOLLO_API_KEY).',
    steps: [
      'Open Apollo Search page.',
      'Enter a keyword (e.g. "pharmacy") and a country.',
      'Click Search and wait for results.',
      'Select a non-duplicate result and click Import.',
      'Verify the lead appears in Leads.',
    ],
    pass: 'Results appear with score preview and duplicate badges. Selected lead imports successfully.',
    href: '/apollo',
    linkLabel: 'Apollo Search',
    warn: 'Skip if APOLLO_API_KEY is not configured — the page will show a "not configured" message.',
  },
  {
    id: 'apify',
    title: 'Apify Google Maps search',
    description: 'Scrape local businesses from Google Maps (requires APIFY_API_TOKEN, takes 30–90 s).',
    steps: [
      'Open Maps Scraper page.',
      'Enter keyword (e.g. "pharmacy"), city, and country.',
      'Click Search Google Maps and wait for the actor to complete.',
      'Review results and import selected records.',
    ],
    pass: 'Results appear with Maps link, phone, website. Imported leads show source = apify.',
    href: '/apify',
    linkLabel: 'Maps Scraper',
    warn: 'Skip if APIFY_API_TOKEN is not configured.',
  },
  {
    id: 'ai-personalize',
    title: 'AI personalization',
    description: 'Generate a personalized outbound email for a qualified lead (requires CLAUDE_API_KEY, score ≥ 70).',
    steps: [
      'Open the Leads list and click a qualified lead (score ≥ 70).',
      'On the lead detail page, click "Personalize with AI".',
      'Wait for the email draft to appear.',
      'Verify the email is contextual and references the company/country/category.',
    ],
    pass: 'Email draft generated, EmailLog created with status "pending". Claude usage logged on Dashboard.',
    href: '/leads',
    linkLabel: 'Leads',
    warn: 'Skip if CLAUDE_API_KEY is not configured.',
  },
  {
    id: 'compose',
    title: 'Manual email compose',
    description: 'Draft an email manually using the Compose page — no AI or Smartlead credits used.',
    steps: [
      'Open Compose Email.',
      'Select a lead from the dropdown (type to filter).',
      'Select a product.',
      'Edit subject and body; use the variable buttons to insert {{companyName}} etc.',
      'Click Preview to verify variable rendering.',
      'Click Save Draft — confirm success toast.',
      'Optionally click "Improve with AI" if CLAUDE_API_KEY is configured.',
    ],
    pass: 'Draft saved. EmailLog record visible in DB with status "pending". No external calls made on save.',
    href: '/compose',
    linkLabel: 'Compose',
  },
  {
    id: 'test-send',
    title: 'Test send (dry run)',
    description: 'Send an email through the dry-run flow — validates without calling Smartlead.',
    steps: [
      'Ensure SMARTLEAD_DRY_RUN=true in .env.local.',
      'Open Compose Email and save a draft for a non-blocked lead.',
      'Click "Test Send".',
      'Verify the button shows "Test Send" (not "Send via Smartlead").',
      'Check Settings to confirm Smartlead shows "Test Mode".',
    ],
    pass: 'EmailLog status updates to "ready_to_send_test". No real email sent.',
    href: '/compose',
    linkLabel: 'Compose',
    warn: 'Set SMARTLEAD_DRY_RUN=true. Never test-send with real leads unless live mode is intended.',
  },
  {
    id: 'follow-up',
    title: 'Manual follow-up via No Reply Leads',
    description: 'Send follow-up outreach by selecting no-reply leads and adding them to a campaign.',
    steps: [
      'Open No Reply Leads.',
      'Select one or more leads using the checkboxes.',
      'Choose a campaign from the dropdown.',
      'Click "Add to Campaign" and confirm the success message.',
    ],
    pass: 'Selected leads are added to the campaign. Campaign lead count updates correctly.',
    href: '/leads/no-reply',
    linkLabel: 'No Reply Leads',
  },
  {
    id: 'gmail-reply',
    title: 'Gmail reply sync',
    description: 'Verify that replies sent to the connected Gmail inbox appear in the Reply Inbox.',
    steps: [
      'Ensure Gmail is connected (Settings → Gmail Inbox Sync shows Connected).',
      'Send a test outbound email via Compose to an address you control.',
      'Reply to that email from the recipient address.',
      'Go to Settings → Gmail Inbox Sync and click Sync Now.',
      'Open the Reply Inbox — the reply should appear with classification.',
    ],
    pass: 'Reply visible in Reply Inbox with correct classification and source = "gmail".',
    href: '/replies',
    linkLabel: 'Reply Inbox',
    warn: 'Gmail must be connected in Settings before replies can sync.',
  },
  {
    id: 'reply-approval',
    title: 'Reply AI draft + approval',
    description: 'Generate an AI draft reply and approve it for sending.',
    steps: [
      'Open Reply Inbox.',
      'Click on the MediGlobe pricing_query reply (seeded — draft already generated).',
      'Review the AI draft.',
      'Click "Approve & Send" — confirm dry-run toast.',
      'For the CarePoint "interested" reply: click "Generate AI Draft" first, then approve.',
    ],
    pass: 'Reply status updates to "draft_approved". EmailLog status updates to "ready_to_send_test" (dry run) or "sent" (live).',
    href: '/replies',
    linkLabel: 'Reply Inbox',
    warn: 'AI draft generation requires CLAUDE_API_KEY.',
  },
  {
    id: 'no-reply',
    title: 'No-reply archive',
    description: 'Verify the no-reply archive shows leads contacted with no response.',
    steps: [
      'Open No Reply Leads.',
      'Confirm "[SAMPLE] Generic Pharma Supplies" is listed.',
      'Check that company name, country, and last emailed date are correct.',
    ],
    pass: 'No-reply lead visible with correct companyName and country.',
    href: '/leads/no-reply',
    linkLabel: 'No Reply',
  },
  {
    id: 'dashboard',
    title: 'Dashboard stats',
    description: 'Verify all counters update correctly after seeding.',
    steps: [
      'Open Dashboard after seeding.',
      'Verify: Total Leads ≥ 5, Qualified Leads ≥ 1, Warm Leads ≥ 1.',
      'Verify: Emails Draft = 2 (pending initial drafts), Replies Needing Approval = 2.',
    ],
    pass: 'All stat cards show non-zero values that match the seeded records.',
    href: '/dashboard',
    linkLabel: 'Dashboard',
  },
  {
    id: 'health',
    title: 'Settings health check',
    description: 'Confirm the health page correctly reflects configured vs missing services.',
    steps: [
      'Open Settings page.',
      'Verify MongoDB shows "Connected" (green).',
      'Verify each service card shows the correct status for your .env.local.',
      'Remove a key from .env.local, restart dev server, re-check — that service should turn grey/red.',
      'Restore the key and restart.',
    ],
    pass: 'Health statuses match actual .env.local contents. No secrets visible in browser.',
    href: '/settings',
    linkLabel: 'Settings',
  },
  {
    id: 'reset',
    title: 'Reset sample data',
    description: 'Clean up all seeded records to leave the database in a clean state.',
    steps: [
      'Open Dev Tools.',
      'Click "Reset sample data".',
      'Confirm success message shows deleted counts.',
      'Check Dashboard — counts should drop back to pre-seed values.',
      'Check Leads, Products, Replies — sample records should be gone.',
    ],
    pass: 'All [SAMPLE] and source=sample records deleted. Real data untouched.',
    href: '/dev-tools',
    linkLabel: 'Dev Tools',
  },
];

export default function TestingChecklistPage() {
  const [checked, setChecked] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function reset() {
    setChecked(new Set());
  }

  const completedCount = checked.size;
  const totalCount = CHECKS.length;
  const progressPct = Math.round((completedCount / totalCount) * 100);

  return (
    <AppShell>
      <div className="max-w-2xl">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">QA Testing Checklist</h1>
            <p className="text-slate-500 text-sm mt-1">
              Walk through every feature before going live. Checks are local to this session — not persisted.
            </p>
          </div>
          <button
            onClick={reset}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors shrink-0"
          >
            <RotateCcw size={12} />
            Reset
          </button>
        </div>

        {/* Progress bar */}
        <div className="mb-6">
          <div className="flex justify-between text-xs text-slate-500 mb-1.5">
            <span>{completedCount} of {totalCount} completed</span>
            <span>{progressPct}%</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Checklist */}
        <div className="space-y-3">
          {CHECKS.map((check, i) => {
            const done = checked.has(check.id);
            return (
              <div
                key={check.id}
                className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-colors ${
                  done ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-200'
                }`}
              >
                {/* Header row */}
                <button
                  onClick={() => toggle(check.id)}
                  className="w-full flex items-start gap-3 px-5 py-4 text-left group"
                >
                  <div className="shrink-0 mt-0.5">
                    {done ? (
                      <CheckSquare size={20} className="text-emerald-500" />
                    ) : (
                      <Square size={20} className="text-slate-300 group-hover:text-slate-400 transition-colors" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium text-slate-400">#{i + 1}</span>
                      <span className={`font-semibold text-sm ${done ? 'text-emerald-800 line-through decoration-emerald-400' : 'text-slate-800'}`}>
                        {check.title}
                      </span>
                      {done && (
                        <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">Done</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{check.description}</p>
                  </div>
                  {check.href && (
                    <Link
                      href={check.href}
                      onClick={(e) => e.stopPropagation()}
                      className="shrink-0 flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 border border-emerald-200 rounded px-2 py-1 hover:bg-emerald-50 transition-colors"
                    >
                      {check.linkLabel}
                      <ExternalLink size={10} />
                    </Link>
                  )}
                </button>

                {/* Detail — always visible */}
                <div className="px-5 pb-4 pl-14 space-y-3">
                  <div>
                    <p className="text-xs font-medium text-slate-600 mb-1.5">Steps</p>
                    <ol className="space-y-1 text-xs text-slate-500 list-decimal list-inside">
                      {check.steps.map((step, j) => (
                        <li key={j}>{step}</li>
                      ))}
                    </ol>
                  </div>
                  <div className="flex items-start gap-2 bg-slate-50 rounded-lg px-3 py-2">
                    <CheckSquare size={12} className="text-emerald-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-slate-600">
                      <span className="font-medium">Pass: </span>{check.pass}
                    </p>
                  </div>
                  {check.warn && (
                    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      <AlertTriangle size={12} className="text-amber-500 shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-700">{check.warn}</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {completedCount === totalCount && (
          <div className="mt-6 bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-4 text-center">
            <p className="text-emerald-800 font-semibold">All {totalCount} checks passed.</p>
            <p className="text-emerald-600 text-sm mt-1">
              The system is ready for production. Review the deployment checklist in the README before going live.
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
