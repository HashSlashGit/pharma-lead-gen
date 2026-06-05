'use client';

import { useEffect, useState } from 'react';
import AppShell from '@/components/layout/AppShell';
import { ProductRow } from '@/types';
import { Package, PlusCircle, X, CheckCircle, AlertTriangle } from 'lucide-react';

const empty = {
  name: '', category: '', description: '', pricing: '', moq: '',
  certifications: '', shippingDetails: '', approvedClaims: '', restrictedClaims: '',
};

export default function ProductsPage() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(empty);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok?: boolean; error?: string } | null>(null);

  const fetchProducts = () => {
    setLoading(true);
    fetch('/api/products')
      .then((r) => r.json())
      .then((data) => setProducts(data.products ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchProducts(); }, []);

  const set = (field: keyof typeof empty) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    const payload = {
      ...form,
      certifications: form.certifications ? form.certifications.split(',').map((s) => s.trim()).filter(Boolean) : [],
      approvedClaims: form.approvedClaims ? form.approvedClaims.split('\n').map((s) => s.trim()).filter(Boolean) : [],
      restrictedClaims: form.restrictedClaims ? form.restrictedClaims.split('\n').map((s) => s.trim()).filter(Boolean) : [],
    };
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) setResult({ error: data.error });
      else {
        setResult({ ok: true });
        setForm(empty);
        fetchProducts();
        setTimeout(() => { setShowForm(false); setResult(null); }, 1500);
      }
    } catch {
      setResult({ error: 'Network error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Products</h1>
          <p className="text-slate-500 text-sm mt-1">Pharmaceutical products for personalized outreach</p>
        </div>
        <button
          onClick={() => { setShowForm(true); setResult(null); }}
          className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors shadow-sm"
        >
          <PlusCircle size={15} /> Add Product
        </button>
      </div>

      {/* Add product form */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold text-slate-800">New Product</h2>
            <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
              <X size={18} />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(['name', 'category', 'pricing', 'moq'] as const).map((f) => (
                <div key={f}>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5 capitalize">
                    {f} {(f === 'name' || f === 'category') && <span className="text-rose-500">*</span>}
                  </label>
                  <input
                    value={form[f]}
                    onChange={set(f)}
                    required={f === 'name' || f === 'category'}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800"
                  />
                </div>
              ))}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Description</label>
              <textarea value={form.description} onChange={set('description')} rows={2}
                className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none text-slate-800" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Certifications <span className="text-xs text-slate-400">(comma-separated)</span>
              </label>
              <input value={form.certifications} onChange={set('certifications')} placeholder="GMP, ISO, FDA, HALAL"
                className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Shipping Details</label>
              <input value={form.shippingDetails} onChange={set('shippingDetails')}
                className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Approved Claims <span className="text-xs text-slate-400">(one per line)</span>
                </label>
                <textarea value={form.approvedClaims} onChange={set('approvedClaims')} rows={3}
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none text-slate-800" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Restricted Claims <span className="text-xs text-slate-400">(one per line)</span>
                </label>
                <textarea value={form.restrictedClaims} onChange={set('restrictedClaims')} rows={3}
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none text-slate-800" />
              </div>
            </div>
            {result?.error && (
              <div className="flex items-center gap-2 text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5 text-sm">
                <AlertTriangle size={13} /> {result.error}
              </div>
            )}
            {result?.ok && (
              <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-2.5 text-sm">
                <CheckCircle size={13} /> Product saved successfully.
              </div>
            )}
            <button type="submit" disabled={submitting}
              className="bg-emerald-600 text-white px-6 py-2 rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-60 shadow-sm">
              {submitting ? 'Saving…' : 'Save Product'}
            </button>
          </form>
        </div>
      )}

      {/* Product list */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map((i) => <div key={i} className="h-36 bg-white border border-slate-100 rounded-2xl animate-pulse shadow-sm" />)}
        </div>
      ) : products.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4">
            <Package size={24} className="text-slate-300" />
          </div>
          <p className="text-slate-500 font-medium mb-1">No products yet</p>
          <p className="text-slate-400 text-sm">Add a product to enable AI-personalized outreach emails.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {products.map((p) => (
            <div key={p._id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-slate-800">{p.name}</h3>
                  <span className="text-xs text-slate-400 font-medium">{p.category}</span>
                </div>
                <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                  <Package size={16} className="text-emerald-600" />
                </div>
              </div>
              {p.description && <p className="text-sm text-slate-600 mb-3 leading-relaxed">{p.description}</p>}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-500 mb-3">
                {p.pricing && (
                  <div><span className="font-medium text-slate-600">Pricing: </span>{p.pricing}</div>
                )}
                {p.moq && (
                  <div><span className="font-medium text-slate-600">MOQ: </span>{p.moq}</div>
                )}
                {p.shippingDetails && (
                  <div className="col-span-2"><span className="font-medium text-slate-600">Shipping: </span>{p.shippingDetails}</div>
                )}
              </div>
              {p.certifications && p.certifications.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {p.certifications.map((cert) => (
                    <span key={cert} className="bg-blue-50 text-blue-600 ring-1 ring-blue-100 text-xs px-2.5 py-0.5 rounded-full font-medium">
                      {cert}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
