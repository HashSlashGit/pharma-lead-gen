export default function ScoreBadge({ score }: { score: number }) {
  let style = 'bg-slate-50 text-slate-500 ring-1 ring-slate-200';
  if (score >= 70) style = 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200';
  else if (score >= 40) style = 'bg-amber-50 text-amber-700 ring-1 ring-amber-200';
  else style = 'bg-rose-50 text-rose-500 ring-1 ring-rose-200';

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums ${style}`}>
      {score}
    </span>
  );
}
