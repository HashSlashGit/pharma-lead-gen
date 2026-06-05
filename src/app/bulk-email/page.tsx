'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import AppShell from '@/components/layout/AppShell';
import StatusBadge from '@/components/ui/StatusBadge';
import { CampaignRow, EmailTemplateRow, LeadRow, ProductRow } from '@/types';
import {
  Layers,
  CheckSquare,
  Square,
  Send,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  Loader2,
  X,
} from 'lucide-react';

const LEAD_STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'cold', label: 'Cold' },
  { value: 'warm', label: 'Warm' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'new', label: 'New' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'no_response', label: 'No Response' },
  { value: 'not_interested', label: 'Not Interested' },
];

const VARIABLES = [
  { key: '{{companyName}}', label: 'Company' },
  { key: '{{productName}}', label: 'Product' },
  { key: '{{moq}}', label: 'MOQ' },
  { key: '{{pricing}}', label: 'Pricing' },
  { key: '{{certifications}}', label: 'Certs' },
  { key: '{{shippingDetails}}', label: 'Shipping' },
  { key: '{{city}}', label: 'City' },
  { key: '{{country}}', label: 'Country' },
  { key: '{{email}}', label: 'Email' },
];

const TYPE_LABELS: Record<string, string> = {
  initial: 'Initial',
  follow_up: 'Follow-Up',
  warm_reply: 'Warm Reply',
  cold_reply: 'Cold Reply',
  pricing: 'Pricing',
  custom: 'Custom',
};

function renderPreview(
  template: string,
  lead?: LeadRow | null,
  product?: ProductRow | null
): string {
  return template
    .replace(/\{\{companyName\}\}/g, lead?.companyName ?? '[company name]')
    .replace(/\{\{country\}\}/g, lead?.country ?? '[country]')
    .replace(/\{\{city\}\}/g, lead?.city ?? '[city]')
    .replace(/\{\{email\}\}/g, lead?.email ?? '[email]')
    .replace(/\{\{category\}\}/g, lead?.category ?? '[category]')
    .replace(/\{\{productName\}\}/g, product?.name ?? '[product name]')
    .replace(/\{\{moq\}\}/g, product?.moq ?? '[MOQ]')
    .replace(/\{\{pricing\}\}/g, product?.pricing ?? '[pricing]')
    .replace(/\{\{certifications\}\}/g, product?.certifications?.join(', ') ?? '[certifications]')
    .replace(/\{\{shippingDetails\}\}/g, product?.shippingDetails ?? '[shipping details]');
}

type SendResultRow = {
  leadId: string;
  email: string;
  status: 'sent' | 'failed' | 'skipped';
  error?: string;
};

type SendSummary = {
  sent: number;
  failed: number;
  skipped: number;
  total: number;
  results: SendResultRow[];
};

