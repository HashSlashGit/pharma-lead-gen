'use client';

const PHARMA_PRESETS: { label: string; value: string }[] = [
  { label: 'Pharmacy', value: 'pharmacy' },
  { label: 'Pharmaceutical Distributor', value: 'pharmaceutical distributor' },
  { label: 'Pharmaceutical Manufacturer', value: 'pharmaceutical manufacturer' },
  { label: 'Medical Supplier', value: 'medical supplier' },
  { label: 'Hospital', value: 'hospital' },
  { label: 'Clinic', value: 'clinic' },
  { label: 'Laboratory', value: 'laboratory' },
  { label: 'Healthcare Distributor', value: 'healthcare distributor' },
  { label: 'Medical Equipment Supplier', value: 'medical equipment supplier' },
];

interface KeywordSelectorProps {
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

export default function KeywordSelector({ value, onChange, required, onKeyDown }: KeywordSelectorProps) {
  return (
    <div className="space-y-1.5">
      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1">
          Preset{required && <span className="text-rose-500 ml-0.5">*</span>}
        </label>
        <select
          value={PHARMA_PRESETS.find((p) => p.value === value)?.value ?? ''}
          onChange={(e) => { if (e.target.value) onChange(e.target.value); }}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-700"
        >
          <option value="">— Choose a preset —</option>
          {PHARMA_PRESETS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1">
          Keyword{required && <span className="text-rose-500 ml-0.5">*</span>}
        </label>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Or type a custom keyword…"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>
    </div>
  );
}
