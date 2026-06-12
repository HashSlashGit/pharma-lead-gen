'use client';

import { useEffect, useState } from 'react';
import AppShell from '@/components/layout/AppShell';
import StatusBadge from '@/components/ui/StatusBadge';
import { CampaignRow, CampaignActivityData } from '@/types';
import {
  Megaphone,
  PlusCircle,
  X,
  CheckCircle,
  AlertTriangle,
  Mail,
  MessageSquare,
  WifiOff,
  Users,
  ChevronDown,
  ChevronUp,
  Loader2,
  Clock,
  Archive,
  Wifi,
} from 'lucide-react';

const empty = { name: '', targetCountry: '', targetCategory: '', status: 'draft' as const };

interface SmartleadConfig {
  configured: boolean;
  dryRun: boolean;
  campaignIdPresent: boolean;
  campaignId: string | null;
  fromEmailConfigured: boolean;
  mode: 'no_key' | 'dry_run' | 'live';
}

type ActivityTab = 'leads' | 'emails' | 'replies' | 'no-reply';

const EMAIL_STATUS_STYLES: Record<string, string> = {
  pending:            'text-slate-500 bg-slate-50 ring-1 ring-slate-200',
  ready_to_send_test: 'text-amber-700 bg-amber-50 ring-1 ring-amber-200',
  sent:               'text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200',
  failed:             'text-rose-700 bg-rose-50 ring-1 ring-rose-200',
  opened:             'text-blue-700 bg-blue-50 ring-1 ring-blue-200',
  clicked:            'text-violet-700 bg-violet-50 ring-1 ring-violet-200',
};