export default function BulkEmailPage() {
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [templates, setTemplates] = useState<EmailTemplateRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [campaignLeads, setCampaignLeads] = useState<LeadRow[]>([]);
  const [campaignLeadsLoading, setCampaignLeadsLoading] = useState(false);

  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showPreview, setShowPreview] = useState(false);
  const [previewLeadId, setPreviewLeadId] = useState('');

  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<SendSummary | null>(null);
  const [sendError, setSendError] = useState('');

  const subjectInputRef = useRef<HTMLInputElement>(null);
  const bodyTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [focusedField, setFocusedField] = useState<'subject' | 'body'>('body');

  const insertVariable = (variable: string) => {
    if (focusedField === 'subject') {
      const el = subjectInputRef.current;
      if (el) {
        const start = el.selectionStart ?? subject.length;
        const end = el.selectionEnd ?? subject.length;
        const updated = subject.slice(0, start) + variable + subject.slice(end);
        setSubject(updated);
        setTimeout(() => {
          el.focus();
          el.setSelectionRange(start + variable.length, start + variable.length);
        }, 0);
      } else {
        setSubject(subject + variable);
      }
    } else {
      if (showPreview) {
        // Switch to edit mode, append at end since cursor position is unknown
        setShowPreview(false);
        const updated = body + variable;
        setBody(updated);
        setTimeout(() => {
          const el = bodyTextareaRef.current;
          if (el) {
            el.focus();
            el.setSelectionRange(el.value.length, el.value.length);
          }
        }, 50);
      } else {
        const el = bodyTextareaRef.current;
        if (el) {
          const start = el.selectionStart ?? body.length;
          const end = el.selectionEnd ?? body.length;
          const updated = body.slice(0, start) + variable + body.slice(end);
          setBody(updated);
          setTimeout(() => {
            el.focus();
            el.setSelectionRange(start + variable.length, start + variable.length);
          }, 0);
        } else {
          setBody(body + variable);
        }
      }
    }
  };

  useEffect(() => {
    Promise.all([
      fetch('/api/campaigns').then((r) => r.json()),
      fetch('/api/email-templates').then((r) => r.json()),
      fetch('/api/products').then((r) => r.json()),
    ]).then(([c, t, p]) => {
      setCampaigns(c.campaigns ?? []);
      setTemplates(t.templates ?? []);
      setProducts(p.products ?? []);
    }).finally(() => setLoading(false));
  }, []);

  // Load campaign leads when campaign changes
  useEffect(() => {
    if (!selectedCampaignId) {
      setCampaignLeads([]);
      setSelected(new Set());
      return;
    }
    setCampaignLeadsLoading(true);
    setSelected(new Set());
    fetch(`/api/campaigns/${selectedCampaignId}/leads`)
      .then((r) => r.json())
      .then((d) => setCampaignLeads((d.leads as LeadRow[]) ?? []))
      .finally(() => setCampaignLeadsLoading(false));
  }, [selectedCampaignId]);

  // Load template subject/body when template changes
  useEffect(() => {
    if (!selectedTemplateId) return;
    const tpl = templates.find((t) => t._id === selectedTemplateId);
    if (tpl) {
      setSubject(tpl.subject);
      setBody(tpl.body);
    }
  }, [selectedTemplateId, templates]);

  const selectedProduct = useMemo(
    () => products.find((p) => p._id === selectedProductId) ?? null,
    [products, selectedProductId]
  );

  const filteredLeads = useMemo(() => {
    if (!statusFilter) return campaignLeads;
    return campaignLeads.filter((l) => l.status === statusFilter);
  }, [campaignLeads, statusFilter]);

  const allSelected = filteredLeads.length > 0 && selected.size === filteredLeads.length;
  const someSelected = selected.size > 0 && !allSelected;

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredLeads.map((l) => l._id)));
    }
  };

  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const previewLead = campaignLeads.find((l) => l._id === previewLeadId) ?? filteredLeads[0] ?? null;

  const canSend =
    !!selectedCampaignId &&
    !!subject.trim() &&
    !!body.trim() &&
    selected.size > 0;

  const handleSend = async () => {
    setSending(true);
    setSendResult(null);
    setSendError('');
    try {
      const res = await fetch('/api/bulk-email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId: selectedCampaignId,
          subject,
          body,
          leadIds: [...selected],
          productId: selectedProductId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSendError(data.error ?? `Send failed (HTTP ${res.status})`);
      } else {
        setSendResult(data as SendSummary);
        setSelected(new Set());
      }
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Network error.');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-20">
          <Loader2 size={22} className="animate-spin text-slate-400" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Layers size={22} className="text-emerald-500" />
          Bulk Email Sender
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Select a campaign, choose a template, pick leads and send. Max 50 per send.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left: configuration ── */}
        <div className="space-y-4">
          {/* Campaign */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              1. Select Campaign <span className="text-rose-500">*</span>
            </label>
            <select
              value={selectedCampaignId}
              onChange={(e) => { setSelectedCampaignId(e.target.value); setSendResult(null); setSendError(''); }}
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">— Select campaign —</option>
              {campaigns.map((c) => (
                <option key={c._id} value={c._id}>{c.name}</option>
              ))}
            </select>
            {selectedCampaignId && !campaignLeadsLoading && (
              <p className="text-xs text-slate-400 mt-2">
                {campaignLeads.length} lead{campaignLeads.length !== 1 ? 's' : ''} in this campaign
              </p>
            )}
          </div>

          {/* Template */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              2. Choose Email Template
            </label>
            <select
              value={selectedTemplateId}
              onChange={(e) => { setSelectedTemplateId(e.target.value); setSendResult(null); }}
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">— No template (write below) —</option>
              {templates.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.name} — {TYPE_LABELS[t.type] ?? t.type}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-400 mt-2">
              Selecting a template fills subject and body. You can edit them below.
            </p>
          </div>

          {/* Product */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              3. Select Product <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">— No product —</option>
              {products.map((p) => (
                <option key={p._id} value={p._id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Subject + Body editor */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              4. Email Content
            </p>

            {/* Variable inserter */}
            <div>
              <p className="text-xs text-slate-400 mb-1.5">
                Insert variable —{' '}
                <span className="text-slate-500 font-medium">
                  {focusedField === 'subject' ? 'into Subject' : 'into Body'}
                </span>
              </p>
              <div className="flex flex-wrap gap-1">
                {VARIABLES.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => insertVariable(v.key)}
                    title={`Insert ${v.key}`}
                    className="px-2 py-1 bg-slate-100 hover:bg-emerald-100 hover:text-emerald-700 text-slate-600 rounded text-xs font-mono transition-colors"
                  >
                    {v.key}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">Subject</label>
              <input
                ref={subjectInputRef}
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                onFocus={() => setFocusedField('subject')}
                placeholder="Email subject with {{variables}}"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-slate-500">Body</label>
                <button
                  onClick={() => setShowPreview((v) => !v)}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
                >
                  {showPreview ? <EyeOff size={12} /> : <Eye size={12} />}
                  {showPreview ? 'Edit' : 'Preview'}
                </button>
              </div>
              {showPreview ? (
                <div className="min-h-[200px] bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                  {previewLead || selectedProduct
                    ? renderPreview(body, previewLead, selectedProduct)
                    : body || <span className="text-slate-300 italic">No content yet.</span>}
                  {previewLead && (
                    <p className="mt-3 text-xs text-slate-400 border-t border-slate-200 pt-2">
                      Preview for: {previewLead.companyName}
                    </p>
                  )}
                </div>
              ) : (
                <textarea
                  ref={bodyTextareaRef}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  onFocus={() => setFocusedField('body')}
                  rows={10}
                  placeholder="Email body with {{variables}}"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono leading-relaxed resize-y"
                />
              )}
            </div>
            {showPreview && filteredLeads.length > 0 && (
              <div>
                <label className="block text-xs text-slate-500 mb-1">Preview for lead</label>
                <select
                  value={previewLeadId}
                  onChange={(e) => setPreviewLeadId(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
                >
                  {filteredLeads.map((l) => (
                    <option key={l._id} value={l._id}>{l.companyName}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Send button */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <button
              onClick={handleSend}
              disabled={!canSend || sending}
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white px-5 py-3 rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-40"
            >
              {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              {sending ? 'Sending…' : `Send to ${selected.size} lead${selected.size !== 1 ? 's' : ''}`}
            </button>
            <p className="text-xs text-slate-400 mt-2 text-center">
              Sends exact subject/body via the connected sender. Max 50 per send.
            </p>
          </div>

          {/* Send result */}
          {sendError && (
            <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-sm text-rose-700">
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              {sendError}
            </div>
          )}
          {sendResult && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <div className="flex items-center gap-2 text-emerald-800 font-medium text-sm mb-3">
                <CheckCircle2 size={16} />
                Send complete
              </div>
              <div className="grid grid-cols-3 gap-2 text-center mb-3">
                <div className="bg-emerald-100 rounded-lg py-2">
                  <div className="text-xl font-bold text-emerald-700">{sendResult.sent}</div>
                  <div className="text-xs text-emerald-600">Sent</div>
                </div>
                <div className="bg-rose-100 rounded-lg py-2">
                  <div className="text-xl font-bold text-rose-700">{sendResult.failed}</div>
                  <div className="text-xs text-rose-600">Failed</div>
                </div>
                <div className="bg-slate-100 rounded-lg py-2">
                  <div className="text-xl font-bold text-slate-700">{sendResult.skipped}</div>
                  <div className="text-xs text-slate-600">Skipped</div>
                </div>
              </div>
              {sendResult.results.some((r) => r.status !== 'sent') && (
                <details className="text-xs text-slate-600">
                  <summary className="cursor-pointer text-slate-500 hover:text-slate-700">
                    View details
                  </summary>
                  <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                    {sendResult.results
                      .filter((r) => r.status !== 'sent')
                      .map((r) => (
                        <div key={r.leadId} className="flex gap-2">
                          <span className={`font-medium ${r.status === 'failed' ? 'text-rose-600' : 'text-slate-500'}`}>
                            {r.status}
                          </span>
                          <span className="text-slate-500 truncate">{r.email || r.leadId}</span>
                          {r.error && <span className="text-slate-400 truncate">— {r.error}</span>}
                        </div>
                      ))}
                  </div>
                </details>
              )}
              <button
                onClick={() => setSendResult(null)}
                className="mt-2 text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1"
              >
                <X size={12} /> Dismiss
              </button>
            </div>
          )}
        </div>

        {/* ── Right: lead selection ── */}
        <div className="lg:col-span-2">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="font-semibold text-slate-800 text-sm">
                  5. Select Leads to Send To
                </h2>
                {selectedCampaignId && (
                  <p className="text-xs text-slate-400 mt-0.5">
                    {selected.size} of {filteredLeads.length} selected
                    {statusFilter ? ` (filtered: ${statusFilter})` : ''}
                  </p>
                )}
              </div>
              {/* Status filter chips */}
              <div className="flex flex-wrap gap-1.5">
                {LEAD_STATUS_FILTERS.map((f) => (
                  <button
                    key={f.value}
                    onClick={() => { setStatusFilter(f.value); setSelected(new Set()); }}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      statusFilter === f.value
                        ? 'bg-slate-700 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {!selectedCampaignId ? (
              <div className="py-20 text-center text-slate-400">
                <Layers size={32} className="mx-auto mb-3 opacity-30" />
                <p>Select a campaign to see its leads.</p>
              </div>
            ) : campaignLeadsLoading ? (
              <div className="py-20 flex justify-center">
                <Loader2 size={22} className="animate-spin text-slate-400" />
              </div>
            ) : filteredLeads.length === 0 ? (
              <div className="py-20 text-center text-slate-400">
                <p>No leads in this campaign{statusFilter ? ` with status "${statusFilter}"` : ''}.</p>
                {statusFilter && (
                  <button
                    onClick={() => setStatusFilter('')}
                    className="mt-2 text-xs text-emerald-600 hover:underline"
                  >
                    Clear filter
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-4 py-3 w-10">
                        <button onClick={toggleAll} className="text-slate-400 hover:text-slate-700">
                          {allSelected ? (
                            <CheckSquare size={16} className="text-emerald-600" />
                          ) : someSelected ? (
                            <CheckSquare size={16} className="text-emerald-400" />
                          ) : (
                            <Square size={16} />
                          )}
                        </button>
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">Company</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">Email</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">Status</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">Country</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredLeads.map((lead) => (
                      <tr
                        key={lead._id}
                        className={`hover:bg-slate-50 transition-colors cursor-pointer ${
                          selected.has(lead._id) ? 'bg-emerald-50' : ''
                        }`}
                        onClick={() => toggleOne(lead._id)}
                      >
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => toggleOne(lead._id)} className="text-slate-400">
                            {selected.has(lead._id) ? (
                              <CheckSquare size={16} className="text-emerald-600" />
                            ) : (
                              <Square size={16} />
                            )}
                          </button>
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-800">{lead.companyName}</td>
                        <td className="px-4 py-3 text-slate-600 text-xs font-mono">
                          {lead.email ?? (
                            <span className="text-slate-300">no email</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={lead.status} />
                        </td>
                        <td className="px-4 py-3 text-slate-600 text-xs">{lead.country}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
