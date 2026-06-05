'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Link from 'next/link';
import AppShell from '@/components/layout/AppShell';
import ScoreBadge from '@/components/ui/ScoreBadge';
import StatusBadge from '@/components/ui/StatusBadge';
import {
  PenLine,
  Search,
  Sparkles,
  Save,
  Send,
  Eye,
  EyeOff,
  ChevronDown,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ExternalLink,
  X,
} from 'lucide-react';
import { type LeadRow, type ProductRow, type EmailTemplateRow } from '@/types';

// ── Constants ──────────────────────────────────────────────────────────
const BLOCKED_STATUSES = new Set(['rejected', 'no_response']);

const VARIABLES = [
  { key: '{{companyName}}', label: 'Company Name' },
  { key: '{{productName}}', label: 'Product Name' },
  { key: '{{moq}}', label: 'MOQ' },
  { key: '{{pricing}}', label: 'Pricing' },
  { key: '{{certifications}}', label: 'Certifications' },
  { key: '{{shippingDetails}}', label: 'Shipping' },
];

const DEFAULT_SUBJECT = 'Introducing {{productName}} — Pharmaceutical Supply Opportunity';
const DEFAULT_BODY = `Dear {{companyName}} team,

I hope this message finds you well.

I am reaching out from our pharmaceutical supply division to introduce {{productName}}, which may be a great fit for your business.

Key highlights:
• MOQ: {{moq}}
• Pricing: {{pricing}}
• Certifications: {{certifications}}
• Shipping: {{shippingDetails}}

We would love to discuss how we can support your supply needs. Would you be available for a brief call this week?

Best regards,`;

// ── Variable renderer (client-side, no API calls) ──────────────────────
function renderVariables(
  template: string,
  lead?: LeadRow | null,
  product?: ProductRow | null
): string {
  return template
    .replace(/\{\{companyName\}\}/g, lead?.companyName ?? '[company name]')
    .replace(/\{\{productName\}\}/g, product?.name ?? '[product name]')
    .replace(/\{\{moq\}\}/g, product?.moq ?? '[MOQ]')
    .replace(/\{\{pricing\}\}/g, product?.pricing ?? '[pricing]')
    .replace(
      /\{\{certifications\}\}/g,
      product?.certifications?.join(', ') ?? '[certifications]'
    )
    .replace(/\{\{shippingDetails\}\}/g, product?.shippingDetails ?? '[shipping details]');
}

