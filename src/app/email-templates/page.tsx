'use client';

import { useState, useEffect, useRef } from 'react';
import AppShell from '@/components/layout/AppShell';
import { EmailTemplateRow } from '@/types';
import {
  FileText,
  PlusCircle,
  Pencil,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

const TEMPLATE_TYPES = [
  'initial',
  'follow_up',
  'warm_reply',
  'cold_reply',
  'pricing',
  'custom',
] as const;

const VARIABLES_HELP = [
  '{{companyName}}',
  '{{productName}}',
  '{{moq}}',
  '{{pricing}}',
  '{{certifications}}',
  '{{shippingDetails}}',
  '{{country}}',
  '{{category}}',
  '{{city}}',
];

const TYPE_LABELS: Record<string, string> = {
  initial: 'Initial Outreach',
  follow_up: 'Follow-Up',
  warm_reply: 'Warm Reply',
  cold_reply: 'Cold Reply',
  pricing: 'Pricing',
  custom: 'Custom',
};

const EMPTY_FORM = {
  name: '',
  type: 'initial' as EmailTemplateRow['type'],
  subject: '',
  body: '',
};

export default function EmailTemplatesPage() {
  const [templates, setTemplates] = useState<EmailTemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showVars, setShowVars] = useState(false);

  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const lastFocusedRef = useRef<'subject' | 'body'>('body');

  const insertVariable = (variable: string) => {
    if (lastFocusedRef.current === 'subject') {
      const el = subjectRef.current;
      if (!el) return;
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const newValue = form.subject.slice(0, start) + variable + form.subject.slice(end);
      setForm((f) => ({ ...f, subject: newValue }));
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(start + variable.length, start + variable.length);
      }, 0);
    } else {
      const el = bodyRef.current;
      if (!el) return;
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const newValue = form.body.slice(0, start) + variable + form.body.slice(end);
      setForm((f) => ({ ...f, body: newValue }));
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(start + variable.length, start + variable.length);
      }, 0);
    }
  };

  const fetchTemplates = () => {
    setLoading(true);
    fetch('/api/email-templates')
      .then((r) => r.json())
      .then((d) => setTemplates(d.templates ?? []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchTemplates(); }, []);

  const openNewForm = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setResult(null);
    setShowForm(true);
  };

  const openEditForm = (t: EmailTemplateRow) => {
    setEditingId(t._id);
    setForm({ name: t.name, type: t.type, subject: t.subject, body: t.body });
    setResult(null);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setResult(null);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setResult({ type: 'error', message: 'Template name is required.' }); return; }
    if (!form.subject.trim()) { setResult({ type: 'error', message: 'Subject is required.' }); return; }
    if (!form.body.trim()) { setResult({ type: 'error', message: 'Body is required.' }); return; }

    setSaving(true);
    setResult(null);
    try {
      const url = editingId ? `/api/email-templates/${editingId}` : '/api/email-templates';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ type: 'error', message: data.error ?? 'Failed to save template.' });
      } else {
        setResult({ type: 'success', message: editingId ? 'Template updated.' : 'Template created.' });
        fetchTemplates();
        if (!editingId) cancelForm();
      }
    } catch {
      setResult({ type: 'error', message: 'Network error.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete template "${name}"? This cannot be undone.`)) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/email-templates/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setTemplates((prev) => prev.filter((t) => t._id !== id));
        if (editingId === id) cancelForm();
      } else {
        const data = await res.json();
        alert(data.error ?? 'Failed to delete template.');
      }
    } catch {
      alert('Network error.');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <AppShell>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <FileText size={22} className="text-emerald-500" />
            Email Templates
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Reusable subject and body templates with variable support.
          </p>
        </div>
        <button
          onClick={openNewForm}
          className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
        >
          <PlusCircle size={16} />
          New Template
        </button>
      </div>

      {/* Variables helper */}
      <div className="bg-white border border-slate-200 rounded-xl mb-5 overflow-hidden">
        <button
          onClick={() => setShowVars((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <span>Available Variables</span>
          {showVars ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {showVars && (
          <div className="px-5 pb-4 border-t border-slate-100">
            <div className="flex flex-wrap gap-2 mt-3">
              {VARIABLES_HELP.map((v) => (
                <code
                  key={v}
                  className="bg-slate-100 text-slate-700 px-2 py-1 rounded text-xs font-mono"
                >
                  {v}
                </code>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-2">
              These placeholders are replaced with real values when an email is sent. Use them in both subject and body.
            </p>
          </div>
        )}
      </div>

      {/* Create / Edit form */}
      {showForm && (
        <div className="bg-white border border-emerald-200 rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-800">
              {editingId ? 'Edit Template' : 'New Template'}
            </h2>
            <button onClick={cancelForm} className="text-slate-400 hover:text-slate-600">
              <X size={18} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                Template Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Initial Pharma Outreach"
                className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                Type <span className="text-rose-500">*</span>
              </label>
              <select
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as EmailTemplateRow['type'] }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {TEMPLATE_TYPES.map((t) => (
                  <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
              Subject <span className="text-rose-500">*</span>
            </label>
            <input
              ref={subjectRef}
              type="text"
              value={form.subject}
              onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
              onFocus={() => { lastFocusedRef.current = 'subject'; }}
              placeholder="e.g. Introducing {{productName}} — Pharmaceutical Supply Opportunity"
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="mb-4">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
              Body <span className="text-rose-500">*</span>
            </label>
            <textarea
              ref={bodyRef}
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              onFocus={() => { lastFocusedRef.current = 'body'; }}
              rows={12}
              placeholder="Dear {{companyName}} team,&#10;&#10;..."
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono leading-relaxed resize-y"
            />
          </div>

          {/* Insert Variable */}
          <div className="mb-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Insert Variable
            </p>
            <div className="flex flex-wrap gap-1.5">
              {VARIABLES_HELP.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => insertVariable(v)}
                  className="px-2.5 py-1.5 bg-slate-100 hover:bg-emerald-100 hover:text-emerald-700 text-slate-600 rounded-md text-xs font-mono transition-colors"
                  title={`Insert ${v} at cursor`}
                >
                  {v}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-1.5">
              Focus subject or body first, then click a variable to insert at cursor. Default inserts into body.
            </p>
          </div>

          {result && (
            <div className={`flex items-center gap-2 text-sm px-4 py-3 rounded-lg border mb-4 ${
              result.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-700'
            }`}>
              {result.type === 'success' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
              {result.message}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 bg-emerald-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-40"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Create Template'}
            </button>
            <button
              onClick={cancelForm}
              className="px-5 py-2 border border-slate-300 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Template list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-white border border-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center py-20 text-slate-400 bg-white border border-slate-200 rounded-xl">
          <FileText size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-lg mb-2">No templates yet</p>
          <p className="text-sm">Create your first template to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((t) => (
            <div
              key={t._id}
              className={`bg-white border rounded-xl p-5 transition-colors ${
                editingId === t._id ? 'border-emerald-300' : 'border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-slate-800">{t.name}</span>
                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                      {TYPE_LABELS[t.type] ?? t.type}
                    </span>
                    {!t.isActive && (
                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                        Inactive
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-600 truncate">{t.subject}</p>
                  <p className="text-xs text-slate-400 mt-1 line-clamp-2 whitespace-pre-wrap">
                    {t.body.slice(0, 160)}{t.body.length > 160 ? '…' : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => openEditForm(t)}
                    className="flex items-center gap-1 text-xs text-slate-600 hover:text-slate-800 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <Pencil size={13} />
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(t._id, t.name)}
                    disabled={deleting === t._id}
                    className="flex items-center gap-1 text-xs text-rose-600 hover:text-rose-700 border border-rose-200 px-3 py-1.5 rounded-lg hover:bg-rose-50 transition-colors disabled:opacity-40"
                  >
                    {deleting === t._id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
