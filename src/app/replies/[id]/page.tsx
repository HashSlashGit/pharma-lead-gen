'use client';

import { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';
import AppShell from '@/components/layout/AppShell';
import ScoreBadge from '@/components/ui/ScoreBadge';
import StatusBadge from '@/components/ui/StatusBadge';
import {
  ArrowLeft,
  Sparkles,
  CheckCircle2,
  XCircle,
  ThumbsUp,
  ThumbsDown,
  Clock,
  Loader2,
  AlertCircle,
  Mail,
  Send,
  FileText,
  MessageSquare,
  ArrowUpRight,
  ArrowDownLeft,
} from 'lucide-react';

interface Lead {
  _id: string;
  companyName: string;
  email?: string;
  country: string;
  status: string;
  score: number;
  category?: string;
  phone?: string;
  website?: string;
  followUpCount: number;
  aiProcessed: boolean;
}

interface Reply {
  _id: string;
  leadId: string;
  body: string;
  classification?: string;
  needsApproval: boolean;
  status: string;
  aiDraftGenerated: boolean;
  draftEmailLogId?: string;
  approvedAt?: string;
  rejectedAt?: string;
  receivedAt?: string;
  createdAt: string;
  source?: string;
  lead?: Lead;
}

interface TimelineItem {
  id: string;
  type: 'sent_email' | 'inbound_reply' | 'ai_draft' | 'system';
  direction: 'outbound' | 'inbound' | 'internal';
  subject?: string;
  body: string;
  status?: string;
  classification?: string;
  createdAt: string;
  source?: string;
}

interface EmailLogItem {
  _id: string;
  type: string;
  subject: string;
  body: string;
  status: string;
  sentAt?: string;
  createdAt: string;
}

interface DraftLog {
  _id: string;
  subject: string;
  body: string;
  status: string;
}

const CLASSIFICATION_LABELS: Record<string, string> = {
  interested: 'Interested',
  pricing_query: 'Pricing Query',
  certificate_query: 'Certificate Query',
  shipping_query: 'Shipping Query',
  not_interested: 'Not Interested',
  unclassified: 'Unclassified',
};

const CLASSIFICATION_COLORS: Record<string, string> = {
  interested: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  pricing_query: 'bg-blue-100 text-blue-700 border-blue-200',
  certificate_query: 'bg-violet-100 text-violet-700 border-violet-200',
  shipping_query: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  not_interested: 'bg-slate-100 text-slate-500 border-slate-200',
  unclassified: 'bg-amber-100 text-amber-700 border-amber-200',
};

// Classifications that can receive AI draft generation
const DRAFTABLE = new Set(['interested', 'pricing_query', 'certificate_query', 'shipping_query', 'unclassified']);

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function ReplyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [reply, setReply] = useState<Reply | null>(null);
  const [emailHistory, setEmailHistory] = useState<EmailLogItem[]>([]);
  const [draftLog, setDraftLog] = useState<DraftLog | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');

  const [approving, setApproving] = useState(false);
  const [approveResult, setApproveResult] = useState<{ success: boolean; message: string } | null>(null);

  const [rejecting, setRejecting] = useState(false);

  const [updatingLeadStatus, setUpdatingLeadStatus] = useState(false);

  const fetchReply = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/replies/${id}`);
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setReply(data.reply);
        setEmailHistory(data.emailHistory ?? []);
        setDraftLog(data.draftLog ?? null);
        setTimeline(data.timeline ?? []);
      }
    } catch {
      setError('Failed to load reply');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchReply(); }, [fetchReply]);

  const generateDraft = async () => {
    setGenerating(true);
    setGenError('');
    try {
      const res = await fetch(`/api/replies/${id}/generate-draft`, { method: 'POST' });
      const data = await res.json();
      if (data.error) {
        setGenError(data.error);
      } else {
        await fetchReply(); // refresh to get updated reply + draft
      }
    } catch {
      setGenError('Network error — please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const approveSend = async () => {
    setApproving(true);
    setApproveResult(null);
    try {
      const res = await fetch(`/api/replies/${id}/approve-send`, { method: 'POST' });
      const data = await res.json();
      setApproveResult({ success: data.success, message: data.message ?? data.error });
      if (data.success) await fetchReply();
    } catch {
      setApproveResult({ success: false, message: 'Network error' });
    } finally {
      setApproving(false);
    }
  };

  const rejectDraft = async () => {
    setRejecting(true);
    try {
      await fetch(`/api/replies/${id}/reject-draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject' }),
      });
      await fetchReply();
    } finally {
      setRejecting(false);
    }
  };

  const markHandled = async () => {
    setRejecting(true);
    try {
      await fetch(`/api/replies/${id}/reject-draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'handle' }),
      });
      await fetchReply();
    } finally {
      setRejecting(false);
    }
  };

  const updateLeadStatus = async (status: string) => {
    if (!reply?.lead) return;
    setUpdatingLeadStatus(true);
    try {
      await fetch(`/api/leads/${reply.lead._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      await fetchReply();
    } finally {
      setUpdatingLeadStatus(false);
    }
  };

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-slate-400" />
        </div>
      </AppShell>
    );
  }

  if (error || !reply) {
    return (
      <AppShell>
        <div className="flex items-center gap-2 text-rose-600 text-sm">
          <AlertCircle size={16} />
          {error || 'Reply not found'}
        </div>
      </AppShell>
    );
  }

  const lead = reply.lead;
  const classification = reply.classification ?? 'unclassified';
  const canGenerateDraft = DRAFTABLE.has(classification) && reply.status !== 'draft_approved';
  const isDraftReady = reply.status === 'draft_generated' && draftLog;
  const isApproved = reply.status === 'draft_approved';
  const isHandled = reply.status === 'handled';

  return (
    <AppShell>
      {/* Back nav */}
      <div className="mb-6">
        <Link
          href="/replies"
          className="flex items-center gap-2 text-slate-500 hover:text-slate-700 text-sm transition-colors"
        >
          <ArrowLeft size={16} />
          Reply Inbox
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left column: reply + actions ── */}
        <div className="lg:col-span-2 space-y-5">

          {/* Inbound reply */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h1 className="text-lg font-bold text-slate-800">
                  {lead?.companyName ?? 'Unknown Company'}
                </h1>
                {lead?.email && (
                  <p className="text-sm text-slate-500 flex items-center gap-1 mt-0.5">
                    <Mail size={13} />
                    {lead.email}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {classification && (
                  <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold border ${CLASSIFICATION_COLORS[classification] ?? 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                    {CLASSIFICATION_LABELS[classification] ?? classification}
                  </span>
                )}
                {reply.needsApproval && reply.status === 'pending' && (
                  <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-600 border border-rose-200">
                    Needs Review
                  </span>
                )}
              </div>
            </div>

            <div className="text-xs text-slate-400 mb-3 flex items-center gap-1">
              <Clock size={12} />
              Received {formatDate(reply.createdAt)}
            </div>

            <div className="bg-slate-50 rounded-lg p-4 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed border border-slate-100">
              {reply.body}
            </div>
          </div>

          {/* AI Draft Section */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-base font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <Sparkles size={16} className="text-violet-500" />
              AI Reply Draft
            </h2>

            {/* Approved state */}
            {isApproved && (
              <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-sm">
                <CheckCircle2 size={16} />
                Draft approved and sent.
                {reply.approvedAt && (
                  <span className="text-emerald-600 ml-1">{formatDate(reply.approvedAt)}</span>
                )}
              </div>
            )}

            {/* Handled state */}
            {isHandled && (
              <div className="flex items-center gap-2 text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm">
                <CheckCircle2 size={16} />
                Marked as handled manually.
              </div>
            )}

            {/* Draft ready for approval */}
            {isDraftReady && !isApproved && (
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-1">Subject</p>
                  <p className="text-sm text-slate-700 font-medium">{draftLog.subject}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-1">Draft Body</p>
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                    {draftLog.body}
                  </div>
                </div>

                {approveResult && (
                  <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${approveResult.success ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-600 border border-rose-200'}`}>
                    {approveResult.success ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                    {approveResult.message}
                  </div>
                )}

                <div className="flex items-center gap-3 pt-1">
                  <button
                    onClick={approveSend}
                    disabled={approving}
                    className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-60"
                  >
                    {approving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    {approving ? 'Sending…' : 'Approve & Send'}
                  </button>
                  <button
                    onClick={rejectDraft}
                    disabled={rejecting}
                    className="flex items-center gap-2 border border-slate-300 text-slate-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors disabled:opacity-60"
                  >
                    <XCircle size={14} />
                    Reject Draft
                  </button>
                </div>
                <p className="text-xs text-slate-400">
                  Rejecting lets you generate a new draft. Approving dispatches via Smartlead.
                </p>
              </div>
            )}

            {/* Draft rejected — allow regeneration */}
            {reply.status === 'draft_rejected' && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-4 py-3 text-sm">
                  <XCircle size={14} />
                  Draft rejected. You can generate a new one.
                </div>
              </div>
            )}

            {/* Generate button */}
            {canGenerateDraft && !isDraftReady && !isApproved && !isHandled && (
              <div className="space-y-3">
                {classification === 'not_interested' ? (
                  <p className="text-sm text-slate-400">
                    AI drafts are not generated for &ldquo;Not Interested&rdquo; replies.
                  </p>
                ) : (
                  <>
                    <button
                      onClick={generateDraft}
                      disabled={generating}
                      className="flex items-center gap-2 bg-violet-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-violet-700 transition-colors disabled:opacity-60"
                    >
                      {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                      {generating ? 'Generating…' : 'Generate AI Draft'}
                    </button>
                    {genError && (
                      <p className="text-xs text-rose-600 flex items-center gap-1">
                        <AlertCircle size={12} />
                        {genError}
                      </p>
                    )}
                    <p className="text-xs text-slate-400">
                      Uses Claude Haiku — logged to usage tracker. Draft requires your approval before sending.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Email & Reply History */}
          {timeline.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="text-base font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <MessageSquare size={16} className="text-slate-400" />
                Email &amp; Reply History
                <span className="ml-auto text-xs font-normal text-slate-400">{timeline.length} message{timeline.length !== 1 ? 's' : ''}</span>
              </h2>
              <div className="relative space-y-3">
                {/* Vertical line */}
                <div className="absolute left-4 top-4 bottom-4 w-px bg-slate-100" />

                {timeline.map((item, idx) => {
                  const isNewest = idx === timeline.length - 1;
                  const isCurrent = item.type === 'inbound_reply' && item.id === reply?._id;

                  const isOutbound = item.direction === 'outbound';
                  const isInbound  = item.direction === 'inbound';
                  const isDraft    = item.type === 'ai_draft';

                  const dotColor = isInbound
                    ? 'bg-violet-500'
                    : isDraft
                    ? 'bg-amber-400'
                    : 'bg-emerald-500';

                  const cardStyle = isCurrent
                    ? 'border-violet-300 bg-violet-50'
                    : isInbound
                    ? 'border-slate-200 bg-slate-50'
                    : isDraft
                    ? 'border-amber-200 bg-amber-50'
                    : 'border-slate-100 bg-white';

                  const typeLabel = item.type === 'inbound_reply'
                    ? 'Customer Reply'
                    : item.type === 'ai_draft'
                    ? 'AI Draft'
                    : item.type === 'sent_email'
                    ? 'Sent Email'
                    : 'System';

                  return (
                    <div key={item.id} className="flex gap-3 pl-1">
                      {/* Timeline dot */}
                      <div className={`relative z-10 w-5 h-5 rounded-full shrink-0 mt-2.5 flex items-center justify-center ${dotColor}`}>
                        {isInbound
                          ? <ArrowDownLeft size={10} className="text-white" />
                          : isDraft
                          ? <Sparkles size={9} className="text-white" />
                          : <ArrowUpRight size={10} className="text-white" />
                        }
                      </div>

                      {/* Card */}
                      <div className={`flex-1 border rounded-lg p-3 ${cardStyle}`}>
                        <div className="flex items-center gap-2 flex-wrap mb-1.5">
                          <span className="text-xs font-semibold text-slate-700">{typeLabel}</span>
                          {isNewest && (
                            <span className="inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-violet-600 text-white">Latest</span>
                          )}
                          {isCurrent && !isNewest && (
                            <span className="inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-violet-100 text-violet-700">Viewing</span>
                          )}
                          {item.classification && (
                            <span className="inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 capitalize">
                              {item.classification.replace('_', ' ')}
                            </span>
                          )}
                          {item.status && (
                            <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-medium ml-auto ${
                              item.status === 'sent' || item.status === 'draft_approved'
                                ? 'bg-emerald-100 text-emerald-700'
                                : item.status === 'failed' || item.status === 'draft_rejected'
                                ? 'bg-rose-100 text-rose-600'
                                : item.status === 'pending'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-slate-100 text-slate-500'
                            }`}>
                              {item.status.replace('_', ' ')}
                            </span>
                          )}
                        </div>
                        {item.subject && (
                          <p className="text-xs font-medium text-slate-700 mb-1">{item.subject}</p>
                        )}
                        <p className="text-xs text-slate-600 line-clamp-3 whitespace-pre-wrap leading-relaxed">
                          {item.body.slice(0, 300)}{item.body.length > 300 ? '…' : ''}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <Clock size={10} className="text-slate-300" />
                          <span className="text-[10px] text-slate-400">{formatDate(item.createdAt)}</span>
                          {isOutbound && item.source && (
                            <span className="text-[10px] text-slate-300 ml-auto">{item.source}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Email history fallback (shown only when timeline is empty) */}
          {timeline.length === 0 && emailHistory.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="text-base font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <FileText size={16} className="text-slate-400" />
                Email History
              </h2>
              <div className="space-y-3">
                {emailHistory.map((log) => (
                  <div key={log._id} className="border border-slate-100 rounded-lg p-3">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-semibold text-slate-600 capitalize">
                        {log.type.replace('_', ' ')}
                      </span>
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                        log.status === 'sent' ? 'bg-emerald-100 text-emerald-700'
                        : log.status === 'ready_to_send_test' ? 'bg-amber-100 text-amber-700'
                        : log.status === 'failed' ? 'bg-rose-100 text-rose-600'
                        : 'bg-slate-100 text-slate-500'
                      }`}>
                        {log.status}
                      </span>
                    </div>
                    <p className="text-xs font-medium text-slate-700">{log.subject}</p>
                    <p className="text-xs text-slate-400 mt-1">{formatDate(log.createdAt)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Right column: lead info + manual actions ── */}
        <div className="space-y-5">
          {/* Lead card */}
          {lead && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-slate-700">Lead Details</h2>
                <Link
                  href={`/leads/${lead._id}`}
                  className="text-xs text-emerald-600 hover:underline"
                >
                  View Full Profile →
                </Link>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Company</span>
                  <span className="font-medium text-slate-800 truncate max-w-[130px]">{lead.companyName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Country</span>
                  <span className="text-slate-700">{lead.country}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Score</span>
                  <ScoreBadge score={lead.score} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Status</span>
                  <StatusBadge status={lead.status} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Follow-Ups</span>
                  <span className="text-slate-700">{lead.followUpCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">AI Processed</span>
                  <span className={lead.aiProcessed ? 'text-emerald-600 font-medium text-xs' : 'text-slate-400 text-xs'}>
                    {lead.aiProcessed ? 'Yes' : 'No'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Manual actions */}
          {lead && !isApproved && !isHandled && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-3">Manual Actions</h2>
              <div className="space-y-2">
                <button
                  onClick={() => updateLeadStatus('warm')}
                  disabled={updatingLeadStatus || lead.status === 'warm'}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors disabled:opacity-50"
                >
                  <ThumbsUp size={14} />
                  Mark Interested (Warm)
                </button>
                <button
                  onClick={() => updateLeadStatus('cold')}
                  disabled={updatingLeadStatus || lead.status === 'cold'}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 bg-slate-50 hover:bg-slate-100 transition-colors disabled:opacity-50"
                >
                  <ThumbsDown size={14} />
                  Mark Not Interested
                </button>
                <button
                  onClick={markHandled}
                  disabled={rejecting}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  <CheckCircle2 size={14} />
                  Mark as Handled
                </button>
              </div>
              <p className="text-xs text-slate-400 mt-3">
                &ldquo;Mark as Handled&rdquo; closes this reply without sending — use when you respond manually outside the system.
              </p>
            </div>
          )}

          {/* Cost note */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-500">
            <p className="font-medium text-slate-600 mb-1">Claude usage rules</p>
            <ul className="space-y-1">
              <li>· Draft generation requires your click</li>
              <li>· Not available for &ldquo;Not Interested&rdquo; replies</li>
              <li>· Sending requires your approval</li>
              <li>· Every AI call is logged with cost</li>
            </ul>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
