'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import StatusBadge from '@/components/ui/StatusBadge';
import ScoreBadge from '@/components/ui/ScoreBadge';
import {
  X, Mail, Phone, Globe, MapPin, Tag, Archive, RotateCcw,
  Edit2, Check, ExternalLink, Loader2, Plus, Trash2,
} from 'lucide-react';
import { LeadRow, LeadStatus } from '@/types';

interface Props {
  leadId: string | null;
  onClose: () => void;
  onUpdated?: (id: string, updates: Partial<LeadRow>) => void;
}

const STATUSES: LeadStatus[] = [
  'new', 'qualified', 'needs_review', 'low_priority', 'contacted', 'warm', 'cold', 'rejected', 'no_response', 'do_not_contact',
];

const PRESET_TAGS = ['Pharma', 'Healthcare', 'Enterprise', 'VIP', 'High Priority', 'Cold', 'Warm', 'Hot'];

export default function LeadDrawer({ leadId, onClose, onUpdated }: Props) {
  const [lead, setLead] = useState<LeadRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [tagInput, setTagInput] = useState('');

  // Editable fields mirror
  const [draft, setDraft] = useState<Partial<LeadRow>>({});

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchLead = useCallback(async (id: string) => {
    setLoading(true);
    setEditing(false);
    try {
      const res = await fetch(`/api/leads/${id}`);
      const data = await res.json();
      if (data.lead) {
        setLead(data.lead as LeadRow);
        setDraft({});
      }
    } catch {
      showToast('error', 'Failed to load lead');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (leadId) fetchLead(leadId);
    else setLead(null);
  }, [leadId, fetchLead]);

  const current = { ...lead, ...draft } as LeadRow;

  const handleSave = async () => {
    if (!lead || Object.keys(draft).length === 0) { setEditing(false); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/leads/${lead._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Update failed');
      setLead(data.lead as LeadRow);
      setDraft({});
      setEditing(false);
      showToast('success', 'Lead updated');
      onUpdated?.(lead._id, draft);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const handleArchiveToggle = async () => {
    if (!lead) return;
    const newArchived = !lead.archived;
    setSaving(true);
    try {
      const res = await fetch(`/api/leads/${lead._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: newArchived }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setLead(data.lead as LeadRow);
      showToast('success', newArchived ? 'Lead archived' : 'Lead restored');
      onUpdated?.(lead._id, { archived: newArchived });
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Operation failed');
    } finally {
      setSaving(false);
    }
  };

  const addTag = (tag: string) => {
    const cleaned = tag.trim();
    if (!cleaned) return;
    const currentTags = (draft.tags ?? lead?.tags ?? []) as string[];
    if (currentTags.includes(cleaned)) return;
    setDraft((d) => ({ ...d, tags: [...currentTags, cleaned] }));
    setTagInput('');
  };

  const removeTag = (tag: string) => {
    const currentTags = (draft.tags ?? lead?.tags ?? []) as string[];
    setDraft((d) => ({ ...d, tags: currentTags.filter((t) => t !== tag) }));
  };

  if (!leadId) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer */}
      <aside className="fixed right-0 top-0 bottom-0 z-50 w-[440px] max-w-full bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800 text-base">Lead Details</h2>
          <div className="flex items-center gap-2">
            {lead && (
              <Link
                href={`/leads/${lead._id}`}
                className="text-slate-400 hover:text-slate-600 transition-colors"
                title="Open full page"
              >
                <ExternalLink size={16} />
              </Link>
            )}
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Toast */}
        {toast && (
          <div className={`mx-4 mt-3 px-4 py-2.5 rounded-xl text-sm font-medium ${
            toast.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-rose-50 text-rose-700 border border-rose-200'
          }`}>
            {toast.msg}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={24} className="animate-spin text-slate-400" />
            </div>
          ) : !lead ? (
            <p className="text-slate-400 text-sm text-center py-16">Lead not found</p>
          ) : (
            <>
              {/* Status + Score row */}
              <div className="flex items-center gap-3">
                <StatusBadge status={current.status} />
                <ScoreBadge score={current.score} />
                {current.archived && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200">
                    Archived
                  </span>
                )}
              </div>

              {/* Company name */}
              <div>
                {editing ? (
                  <input
                    className="w-full text-xl font-bold text-slate-800 border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    value={current.companyName ?? ''}
                    onChange={(e) => setDraft((d) => ({ ...d, companyName: e.target.value }))}
                  />
                ) : (
                  <h3 className="text-xl font-bold text-slate-800">{current.companyName}</h3>
                )}
              </div>

              {/* Contact info */}
              <div className="space-y-2">
                <FieldRow
                  icon={<Mail size={13} className="text-slate-400" />}
                  label="Email"
                  value={lead.email}
                  editing={false}
                />
                <FieldRow
                  icon={<Phone size={13} className="text-slate-400" />}
                  label="Phone"
                  value={current.phone}
                  editing={editing}
                  onChange={(v) => setDraft((d) => ({ ...d, phone: v }))}
                />
                <FieldRow
                  icon={<Globe size={13} className="text-slate-400" />}
                  label="Website"
                  value={current.website}
                  editing={editing}
                  onChange={(v) => setDraft((d) => ({ ...d, website: v }))}
                  isLink
                />
                <FieldRow
                  icon={<MapPin size={13} className="text-slate-400" />}
                  label="Location"
                  value={[current.city, current.country].filter(Boolean).join(', ')}
                  editing={editing}
                  onChange={(v) => setDraft((d) => ({ ...d, country: v }))}
                />
              </div>

              <div className="border-t border-slate-100 pt-4 space-y-3">
                {/* Category */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Category</label>
                  {editing ? (
                    <input
                      className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      value={current.category ?? ''}
                      onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
                    />
                  ) : (
                    <p className="text-sm text-slate-700 capitalize">{current.category}</p>
                  )}
                </div>

                {/* Status */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Status</label>
                  {editing ? (
                    <select
                      className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      value={current.status}
                      onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value as LeadStatus }))}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-sm text-slate-700 capitalize">{current.status?.replace(/_/g, ' ')}</p>
                  )}
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Notes</label>
                  {editing ? (
                    <textarea
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                      rows={3}
                      value={current.notes ?? ''}
                      onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                    />
                  ) : (
                    <p className="text-sm text-slate-600 whitespace-pre-wrap">{current.notes || '—'}</p>
                  )}
                </div>
              </div>

              {/* Tags */}
              <div className="border-t border-slate-100 pt-4">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                  <Tag size={12} /> Tags
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {(draft.tags ?? lead.tags ?? []).map((tag: string) => (
                    <span key={tag} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-violet-100 text-violet-700 border border-violet-200">
                      {tag}
                      {editing && (
                        <button onClick={() => removeTag(tag)} className="hover:text-violet-900">
                          <X size={10} />
                        </button>
                      )}
                    </span>
                  ))}
                  {(draft.tags ?? lead.tags ?? []).length === 0 && (
                    <span className="text-xs text-slate-400">No tags</span>
                  )}
                </div>
                {editing && (
                  <>
                    <div className="flex gap-2 mb-2">
                      <input
                        className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        placeholder="Add tag…"
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput); } }}
                      />
                      <button
                        onClick={() => addTag(tagInput)}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-medium transition-colors"
                      >
                        <Plus size={13} />
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {PRESET_TAGS.filter((t) => !(draft.tags ?? lead.tags ?? []).includes(t)).map((t) => (
                        <button
                          key={t}
                          onClick={() => addTag(t)}
                          className="px-2 py-0.5 text-xs border border-slate-200 rounded-full text-slate-500 hover:bg-slate-50 transition-colors"
                        >
                          + {t}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Meta info */}
              <div className="border-t border-slate-100 pt-4 grid grid-cols-2 gap-3 text-xs text-slate-500">
                <div>
                  <span className="font-medium">Source</span>
                  <p className="text-slate-700 mt-0.5">{lead.source || '—'}</p>
                </div>
                <div>
                  <span className="font-medium">Provider</span>
                  <p className="text-slate-700 mt-0.5 capitalize">{lead.emailProvider || '—'}</p>
                </div>
                <div>
                  <span className="font-medium">Imported</span>
                  <p className="text-slate-700 mt-0.5">{new Date(lead.createdAt).toLocaleDateString()}</p>
                </div>
                <div>
                  <span className="font-medium">Follow-ups</span>
                  <p className="text-slate-700 mt-0.5">{lead.followUpCount}</p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer actions */}
        {lead && (
          <div className="px-5 py-4 border-t border-slate-100 flex items-center gap-2">
            {editing ? (
              <>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1.5 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                  Save
                </button>
                <button
                  onClick={() => { setEditing(false); setDraft({}); setTagInput(''); }}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setEditing(true)}
                  className="flex items-center gap-1.5 border border-slate-200 text-slate-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
                >
                  <Edit2 size={13} /> Edit
                </button>
                <button
                  onClick={handleArchiveToggle}
                  disabled={saving}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                    lead.archived
                      ? 'border border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                      : 'border border-amber-200 text-amber-700 hover:bg-amber-50'
                  }`}
                >
                  {saving ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : lead.archived ? (
                    <RotateCcw size={13} />
                  ) : (
                    <Archive size={13} />
                  )}
                  {lead.archived ? 'Restore' : 'Archive'}
                </button>
              </>
            )}
            <div className="ml-auto">
              <Trash2 size={14} className="text-slate-200" />
            </div>
          </div>
        )}
      </aside>
    </>
  );
}

function FieldRow({
  icon,
  label,
  value,
  editing,
  onChange,
  isLink,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  editing: boolean;
  onChange?: (v: string) => void;
  isLink?: boolean;
}) {
  if (!value && !editing) return null;

  return (
    <div className="flex items-start gap-2">
      <span className="mt-1 shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        {editing && onChange ? (
          <input
            className="w-full border border-slate-200 rounded-lg px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={label}
          />
        ) : isLink && value ? (
          <a
            href={value.startsWith('http') ? value : `https://${value}`}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-emerald-600 hover:underline truncate block"
          >
            {value}
          </a>
        ) : (
          <span className="text-sm text-slate-700 truncate block">{value || '—'}</span>
        )}
      </div>
    </div>
  );
}