// ── Lead combobox ──────────────────────────────────────────────────────
function LeadCombobox({
  leads,
  selected,
  onSelect,
}: {
  leads: LeadRow[];
  selected: LeadRow | null;
  onSelect: (lead: LeadRow | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return leads.slice(0, 40);
    const q = query.toLowerCase();
    return leads
      .filter(
        (l) =>
          l.companyName.toLowerCase().includes(q) ||
          l.email?.toLowerCase().includes(q) ||
          l.country.toLowerCase().includes(q)
      )
      .slice(0, 40);
  }, [leads, query]);

  const displayValue = selected ? `${selected.companyName} — ${selected.email ?? 'no email'}` : '';

  return (
    <div ref={ref} className="relative">
      <div
        className={`flex items-center border rounded-lg overflow-hidden ${open ? 'border-emerald-500 ring-2 ring-emerald-100' : 'border-slate-300'}`}
      >
        <Search size={14} className="ml-3 text-slate-400 shrink-0" />
        <input
          type="text"
          value={open ? query : displayValue}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => { setQuery(''); setOpen(true); }}
          placeholder="Search leads by company or email…"
          className="flex-1 px-3 py-2.5 text-sm focus:outline-none bg-white"
        />
        {selected && (
          <button
            onClick={() => { onSelect(null); setQuery(''); }}
            className="px-2 text-slate-400 hover:text-slate-600"
          >
            <X size={14} />
          </button>
        )}
        <ChevronDown size={14} className="mr-3 text-slate-400 shrink-0" />
      </div>

      {open && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden max-h-60 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-4 py-3 text-sm text-slate-400">No leads match your search.</div>
          ) : (
            filtered.map((lead) => (
              <button
                key={lead._id}
                onClick={() => { onSelect(lead); setQuery(''); setOpen(false); }}
                className={`w-full text-left px-4 py-2.5 hover:bg-slate-50 border-b border-slate-50 last:border-0 ${
                  selected?._id === lead._id ? 'bg-emerald-50' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-slate-800 truncate block">
                      {lead.companyName}
                    </span>
                    <span className="text-xs text-slate-400 truncate block">
                      {lead.email ?? 'no email'} · {lead.country}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <ScoreBadge score={lead.score} />
                    {BLOCKED_STATUSES.has(lead.status) && (
                      <span className="text-[10px] font-semibold bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded">
                        BLOCKED
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────
export default function ComposePage() {
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [templates, setTemplates] = useState<EmailTemplateRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedLead, setSelectedLead] = useState<LeadRow | null>(null);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [body, setBody] = useState(DEFAULT_BODY);
  const [showPreview, setShowPreview] = useState(false);

  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftLeadId, setDraftLeadId] = useState<string | null>(null);
  const [draftSent, setDraftSent] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [improving, setImproving] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const selectedProduct = useMemo(
    () => products.find((p) => p._id === selectedProductId) ?? null,
    [products, selectedProductId]
  );

  const isBlocked = selectedLead ? BLOCKED_STATUSES.has(selectedLead.status) : false;
  const canSend = !!selectedLead && !!selectedLead.email && !isBlocked && subject.trim() && body.trim();

  // ── Load leads, products, templates ──────────────────────────────
  useEffect(() => {
    Promise.all([
      fetch('/api/leads?limit=200&page=1').then((r) => r.json()),
      fetch('/api/products').then((r) => r.json()),
      fetch('/api/email-templates').then((r) => r.json()),
    ]).then(([leadData, productData, templateData]) => {
      setLeads(leadData.leads ?? []);
      setProducts(productData.products ?? []);
      setTemplates(templateData.templates ?? []);
    }).finally(() => setLoading(false));
  }, []);

  // ── Lead selection — clear draft when switching leads ────────────
  const handleLeadSelect = useCallback((lead: LeadRow | null) => {
    if (lead?._id !== selectedLead?._id) {
      setDraftId(null);
      setDraftLeadId(null);
      setDraftSent(false);
      setResult(null);
      setIsDirty(true);
    }
    setSelectedLead(lead);
  }, [selectedLead?._id]);

  // ── Template selection — fills subject and body ───────────────────
  const handleTemplateSelect = useCallback((templateId: string) => {
    setSelectedTemplateId(templateId);
    if (templateId) {
      const tpl = templates.find((t) => t._id === templateId);
      if (tpl) {
        setSubject(tpl.subject);
        setBody(tpl.body);
        setIsDirty(true);
        setDraftId(null);
        setDraftLeadId(null);
        setDraftSent(false);
        setResult(null);
      }
    }
  }, [templates]);

  // ── Mark dirty when editing ───────────────────────────────────────
  const handleSubjectChange = (v: string) => { setSubject(v); setIsDirty(true); setDraftId(null); setDraftLeadId(null); setDraftSent(false); };
  const handleBodyChange = (v: string) => { setBody(v); setIsDirty(true); setDraftId(null); setDraftLeadId(null); setDraftSent(false); };

  // ── Insert variable at cursor ─────────────────────────────────────
  const insertVariable = useCallback((variable: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const newBody = body.slice(0, start) + variable + body.slice(end);
    setBody(newBody);
    setIsDirty(true);
    setDraftId(null);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + variable.length, start + variable.length);
    }, 0);
  }, [body]);

  // ── Save draft (no Claude, no Smartlead) ─────────────────────────
  const saveDraft = useCallback(async (): Promise<string | null> => {
    if (!selectedLead) { setResult({ type: 'error', message: 'Select a lead first.' }); return null; }
    if (!subject.trim()) { setResult({ type: 'error', message: 'Subject is required.' }); return null; }
    if (!body.trim()) { setResult({ type: 'error', message: 'Body is required.' }); return null; }

    setSaving(true);
    setResult(null);
    try {
      const renderedSubject = renderVariables(subject, selectedLead, selectedProduct);
      const renderedBody = renderVariables(body, selectedLead, selectedProduct);

      const res = await fetch('/api/email-logs/manual-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: selectedLead._id, subject: renderedSubject, body: renderedBody }),
      });
      const data = await res.json();
      if (data.error) {
        setResult({ type: 'error', message: data.error });
        return null;
      }
      setDraftId(data.emailLogId);
      setDraftLeadId(selectedLead._id);
      setDraftSent(false);
      setIsDirty(false);
      setResult({ type: 'success', message: 'Draft saved.' });
      return data.emailLogId as string;
    } catch {
      setResult({ type: 'error', message: 'Network error — please try again.' });
      return null;
    } finally {
      setSaving(false);
    }
  }, [selectedLead, subject, body, selectedProduct]);

  // ── Send (saves first if needed, then calls send route) ───────────
  const handleSend = useCallback(async () => {
    setSending(true);
    setResult(null);
    let id = draftId;
    const needsNewDraft =
      !id || isDirty || draftSent || draftLeadId !== (selectedLead?._id ?? null);
    if (needsNewDraft) {
      id = await saveDraft();
      if (!id) { setSending(false); return; }
    }
    try {
      const res = await fetch(`/api/email-logs/${id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sendMode: 'custom' }),
      });
      const text = await res.text();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        setResult({
          type: 'error',
          message: `Non-JSON response from send route: HTTP ${res.status}`,
        });
        return;
      }
      if (!res.ok) {
        setResult({
          type: 'error',
          message: String(data?.message ?? data?.error ?? `Send failed with HTTP ${res.status}`),
        });
        return;
      }
      if (data?.success) {
        setDraftSent(true);
        setResult({
          type: 'success',
          message: `${data.mode === 'dry_run' ? 'Test send complete' : 'Email sent'}. ${data.message}`,
        });
      } else {
        setResult({
          type: 'error',
          message: String(data?.message ?? data?.error ?? 'Send failed.'),
        });
      }
    } catch (err) {
      setResult({
        type: 'error',
        message: err instanceof Error ? err.message : 'Network error during send.',
      });
    } finally {
      setSending(false);
    }
  }, [draftId, isDirty, draftSent, draftLeadId, selectedLead, saveDraft]);

  // ── Improve with AI ───────────────────────────────────────────────
  const handleImprove = useCallback(async () => {
    setImproving(true);
    setResult(null);
    let id = draftId;
    if (!id || isDirty) {
      id = await saveDraft();
      if (!id) { setImproving(false); return; }
    }
    try {
      const res = await fetch(`/api/email-logs/${id}/improve-with-ai`, { method: 'POST' });
      const data = await res.json();
      if (data.error) {
        setResult({ type: 'error', message: data.error });
      } else {
        setBody(data.body);
        setDraftId(id);
        setIsDirty(false);
        setResult({ type: 'success', message: 'Email improved by Claude. Review below and send when ready.' });
      }
    } catch {
      setResult({ type: 'error', message: 'Network error.' });
    } finally {
      setImproving(false);
    }
  }, [draftId, isDirty, saveDraft]);

  const previewSubject = renderVariables(subject, selectedLead, selectedProduct);
  const previewBody = renderVariables(body, selectedLead, selectedProduct);

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
          <PenLine size={22} className="text-emerald-500" />
          Compose Email
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Manually write emails with product variables. Claude is optional.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left: controls ── */}
        <div className="space-y-5">
          {/* Lead selector */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Select Lead <span className="text-rose-500">*</span>
            </label>
            <LeadCombobox leads={leads} selected={selectedLead} onSelect={handleLeadSelect} />

            {selectedLead && (
              <div className="mt-3 space-y-1.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Status</span>
                  <StatusBadge status={selectedLead.status} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Score</span>
                  <ScoreBadge score={selectedLead.score} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Country</span>
                  <span className="text-slate-700 text-xs">{selectedLead.country}</span>
                </div>
                {selectedLead.email && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Email</span>
                    <span className="text-slate-700 text-xs font-mono truncate max-w-[160px]">{selectedLead.email}</span>
                  </div>
                )}
                {selectedLead._id && (
                  <Link
                    href={`/leads/${selectedLead._id}`}
                    className="flex items-center gap-1 text-xs text-emerald-600 hover:underline mt-1"
                  >
                    <ExternalLink size={11} />
                    View lead profile
                  </Link>
                )}
              </div>
            )}

            {isBlocked && (
              <div className="mt-3 flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2.5 text-xs text-rose-700">
                <AlertCircle size={13} className="shrink-0 mt-0.5" />
                <span>
                  Cannot send to this lead — status is <strong>{selectedLead?.status}</strong>.
                  Update their status in the lead profile to re-enable.
                </span>
              </div>
            )}

            {selectedLead && !selectedLead.email && (
              <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-xs text-amber-700">
                <AlertCircle size={13} className="shrink-0 mt-0.5" />
                This lead has no email address. Add one to enable sending.
              </div>
            )}
          </div>

          {/* Product selector */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Select Product <span className="text-slate-400 font-normal">(for variables)</span>
            </label>
            <select
              value={selectedProductId}
              onChange={(e) => { setSelectedProductId(e.target.value); setDraftId(null); setResult(null); setIsDirty(true); }}
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">— No product selected —</option>
              {products.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name}
                </option>
              ))}
            </select>

            {selectedProduct && (
              <div className="mt-3 space-y-1 text-xs text-slate-500">
                {selectedProduct.moq && <div><span className="font-medium">MOQ:</span> {selectedProduct.moq}</div>}
                {selectedProduct.pricing && <div><span className="font-medium">Pricing:</span> {selectedProduct.pricing}</div>}
                {selectedProduct.certifications?.length ? (
                  <div><span className="font-medium">Certs:</span> {selectedProduct.certifications.join(', ')}</div>
                ) : null}
              </div>
            )}

            {products.length === 0 && (
              <p className="text-xs text-slate-400 mt-2">
                No products yet.{' '}
                <Link href="/products" className="text-emerald-600 hover:underline">
                  Add products →
                </Link>
              </p>
            )}
          </div>

          {/* Insert Variables */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
              Insert Variable
            </p>
            <div className="flex flex-wrap gap-1.5">
              {VARIABLES.map((v) => (
                <button
                  key={v.key}
                  onClick={() => insertVariable(v.key)}
                  className="px-2.5 py-1.5 bg-slate-100 hover:bg-emerald-100 hover:text-emerald-700 text-slate-600 rounded-md text-xs font-mono transition-colors"
                  title={`Insert ${v.key} at cursor`}
                >
                  {v.key}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Click to insert at cursor position. Variables are replaced with real values on send.
            </p>
          </div>
        </div>

        {/* ── Right: editor + actions ── */}
        <div className="lg:col-span-2 space-y-4">
          {/* Template selector */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Select Template <span className="text-slate-400 font-normal">(optional — fills subject and body)</span>
            </label>
            <select
              value={selectedTemplateId}
              onChange={(e) => handleTemplateSelect(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">— No template —</option>
              {templates.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.name} ({t.type.replace(/_/g, ' ')})
                </option>
              ))}
            </select>
            {selectedTemplateId && (
              <p className="text-xs text-slate-400 mt-2">
                Template loaded. You can edit the subject and body freely before sending.
              </p>
            )}
            {templates.length === 0 && (
              <p className="text-xs text-slate-400 mt-2">
                No templates yet.{' '}
                <Link href="/email-templates" className="text-emerald-600 hover:underline">
                  Create templates →
                </Link>
              </p>
            )}
          </div>

          {/* Subject */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Subject
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => handleSubjectChange(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="Email subject…"
            />
            {(selectedLead || selectedProduct) && previewSubject !== subject && (
              <p className="mt-2 text-xs text-slate-500">
                <span className="font-medium">Preview:</span> {previewSubject}
              </p>
            )}
          </div>

          {/* Body editor */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Email Body
              </label>
              <button
                onClick={() => setShowPreview((v) => !v)}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700"
              >
                {showPreview ? <EyeOff size={13} /> : <Eye size={13} />}
                {showPreview ? 'Edit' : 'Preview'}
              </button>
            </div>

            {showPreview ? (
              <div className="min-h-[280px] bg-slate-50 border border-slate-200 rounded-lg p-4 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                {previewBody || <span className="text-slate-300 italic">No content yet.</span>}
              </div>
            ) : (
              <textarea
                ref={textareaRef}
                value={body}
                onChange={(e) => handleBodyChange(e.target.value)}
                rows={14}
                className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono leading-relaxed resize-y"
                placeholder="Write your email here. Use {{variables}} for dynamic content."
              />
            )}

            <p className="text-xs text-slate-400 mt-2">
              Variables in{' '}
              <code className="bg-slate-100 px-1 rounded font-mono">{'{{'}</code>
              <code className="bg-slate-100 px-1 rounded font-mono">{'}}'}</code>{' '}
              are replaced with lead/product values when the draft is saved.
            </p>
          </div>

          {/* Result banner */}
          {result && (
            <div
              className={`flex items-start gap-2 text-sm px-4 py-3 rounded-xl border ${
                result.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-700'
              }`}
            >
              {result.type === 'success' ? (
                <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
              ) : (
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
              )}
              <span>{result.message}</span>
              {draftId && result.type === 'success' && (
                <Link
                  href={`/leads/${selectedLead?._id}`}
                  className="ml-auto text-xs underline shrink-0"
                >
                  View lead →
                </Link>
              )}
            </div>
          )}

          {/* Action bar */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex flex-wrap items-center gap-3">
              {/* Save Draft */}
              <button
                onClick={saveDraft}
                disabled={saving || !selectedLead || !subject.trim() || !body.trim()}
                className="flex items-center gap-2 border border-slate-300 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors disabled:opacity-40"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {saving ? 'Saving…' : isDirty && draftId ? 'Re-save Draft' : 'Save Draft'}
              </button>

              {/* Send */}
              <button
                onClick={handleSend}
                disabled={sending || saving || !canSend}
                className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-40"
              >
                {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {sending ? 'Sending…' : 'Send Email'}
              </button>

              {/* Improve with AI */}
              <button
                onClick={handleImprove}
                disabled={improving || saving || !selectedLead || !body.trim()}
                className="flex items-center gap-2 border border-violet-300 text-violet-700 bg-violet-50 px-4 py-2 rounded-lg text-sm font-medium hover:bg-violet-100 transition-colors disabled:opacity-40"
                title="Uses Claude Haiku — logged to usage tracker"
              >
                {improving ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {improving ? 'Improving…' : 'Improve with AI'}
              </button>
            </div>

            {/* Labels */}
            <div className="flex flex-wrap gap-4 mt-3 text-xs text-slate-400">
              <span className="flex items-center gap-1">
                <Save size={11} />
                Saves draft only — no sending
              </span>
              <span className="flex items-center gap-1">
                <Send size={11} />
                Sends this exact subject and body using the connected sender
              </span>
              <span className="flex items-center gap-1 text-violet-400">
                <Sparkles size={11} />
                Uses Claude Haiku — appears in cost tracker
              </span>
            </div>

            {draftId && (
              <p className="mt-3 text-xs text-slate-400">
                Draft ID:{' '}
                <code className="bg-slate-100 px-1 rounded font-mono">{draftId}</code>
                {isDirty && (
                  <span className="ml-2 text-amber-500 font-medium">· Unsaved changes</span>
                )}
              </p>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
