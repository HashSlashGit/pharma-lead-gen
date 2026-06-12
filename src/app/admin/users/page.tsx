'use client';

import { useEffect, useState, useCallback } from 'react';
import AppShell from '@/components/layout/AppShell';
import {
  Users,
  Plus,
  Edit2,
  Trash2,
  ToggleLeft,
  ToggleRight,
  KeyRound,
  Loader2,
  AlertCircle,
  CheckCircle,
  X,
  Shield,
  User,
} from 'lucide-react';

interface UserRow {
  _id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  active: boolean;
  createdAt: string;
}

interface ModalState {
  type: 'add' | 'edit' | 'delete' | 'reset-password' | null;
  user?: UserRow;
}

function RoleBadge({ role }: { role: 'admin' | 'user' }) {
  return role === 'admin' ? (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 ring-1 ring-violet-200">
      <Shield size={10} /> Admin
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 ring-1 ring-slate-200">
      <User size={10} /> User
    </span>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">Active</span>
  ) : (
    <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full bg-slate-50 text-slate-500 ring-1 ring-slate-200">Disabled</span>
  );
}

interface FormField { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; required?: boolean }
function FormField({ label, value, onChange, type = 'text', placeholder, required }: FormField) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}{required && <span className="text-rose-500 ml-0.5">*</span>}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800" />
    </div>
  );
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [modal, setModal] = useState<ModalState>({ type: null });
  const [submitting, setSubmitting] = useState(false);
  const [opError, setOpError] = useState('');
  const [opSuccess, setOpSuccess] = useState('');

  // Form state
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState<'admin' | 'user'>('user');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setFetchError('');
    try {
      const res = await fetch('/api/users');
      const data = await res.json();
      if (!res.ok) { setFetchError(data.error ?? 'Failed to load users'); return; }
      setUsers(data.users ?? []);
    } catch {
      setFetchError('Network error loading users.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetch('/api/users')
      .then((r) => r.json())
      .then((data: { users?: UserRow[]; error?: string }) => {
        if (!active) return;
        if (data.error) setFetchError(data.error);
        else setUsers(data.users ?? []);
      })
      .catch(() => { if (active) setFetchError('Network error loading users.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const openAdd = () => {
    setFormName(''); setFormEmail(''); setFormPassword(''); setFormRole('user');
    setOpError(''); setOpSuccess('');
    setModal({ type: 'add' });
  };

  const openEdit = (u: UserRow) => {
    setFormName(u.name); setFormEmail(u.email); setFormRole(u.role);
    setFormPassword('');
    setOpError(''); setOpSuccess('');
    setModal({ type: 'edit', user: u });
  };

  const openDelete = (u: UserRow) => { setOpError(''); setModal({ type: 'delete', user: u }); };
  const openReset = (u: UserRow) => { setFormPassword(''); setOpError(''); setModal({ type: 'reset-password', user: u }); };
  const closeModal = () => setModal({ type: null });

  const handleAdd = async () => {
    setSubmitting(true); setOpError('');
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: formName, email: formEmail, password: formPassword, role: formRole }),
      });
      const data = await res.json();
      if (!res.ok) { setOpError(data.error ?? 'Failed to create user'); return; }
      setOpSuccess('User created successfully.');
      closeModal();
      await fetchUsers();
    } catch { setOpError('Network error.'); }
    finally { setSubmitting(false); }
  };

  const handleEdit = async () => {
    if (!modal.user) return;
    setSubmitting(true); setOpError('');
    try {
      const res = await fetch(`/api/users/${modal.user._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: formName, email: formEmail }),
      });
      const data = await res.json();
      if (!res.ok) { setOpError(data.error ?? 'Failed to update user'); return; }
      setOpSuccess('User updated.');
      closeModal();
      await fetchUsers();
    } catch { setOpError('Network error.'); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async () => {
    if (!modal.user) return;
    setSubmitting(true); setOpError('');
    try {
      const res = await fetch(`/api/users/${modal.user._id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) { setOpError(data.error ?? 'Failed to delete user'); return; }
      setOpSuccess('User deleted.');
      closeModal();
      await fetchUsers();
    } catch { setOpError('Network error.'); }
    finally { setSubmitting(false); }
  };

  const handleToggleActive = async (u: UserRow) => {
    try {
      const res = await fetch(`/api/users/${u._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !u.active }),
      });
      if (res.ok) await fetchUsers();
    } catch { /* non-fatal */ }
  };

  const handleResetPassword = async () => {
    if (!modal.user) return;
    setSubmitting(true); setOpError('');
    try {
      const res = await fetch(`/api/users/${modal.user._id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: formPassword }),
      });
      const data = await res.json();
      if (!res.ok) { setOpError(data.error ?? 'Failed to reset password'); return; }
      setOpSuccess('Password reset successfully.');
      closeModal();
    } catch { setOpError('Network error.'); }
    finally { setSubmitting(false); }
  };

  return (
    <AppShell>
      <div className="max-w-4xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">User Management</h1>
            <p className="text-slate-500 text-sm mt-1">Manage platform users and access levels.</p>
          </div>
          <button onClick={openAdd}
            className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors shadow-sm">
            <Plus size={15} /> Add User
          </button>
        </div>

        {opSuccess && (
          <div className="mb-4 flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700">
            <CheckCircle size={14} className="shrink-0" /> {opSuccess}
            <button onClick={() => setOpSuccess('')} className="ml-auto"><X size={14} /></button>
          </div>
        )}

        {fetchError && (
          <div className="mb-4 flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-sm text-rose-700">
            <AlertCircle size={14} className="shrink-0" /> {fetchError}
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-slate-400 text-sm py-12 justify-center">
            <Loader2 size={16} className="animate-spin" /> Loading users…
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            {users.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-sm">
                <Users size={32} className="mx-auto mb-3 opacity-30" />
                No users yet. Click &ldquo;Add User&rdquo; to create the first one.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    <th className="px-5 py-3 text-left">Name</th>
                    <th className="px-5 py-3 text-left">Email</th>
                    <th className="px-5 py-3 text-left">Role</th>
                    <th className="px-5 py-3 text-left">Status</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {users.map((u) => (
                    <tr key={u._id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-5 py-3 font-medium text-slate-800">{u.name}</td>
                      <td className="px-5 py-3 text-slate-500 font-mono text-xs">{u.email}</td>
                      <td className="px-5 py-3"><RoleBadge role={u.role} /></td>
                      <td className="px-5 py-3"><StatusBadge active={u.active} /></td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => handleToggleActive(u)} title={u.active ? 'Disable user' : 'Enable user'}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                            {u.active ? <ToggleRight size={15} className="text-emerald-600" /> : <ToggleLeft size={15} />}
                          </button>
                          <button onClick={() => openEdit(u)} title="Edit user"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                            <Edit2 size={14} />
                          </button>
                          <button onClick={() => openReset(u)} title="Reset password"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                            <KeyRound size={14} />
                          </button>
                          <button onClick={() => openDelete(u)} title="Delete user"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {modal.type && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-slate-100">

            {/* Add User */}
            {modal.type === 'add' && (
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="font-bold text-slate-800 text-lg">Add User</h2>
                  <button onClick={closeModal} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
                </div>
                <FormField label="Name" value={formName} onChange={setFormName} placeholder="Full name" required />
                <FormField label="Email" value={formEmail} onChange={setFormEmail} type="email" placeholder="user@example.com" required />
                <FormField label="Password" value={formPassword} onChange={setFormPassword} type="password" placeholder="Min 8 characters" required />
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Role</label>
                  <div className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-500">
                    User <span className="text-slate-400 text-xs ml-1">(only role available — admin is set via environment)</span>
                  </div>
                </div>
                {opError && <p className="text-rose-600 text-xs flex items-center gap-1"><AlertCircle size={12} />{opError}</p>}
                <div className="flex gap-2 pt-1">
                  <button onClick={handleAdd} disabled={submitting}
                    className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                    {submitting ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                    {submitting ? 'Creating…' : 'Create User'}
                  </button>
                  <button onClick={closeModal} className="px-4 py-2 rounded-xl text-sm text-slate-600 border border-slate-200 hover:bg-slate-50">Cancel</button>
                </div>
              </div>
            )}

            {/* Edit User */}
            {modal.type === 'edit' && (
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="font-bold text-slate-800 text-lg">Edit User</h2>
                  <button onClick={closeModal} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
                </div>
                <FormField label="Name" value={formName} onChange={setFormName} placeholder="Full name" required />
                <FormField label="Email" value={formEmail} onChange={setFormEmail} type="email" placeholder="user@example.com" required />
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Role</label>
                  <div className={`w-full border border-slate-200 rounded-lg px-3 py-2 text-sm ${modal.user?.role === 'admin' ? 'bg-violet-50 text-violet-700' : 'bg-slate-50 text-slate-500'}`}>
                    {modal.user?.role === 'admin' ? 'Admin (cannot be changed here)' : 'User'}
                  </div>
                </div>
                {opError && <p className="text-rose-600 text-xs flex items-center gap-1"><AlertCircle size={12} />{opError}</p>}
                <div className="flex gap-2 pt-1">
                  <button onClick={handleEdit} disabled={submitting}
                    className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                    {submitting ? <Loader2 size={13} className="animate-spin" /> : <Edit2 size={13} />}
                    {submitting ? 'Saving…' : 'Save Changes'}
                  </button>
                  <button onClick={closeModal} className="px-4 py-2 rounded-xl text-sm text-slate-600 border border-slate-200 hover:bg-slate-50">Cancel</button>
                </div>
              </div>
            )}

            {/* Delete User */}
            {modal.type === 'delete' && modal.user && (
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-bold text-slate-800 text-lg">Delete User</h2>
                  <button onClick={closeModal} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
                </div>
                <p className="text-slate-600 text-sm mb-4">
                  Are you sure you want to delete <strong>{modal.user.name}</strong> ({modal.user.email})? This action cannot be undone.
                </p>
                {opError && <p className="text-rose-600 text-xs flex items-center gap-1 mb-3"><AlertCircle size={12} />{opError}</p>}
                <div className="flex gap-2">
                  <button onClick={handleDelete} disabled={submitting}
                    className="flex items-center gap-2 bg-rose-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-rose-700 disabled:opacity-50 transition-colors">
                    {submitting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    {submitting ? 'Deleting…' : 'Delete User'}
                  </button>
                  <button onClick={closeModal} className="px-4 py-2 rounded-xl text-sm text-slate-600 border border-slate-200 hover:bg-slate-50">Cancel</button>
                </div>
              </div>
            )}

            {/* Reset Password */}
            {modal.type === 'reset-password' && modal.user && (
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="font-bold text-slate-800 text-lg">Reset Password</h2>
                  <button onClick={closeModal} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
                </div>
                <p className="text-slate-500 text-sm">Setting new password for <strong className="text-slate-700">{modal.user.name}</strong>.</p>
                <FormField label="New Password" value={formPassword} onChange={setFormPassword} type="password" placeholder="Min 8 characters" required />
                {opError && <p className="text-rose-600 text-xs flex items-center gap-1"><AlertCircle size={12} />{opError}</p>}
                <div className="flex gap-2 pt-1">
                  <button onClick={handleResetPassword} disabled={submitting}
                    className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                    {submitting ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} />}
                    {submitting ? 'Resetting…' : 'Reset Password'}
                  </button>
                  <button onClick={closeModal} className="px-4 py-2 rounded-xl text-sm text-slate-600 border border-slate-200 hover:bg-slate-50">Cancel</button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}
    </AppShell>
  );
}
