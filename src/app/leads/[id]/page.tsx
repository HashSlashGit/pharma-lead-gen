'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';
import StatusBadge from '@/components/ui/StatusBadge';
import ScoreBadge from '@/components/ui/ScoreBadge';
import { LeadRow, EmailLogRow, ReplyRow } from '@/types';
import {
  Brain,
  ArrowLeft,
  Mail,
  Phone,
  Globe,
  MapPin,
  Building2,
  Tag,
  Send,
  CheckCircle,
  AlertTriangle,
  Clock,
  MessageSquare,
  FlaskConical,
} from 'lucide-react';

const STATUS_OPTIONS = [
  'new', 'qualified', 'needs_review', 'low_priority',
  'contacted', 'warm', 'cold', 'rejected', 'no_response',
] as const;

interface LeadDetail {
  lead: LeadRow;
  emails: EmailLogRow[];
  replies: ReplyRow[];
}

export default function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [data, setData] = useState<LeadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // AI personalization state
  const [personalizing, setPersonalizing] = useState(false);
  const [aiResult, setAiResult] = useState<{ subject: string; body: string; id: string } | null>(null);
  const [aiError, setAiError] = useState('');

  // Send draft state
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<Record<string, { mode: string; status: string; message?: string }>>({});

  // Smartlead config (button label)
  const [sendButtonLabel, setSendButtonLabel] = useState('Send Email');
  const [isDryRun, setIsDryRun] = useState(true);

  // Status update
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const fetchLead = () => {
    fetch(`/api/leads/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => setError('Failed to load lead'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchLead();
    // Fetch send mode config (non-sensitive flags only)
    fetch('/api/config')
      .then((r) => r.json())
      .then((cfg) => {
        setSendButtonLabel(cfg.smartlead?.sendButtonLabel ?? 'Send Email');
        setIsDryRun(cfg.smartlead?.dryRun ?? true);
      })
      .catch(() => {});
  }, [id]);

  const handlePersonalize = async () => {
    setPersonalizing(true);
    setAiError('');
    setAiResult(null);

    const res = await fetch(`/api/leads/${id}/personalize`, { method: 'POST' });
    const json = await res.json();

    if (!res.ok) {
      setAiError(json.error ?? 'Personalization failed');
    } else {
      setAiResult({
        id: json.emailLog._id,
        subject: json.emailLog.subject,
        body: json.emailLog.body,
      });
      fetchLead(); // refresh to show aiProcessed = true and new email log
    }
    setPersonalizing(false);
  };

  const handleSend = async (emailLogId: string) => {
    setSendingId(emailLogId);
    const res = await fetch(`/api/email-logs/${emailLogId}/send`, { method: 'POST' });
    const json = await res.json();
    setSendResult((prev) => ({
      ...prev,
      [emailLogId]: { mode: json.mode, status: json.status, message: json.message },
    }));
    setSendingId(null);
    fetchLead();
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!data) return;
    setUpdatingStatus(true);
    await fetch(`/api/leads/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    await fetchLead();
    setUpdatingStatus(false);
  };

  if (loading) {
    return (
      <AppShell>
        <div className="space-y-4 animate-pulse">
          <div className="h-8 bg-slate-200 rounded w-48" />
          <div className="h-64 bg-white border border-slate-200 rounded-xl" />
        </div>
      </AppShell>
    );
  }

  if (error || !data) {
    return (
      <AppShell>
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 text-rose-700 text-sm">
          {error || 'Lead not found'}
        </div>
      </AppShell>
    );
  }

  const { lead, emails, replies } = data;

  const canPersonalize = lead.score >= 70 && !!lead.email && !lead.aiProcessed;

  const personalizeBlockReason = !lead.email
    ? 'No email — add an email address to enable AI personalization'
    : lead.score < 70
    ? `Score is ${lead.score} — must be 70+ for AI personalization`
    : lead.aiProcessed
    ? 'Already AI processed — see email drafts below'
    : null;

  return (
    <AppShell>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push('/leads')}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-800">{lead.companyName}</h1>
          <div className="flex items-center gap-2 mt-1">
            <StatusBadge status={lead.status} />
            <ScoreBadge score={lead.score} />
            {lead.aiProcessed && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">
                <Brain size={11} /> AI Processed
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Lead Info */}
        <div className="lg:col-span-2 space-y-5">

          {/* Contact Details */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-widest mb-4">Lead Information</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InfoRow icon={Building2} label="Company" value={lead.companyName} />
              <InfoRow icon={Tag} label="Category" value={lead.category} />
              <InfoRow icon={MapPin} label="Country" value={lead.country} />
              {lead.city && <InfoRow icon={MapPin} label="City" value={lead.city} />}
              {lead.email && <InfoRow icon={Mail} label="Email" value={lead.email} />}
              {lead.phone && <InfoRow icon={Phone} label="Phone" value={lead.phone} />}
              {lead.website && (
                <InfoRow
                  icon={Globe}
                  label="Website"
                  value={lead.website}
                  href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
                />
              )}
              {lead.source && <InfoRow icon={Tag} label="Source" value={lead.source} />}
            </div>
            {lead.notes && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <p className="text-xs font-medium text-slate-500 mb-1">Notes</p>
                <p className="text-sm text-slate-700">{lead.notes}</p>
              </div>
            )}
          </div>

          {/* Email History */}
          {emails.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-widest">
                  Email History ({emails.length})
                </h2>
                {isDryRun && (
                  <span className="flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                    <FlaskConical size={11} /> Dry-run mode
                  </span>
                )}
              </div>
              <div className="space-y-4">
                {emails.map((email) => {
                  const actionResult = sendResult[email._id];
                  const canSend = email.status === 'pending' || email.status === 'ready_to_send_test' || email.status === 'failed';
                  // For ready_to_send_test in live mode, allow re-send (real send)
                  const showSendButton = canSend && !actionResult;
                  const isTestReady = email.status === 'ready_to_send_test';

                  return (
                    <div key={email._id} className={`border rounded-lg p-4 ${isTestReady ? 'border-amber-200 bg-amber-50/30' : 'border-slate-100'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="font-medium text-slate-800 text-sm">{email.subject}</p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            <span className="capitalize">{email.type.replace(/_/g, ' ')}</span>
                            {' · '}
                            {new Date(email.createdAt).toLocaleDateString()}
                            {email.sentAt && ` · Sent ${new Date(email.sentAt).toLocaleDateString()}`}
                          </p>
                        </div>
                        <StatusBadge status={email.status} />
                      </div>

                      <pre className="text-xs text-slate-600 whitespace-pre-wrap bg-slate-50 rounded p-3 max-h-48 overflow-auto font-sans leading-relaxed">
                        {email.body}
                      </pre>

                      <div className="mt-3 flex items-center gap-3">
                        {showSendButton && (
                          <button
                            onClick={() => handleSend(email._id)}
                            disabled={sendingId === email._id}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-60 ${
                              isDryRun
                                ? 'bg-amber-600 text-white hover:bg-amber-700'
                                : 'bg-slate-800 text-white hover:bg-slate-700'
                            }`}
                          >
                            {isDryRun ? <FlaskConical size={12} /> : <Send size={12} />}
                            {sendingId === email._id ? 'Sending…' : sendButtonLabel}
                          </button>
                        )}

                        {isTestReady && !actionResult && !isDryRun && (
                          <p className="text-xs text-slate-400">Test done — click to send for real</p>
                        )}
                        {isTestReady && !actionResult && isDryRun && (
                          <p className="text-xs text-slate-400">Test completed. Set SMARTLEAD_DRY_RUN=false to send for real.</p>
                        )}
                      </div>

                      {actionResult && (
                        <div className={`mt-2 text-xs rounded-lg p-2.5 border ${
                          actionResult.mode === 'dry_run' || actionResult.mode === 'no_key'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : actionResult.status === 'sent'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}>
                          {actionResult.status === 'sent' && <><CheckCircle size={12} className="inline mr-1" /> Sent via Smartlead</>}
                          {actionResult.status === 'ready_to_send_test' && <><FlaskConical size={12} className="inline mr-1" /> {actionResult.message}</>}
                          {actionResult.status === 'failed' && <><AlertTriangle size={12} className="inline mr-1" /> {actionResult.message}</>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* New AI draft result (just created) */}
          {aiResult && !emails.find((e) => e._id === aiResult.id) && (
            <div className="bg-violet-50 border border-violet-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Brain size={16} className="text-violet-600" />
                <h2 className="font-semibold text-violet-800 text-sm">AI Draft Created</h2>
              </div>
              <p className="text-sm font-medium text-slate-700 mb-2">{aiResult.subject}</p>
              <pre className="text-xs text-slate-600 whitespace-pre-wrap bg-white rounded p-3 max-h-56 overflow-auto font-sans leading-relaxed border border-violet-100">
                {aiResult.body}
              </pre>
            </div>
          )}

          {/* Replies */}
          {replies.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-widest mb-4">
                Replies ({replies.length})
              </h2>
              <div className="space-y-3">
                {replies.map((reply) => (
                  <div key={reply._id} className="border border-slate-100 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-slate-400">{new Date(reply.createdAt).toLocaleDateString()}</span>
                      <div className="flex items-center gap-2">
                        {reply.classification && <StatusBadge status={reply.classification} />}
                        {reply.needsApproval && (
                          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Clock size={10} /> Needs review
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{reply.body}</p>
                    {reply.needsApproval && !reply.aiDraft && (
                      <p className="text-xs text-slate-400 mt-2 italic">
                        Use "Personalize with AI" on a new email to draft a response.
                      </p>
                    )}
                    {reply.aiDraft && (
                      <div className="mt-3 pt-3 border-t border-slate-100">
                        <p className="text-xs font-medium text-violet-600 mb-1 flex items-center gap-1">
                          <Brain size={11} /> AI Draft Response
                        </p>
                        <p className="text-sm text-slate-700 whitespace-pre-wrap">{reply.aiDraft}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Actions */}
        <div className="space-y-4">

          {/* AI Personalization */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <Brain size={18} className="text-violet-500" />
              <h2 className="font-semibold text-slate-800 text-sm">AI Personalization</h2>
            </div>

            {personalizeBlockReason ? (
              <div className="text-xs text-slate-500 bg-slate-50 rounded-lg p-3 border border-slate-100">
                {personalizeBlockReason}
              </div>
            ) : (
              <p className="text-xs text-slate-500 mb-3">
                Generate a personalized outbound email using Claude. Uses one AI credit.
              </p>
            )}

            {aiError && (
              <div className="flex items-start gap-2 text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3 text-xs mb-3">
                <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                {aiError}
              </div>
            )}

            <button
              onClick={handlePersonalize}
              disabled={!canPersonalize || personalizing}
              className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                canPersonalize
                  ? 'bg-violet-600 text-white hover:bg-violet-700'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
              } disabled:opacity-60`}
            >
              <Brain size={15} />
              {personalizing ? 'Generating…' : 'Personalize with AI'}
            </button>

            <div className="mt-3 text-xs text-slate-400 space-y-1">
              <div className="flex justify-between">
                <span>Score requirement</span>
                <span className={lead.score >= 70 ? 'text-emerald-500' : 'text-rose-500'}>
                  {lead.score}/100 (need 70+)
                </span>
              </div>
              <div className="flex justify-between">
                <span>Email present</span>
                <span className={lead.email ? 'text-emerald-500' : 'text-rose-500'}>
                  {lead.email ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Already processed</span>
                <span className={lead.aiProcessed ? 'text-amber-500' : 'text-emerald-500'}>
                  {lead.aiProcessed ? 'Yes' : 'No'}
                </span>
              </div>
            </div>
          </div>

          {/* Status Update */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h2 className="font-semibold text-slate-800 text-sm mb-3">Update Status</h2>
            <select
              value={lead.status}
              onChange={(e) => handleStatusChange(e.target.value)}
              disabled={updatingStatus}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
              ))}
            </select>
            {updatingStatus && <p className="text-xs text-slate-400 mt-2">Saving…</p>}
          </div>

          {/* Lead Metrics */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h2 className="font-semibold text-slate-800 text-sm mb-3">Pipeline Metrics</h2>
            <div className="space-y-2 text-sm">
              <MetricRow label="Follow-ups Sent" value={lead.followUpCount} />
              <MetricRow
                label="Last Contacted"
                value={(lead as LeadRow & { lastContactedAt?: string }).lastContactedAt
                  ? new Date((lead as LeadRow & { lastContactedAt?: string }).lastContactedAt!).toLocaleDateString()
                  : '—'}
              />
              <MetricRow label="Email Drafts" value={emails.length} />
              <MetricRow
                label="Emails Sent"
                value={emails.filter((e) => e.status === 'sent').length}
              />
              <MetricRow
                label="Replies"
                icon={<MessageSquare size={12} />}
                value={replies.length}
              />
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  href?: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon size={14} className="text-slate-400 mt-0.5 shrink-0" />
      <div>
        <p className="text-xs text-slate-400">{label}</p>
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline break-all">
            {value}
          </a>
        ) : (
          <p className="text-sm text-slate-700 break-all">{value}</p>
        )}
      </div>
    </div>
  );
}

function MetricRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between text-slate-600">
      <span className="flex items-center gap-1 text-slate-500">
        {icon}
        {label}
      </span>
      <span className="font-medium text-slate-700">{value}</span>
    </div>
  );
}
