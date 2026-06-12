'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Package,
  Megaphone,
  Settings,
  PlusCircle,
  Upload,
  Archive,
  Activity,
  LogOut,
  Search,
  MapPin,
  Inbox,
  PenLine,
  FileText,
  Layers,
  Shield,
} from 'lucide-react';

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  exact?: boolean;
}

const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: 'Overview',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Leads',
    items: [
      { href: '/leads', label: 'All Leads', icon: Users, exact: true },
      { href: '/leads/new', label: 'Add Lead', icon: PlusCircle, exact: true },
      { href: '/leads/import', label: 'Import CSV', icon: Upload, exact: true },
      { href: '/leads/reply', label: 'Reply Inbox', icon: Inbox, exact: true },
      { href: '/leads/no-reply', label: 'No Reply', icon: Archive, exact: true },
    ],
  },
  {
    label: 'Outreach',
    items: [
      { href: '/compose', label: 'Compose Email', icon: PenLine, exact: true },
      { href: '/email-templates', label: 'Email Templates', icon: FileText, exact: true },
      { href: '/bulk-email', label: 'Bulk Email Sender', icon: Layers, exact: true },
    ],
  },
  {
    label: 'Discovery',
    items: [
      { href: '/apollo', label: 'Apollo Search', icon: Search, exact: true },
      { href: '/apify', label: 'Maps Scraper', icon: MapPin, exact: true },
    ],
  },
  {
    label: 'Management',
    items: [
      { href: '/products', label: 'Products', icon: Package },
      { href: '/campaigns', label: 'Campaigns', icon: Megaphone },
    ],
  },
];

const adminNavItems: NavItem[] = [
  { href: '/settings', label: 'Settings', icon: Settings, exact: false },
  { href: '/admin/users', label: 'User Management', icon: Shield, exact: true },
];

function LogoutButton() {
  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  };
  return (
    <button
      onClick={handleLogout}
      className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-300 transition-colors"
      title="Sign out"
    >
      <LogOut size={13} />
      Sign out
    </button>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const [role, setRole] = useState<'admin' | 'user' | null>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((data) => {
        setRole(data.authenticated ? (data.user?.role ?? 'user') : null);
      })
      .catch(() => setRole(null));
  }, []);

  const isActive = (item: NavItem) =>
    item.exact
      ? pathname === item.href
      : pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));

  const renderItems = (items: NavItem[], activeColor = 'bg-emerald-600') =>
    items.map((item) => {
      const active = isActive(item);
      return (
        <Link
          key={item.href}
          href={item.href}
          className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            active
              ? `${activeColor} text-white`
              : 'text-slate-400 hover:bg-slate-800 hover:text-white'
          }`}
        >
          <item.icon size={16} className={active ? 'text-white' : 'text-slate-500'} />
          {item.label}
        </Link>
      );
    });

  return (
    <aside className="w-64 min-h-screen bg-slate-900 text-white flex flex-col shrink-0">
      {/* Brand */}
      <div className="px-6 py-5 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center shrink-0">
            <Activity size={16} className="text-white" />
          </div>
          <span className="font-semibold text-base tracking-tight text-white">PharmaLeads</span>
        </div>
        <p className="text-xs text-slate-500 mt-1.5 ml-0.5">Lead Management Platform</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-5">
        {navGroups.map((group) => (
          <div key={group.label}>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest px-3 mb-1.5">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {renderItems(group.items)}
            </div>
          </div>
        ))}

        {/* Admin section — only shown to admin users */}
        {role === 'admin' && (
          <div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest px-3 mb-1.5">
              Admin
            </p>
            <div className="space-y-0.5">
              {renderItems(adminNavItems, 'bg-violet-600')}
            </div>
          </div>
        )}

      </nav>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-between">
        <p className="text-xs text-slate-600">PharmaLeads</p>
        <LogoutButton />
      </div>
    </aside>
  );
}
