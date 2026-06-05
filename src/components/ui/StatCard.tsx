import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  color?: 'emerald' | 'blue' | 'amber' | 'rose' | 'violet' | 'slate';
  subtitle?: string;
}

const colorMap: Record<string, string> = {
  emerald: 'bg-emerald-50 text-emerald-600',
  blue:    'bg-blue-50 text-blue-600',
  amber:   'bg-amber-50 text-amber-600',
  rose:    'bg-rose-50 text-rose-500',
  violet:  'bg-violet-50 text-violet-600',
  slate:   'bg-slate-100 text-slate-500',
};

export default function StatCard({ title, value, icon: Icon, color = 'slate', subtitle }: StatCardProps) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${colorMap[color]}`}>
          <Icon size={20} />
        </div>
      </div>
      <div className="text-3xl font-bold text-slate-800 tracking-tight leading-none mb-1.5">
        {value}
      </div>
      <p className="text-sm font-medium text-slate-500">{title}</p>
      {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
    </div>
  );
}
