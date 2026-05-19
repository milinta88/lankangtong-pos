const tones = {
  neutral: 'border-[#eadbc9] bg-white text-stone-950',
  coffee: 'border-[#dbc6af] bg-[#fffaf3] text-[#4b3020]',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-950',
  warning: 'border-amber-200 bg-amber-50 text-amber-950',
  danger: 'border-rose-200 bg-rose-50 text-rose-950',
};

export default function StatCard({ icon: Icon, label, value, hint, tone = 'neutral', prefix = '', className = '' }) {
  return (
    <div className={`overflow-hidden rounded-[24px] border p-4 shadow-xl shadow-stone-900/5 ${tones[tone] || tones.neutral} ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-stone-500">{label}</p>
          <p className="mt-2 text-3xl font-black tracking-normal">
            {prefix}
            {value}
          </p>
        </div>
        {Icon ? (
          <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/85 text-stone-700 shadow-sm ring-1 ring-black/5">
            <Icon size={20} />
          </span>
        ) : null}
      </div>
      {hint ? <p className="mt-3 text-xs font-semibold text-stone-500">{hint}</p> : null}
    </div>
  );
}