const EMAIL_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending', ready_to_send_test: 'Test Sent',
  sent: 'Sent', failed: 'Failed', opened: 'Opened', clicked: 'Clicked',
};

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(empty);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok?: boolean; error?: string } | null>(null);
  const [slConfig, setSlConfig] = useState<SmartleadConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);

  const [expandedCampaignId, setExpandedCampaignId] = useState<string | null>(null);
  const [activityMap, setActivityMap] = useState<Record<string, CampaignActivityData>>({});
  const [loadingActivityId, setLoadingActivityId] = useState<string | null>(null);
  const [activityTabMap, setActivityTabMap] = useState<Record<string, ActivityTab>>({});

  const fetchCampaigns = () => {
    setLoading(true);
    fetch('/api/campaigns')
      .then((r) => r.json())
      .then((data) => setCampaigns(data.campaigns ?? []))
      .catch((err) => console.error('[campaigns] fetch failed:', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchCampaigns();
    fetch('/api/config')
      .then((r) => r.json())
      .then((data) => setSlConfig((data.smartlead as SmartleadConfig) ?? null))
      .catch((err) => console.error('[campaigns] config fetch failed:', err))
      .finally(() => setConfigLoading(false));
  }, []);

  const set = (field: keyof typeof empty) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) setResult({ error: data.error });
      else {
        setResult({ ok: true });
        setForm(empty);
        fetchCampaigns();
        setTimeout(() => { setShowForm(false); setResult(null); }, 1500);
      }
    } catch {
      setResult({ error: 'Network error' });
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActivity = async (campaignId: string) => {
    if (expandedCampaignId === campaignId) {
      setExpandedCampaignId(null);
      return;
    }
    if (activityMap[campaignId]) {
      setExpandedCampaignId(campaignId);
      return;
    }
    setLoadingActivityId(campaignId);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/activity`);
      const data = await res.json();
      setActivityMap((prev) => ({ ...prev, [campaignId]: data as CampaignActivityData }));
      setActivityTabMap((prev) => ({ ...prev, [campaignId]: prev[campaignId] ?? 'leads' }));
      setExpandedCampaignId(campaignId);
    } finally {
      setLoadingActivityId(null);
    }
  };

  const setTab = (campaignId: string, tab: ActivityTab) => {
    setActivityTabMap((prev) => ({ ...prev, [campaignId]: tab }));
  };

  return (
    <AppShell>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Campaigns</h1>
          <p className="text-slate-500 text-sm mt-1">Outreach campaigns and activity</p>
        </div>
        <button
          onClick={() => { setShowForm(true); setResult(null); }}
          className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors shadow-sm"
        >
          <PlusCircle size={15} /> New Campaign
        </button>
      </div>

      {/* Smartlead status */}
      {configLoading ? (
        <div className="h-14 bg-white border border-slate-100 rounded-2xl animate-pulse mb-5 shadow-sm" />
      ) : !slConfig || !slConfig.configured ? (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 mb-5 flex items-center gap-2 text-sm text-rose-800">
          <WifiOff size={15} className="shrink-0" />
          <span>Smartlead API key not configured. Add <code className="font-mono bg-rose-100 px-1 rounded text-xs">SMARTLEAD_API_KEY</code> to environment settings.</span>
        </div>
      ) : (
        <div className="bg-white border border-slate-100 rounded-2xl p-4 mb-5 shadow-sm">
          <div className="flex items-center gap-3 flex-wrap">
            <div className={`flex items-center gap-2 text-sm font-medium ${slConfig.dryRun ? 'text-amber-700' : 'text-emerald-700'}`}>
              {slConfig.dryRun
                ? <><AlertTriangle size={14} /> Dry Run Mode</>
                : <><Wifi size={14} /> Live Mode</>}
            </div>
            <div className="flex gap-2 flex-wrap text-xs">
              {slConfig.dryRun ? (
                <span className="bg-amber-50 text-amber-700 ring-1 ring-amber-200 px-2.5 py-1 rounded-full font-medium">
                  Emails will not be sent
                </span>
              ) : (
                <span className="bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 px-2.5 py-1 rounded-full font-medium">
                  Emails can be sent via Smartlead
                </span>
              )}
              {slConfig.fromEmailConfigured && (
                <span className="bg-slate-50 text-slate-500 ring-1 ring-slate-200 px-2.5 py-1 rounded-full flex items-center gap-1">
                  <Mail size={10} /> From email configured
                </span>
              )}
            </div>
          </div>
          {slConfig.campaignId && (
            <p className="text-xs text-slate-400 mt-2">
              Default Campaign ID:{' '}
              <code className="bg-slate-100 border border-slate-200 px-1 py-0.5 rounded font-mono">{slConfig.campaignId}</code>
            </p>
          )}
        </div>
      )}

      {/* New campaign form */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-5">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold text-slate-800">New Campaign</h2>
            <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
              <X size={18} />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Campaign Name <span className="text-rose-500">*</span>
                </label>
                <input value={form.name} onChange={set('name')} required
                  placeholder="e.g. KSA Pharmacy Outreach Q3"
                  className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Target Country</label>
                <input value={form.targetCountry} onChange={set('targetCountry')}
                  placeholder="e.g. Saudi Arabia"
                  className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Target Category</label>
                <input value={form.targetCategory} onChange={set('targetCategory')}
                  placeholder="e.g. Pharmacy, Distributor"
                  className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Status</label>
                <select value={form.status} onChange={set('status')}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800">
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
            </div>
            {result?.error && (
              <div className="flex items-center gap-2 text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5 text-sm">
                <AlertTriangle size={13} /> {result.error}
              </div>
            )}
            {result?.ok && (
              <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-2.5 text-sm">
                <CheckCircle size={13} /> Campaign created successfully.
              </div>
            )}
            <button type="submit" disabled={submitting}
              className="bg-emerald-600 text-white px-6 py-2 rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-60 shadow-sm">
              {submitting ? 'Saving…' : 'Create Campaign'}
            </button>
          </form>
        </div>
      )}

      {/* Campaign list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="h-24 bg-white border border-slate-100 rounded-2xl animate-pulse shadow-sm" />)}
        </div>
      ) : campaigns.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4">
            <Megaphone size={24} className="text-slate-300" />
          </div>
          <p className="text-slate-500 font-medium mb-1">No campaigns yet</p>
          <p className="text-slate-400 text-sm">Create your first campaign to start tracking outreach.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => {
            const activity = activityMap[c._id];
            const tab = activityTabMap[c._id] ?? 'leads';
            const isExpanded = expandedCampaignId === c._id;

            return (
              <div key={c._id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-slate-800 truncate">{c.name}</h3>
                      {(c.targetCountry || c.targetCategory) && (
                        <div className="text-xs text-slate-400 mt-0.5">
                          {[c.targetCountry, c.targetCategory].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </div>
                    <StatusBadge status={c.status} />
                  </div>

                  <div className="flex gap-5 mt-4 text-xs text-slate-500 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <Users size={12} className="text-slate-400" />
                      <span>{c.leadCount ?? 0} leads</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-emerald-600">
                      <Mail size={12} />
                      <span>{activity ? activity.counts.sentEmailCount : c.emailsSent} sent</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-blue-600">
                      <MessageSquare size={12} />
                      <span>{activity ? activity.counts.replyCount : c.replies} replies</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-amber-600">
                      <Clock size={12} />
                      <span>{activity ? activity.counts.noReplyCount : (c.noReplyCount ?? 0)} no reply</span>
                    </div>
                    {(c.noReplyAssignedCount ?? 0) > 0 && (
                      <div className="flex items-center gap-1.5 text-orange-600">
                        <Archive size={12} />
                        <span>{c.noReplyAssignedCount} no-reply assigned</span>
                      </div>
                    )}
                    <button
                      onClick={() => toggleActivity(c._id)}
                      disabled={loadingActivityId === c._id}
                      className="ml-auto flex items-center gap-1 text-emerald-600 hover:text-emerald-700 font-medium transition-colors disabled:opacity-50"
                    >
                      {loadingActivityId === c._id ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : isExpanded ? (
                        <ChevronUp size={12} />
                      ) : (
                        <ChevronDown size={12} />
                      )}
                      {isExpanded ? 'Hide Activity' : 'View Activity'}
                    </button>
                  </div>
                </div>

                {/* Activity panel */}
                {isExpanded && activity && (
                  <div className="border-t border-slate-100 bg-slate-50/70">
                    <div className="flex border-b border-slate-200 px-5 pt-3 gap-0.5">
                      {(
                        [
                          { key: 'leads', label: `Leads (${activity.counts.leadCount})` },
                          { key: 'emails', label: `Emails (${activity.counts.sentEmailCount})` },
                          { key: 'replies', label: `Replies (${activity.counts.replyCount})` },
                          { key: 'no-reply', label: `No Reply (${activity.counts.noReplyCount})` },
                        ] as { key: ActivityTab; label: string }[]
                      ).map(({ key, label }) => (
                        <button
                          key={key}
                          onClick={() => setTab(c._id, key)}
                          className={`px-3.5 py-2 text-xs font-medium rounded-t-lg border-b-2 transition-colors ${
                            tab === key
                              ? 'border-emerald-500 text-emerald-700 bg-white'
                              : 'border-transparent text-slate-500 hover:text-slate-700'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    <div className="px-5 py-4">
                      {tab === 'leads' && (
                        activity.leads.length === 0
                          ? <p className="text-sm text-slate-400 text-center py-4">No leads assigned.</p>
                          : (
                            <div className="space-y-1.5 max-h-72 overflow-y-auto">
                              {activity.leads.map((lead) => (
                                <div key={lead._id} className="flex items-center justify-between bg-white border border-slate-100 rounded-xl px-3.5 py-2.5 text-sm shadow-sm">
                                  <div className="min-w-0">
                                    <span className="font-medium text-slate-800 truncate block">{lead.companyName}</span>
                                    <span className="text-xs text-slate-400">{lead.email ?? 'no email'} · {lead.country}</span>
                                  </div>
                                  <StatusBadge status={lead.status} />
                                </div>
                              ))}
                            </div>
                          )
                      )}

                      {tab === 'emails' && (
                        activity.emails.length === 0
                          ? <p className="text-sm text-slate-400 text-center py-4">No emails logged.</p>
                          : (
                            <div className="space-y-1.5 max-h-72 overflow-y-auto">
                              {activity.emails.map((email) => (
                                <div key={email._id} className="bg-white border border-slate-100 rounded-xl px-3.5 py-2.5 text-sm shadow-sm">
                                  <div className="flex items-center justify-between gap-2 mb-1">
                                    <span className="font-medium text-slate-800 truncate">{email.lead?.companyName ?? email.leadId}</span>
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${EMAIL_STATUS_STYLES[email.status] ?? 'text-slate-600 bg-slate-50'}`}>
                                      {EMAIL_STATUS_LABELS[email.status] ?? email.status}
                                    </span>
                                  </div>
                                  <p className="text-xs text-slate-500 truncate">{email.subject}</p>
                                  <p className="text-xs text-slate-400 mt-0.5">
                                    {email.lead?.email ?? ''} · {email.sentAt ? new Date(email.sentAt).toLocaleDateString() : new Date(email.createdAt).toLocaleDateString()}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )
                      )}

                      {tab === 'replies' && (
                        activity.replies.length === 0
                          ? <p className="text-sm text-slate-400 text-center py-4">No replies yet.</p>
                          : (
                            <div className="space-y-1.5 max-h-72 overflow-y-auto">
                              {activity.replies.map((reply) => (
                                <div key={reply._id} className="bg-white border border-slate-100 rounded-xl px-3.5 py-2.5 text-sm shadow-sm">
                                  <div className="flex items-center justify-between gap-2 mb-1">
                                    <span className="font-medium text-slate-800 truncate">{reply.lead?.companyName ?? reply.leadId}</span>
                                    {reply.classification && (
                                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-200 font-medium shrink-0">
                                        {reply.classification.replace(/_/g, ' ')}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-slate-600 line-clamp-2">{reply.body.slice(0, 120)}{reply.body.length > 120 ? '…' : ''}</p>
                                  <p className="text-xs text-slate-400 mt-0.5">
                                    {reply.lead?.email ?? ''} · {reply.receivedAt ? new Date(reply.receivedAt).toLocaleDateString() : new Date(reply.createdAt).toLocaleDateString()}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )
                      )}

                      {tab === 'no-reply' && (
                        (activity.noReplyLeads ?? []).length === 0
                          ? <p className="text-sm text-slate-400 text-center py-4">All emailed leads have replied.</p>
                          : (
                            <div className="space-y-1.5 max-h-72 overflow-y-auto">
                              {(activity.noReplyLeads ?? []).map((noReply) => (
                                <div key={noReply.leadId} className="flex items-center justify-between bg-white border border-amber-100 rounded-xl px-3.5 py-2.5 text-sm shadow-sm">
                                  <div className="min-w-0">
                                    <span className="font-medium text-slate-800 truncate block">{noReply.companyName}</span>
                                    <span className="text-xs text-slate-400">{noReply.email ?? 'no email'} · {noReply.country}</span>
                                    {noReply.lastSentAt && (
                                      <span className="text-xs text-slate-400 block">Last emailed {new Date(noReply.lastSentAt).toLocaleDateString()}</span>
                                    )}
                                  </div>
                                  <span className="text-xs text-amber-600 font-medium bg-amber-50 ring-1 ring-amber-200 px-2 py-0.5 rounded-full shrink-0">No reply</span>
                                </div>
                              ))}
                            </div>
                          )
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
