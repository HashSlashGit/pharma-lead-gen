import { LeadStatus } from '@/types';

const statusStyles: Record<string, string> = {
  qualified:         'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  warm:              'bg-orange-50 text-orange-700 ring-1 ring-orange-200',
  contacted:         'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  needs_review:      'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  new:               'bg-slate-50 text-slate-600 ring-1 ring-slate-200',
  low_priority:      'bg-slate-50 text-slate-400 ring-1 ring-slate-200',
  cold:              'bg-sky-50 text-sky-600 ring-1 ring-sky-200',
  rejected:          'bg-rose-50 text-rose-600 ring-1 ring-rose-200',
  no_response:       'bg-slate-100 text-slate-500 ring-1 ring-slate-200',
  do_not_contact:    'bg-rose-50 text-rose-500 ring-1 ring-rose-200',
  pending:           'bg-slate-50 text-slate-500 ring-1 ring-slate-200',
  ready_to_send_test:'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  failed:            'bg-rose-50 text-rose-600 ring-1 ring-rose-200',
  opened:            'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  clicked:           'bg-violet-50 text-violet-700 ring-1 ring-violet-200',
  sent:              'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  draft:             'bg-slate-50 text-slate-500 ring-1 ring-slate-200',
  active:            'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  paused:            'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  completed:         'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
};

const statusLabels: Record<string, string> = {
  needs_review:   'Needs Review',
  low_priority:   'Low Priority',
  no_response:    'No Response',
  do_not_contact: 'Do Not Contact',
  ready_to_send_test: 'Test Ready',
};

export default function StatusBadge({ status }: { status: LeadStatus | string }) {
  const label = statusLabels[status] ?? status.replace(/_/g, ' ');
  const style = statusStyles[status] ?? 'bg-slate-50 text-slate-500 ring-1 ring-slate-200';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize whitespace-nowrap ${style}`}>
      {label}
    </span>
  );
}
