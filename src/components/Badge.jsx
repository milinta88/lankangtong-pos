const toneClasses = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  danger: 'border-rose-200 bg-rose-50 text-rose-700',
  coffee: 'border-[#d9c2aa] bg-[#f6efe7] text-[#6f4e37]',
  neutral: 'border-stone-200 bg-white text-stone-600',
};

export default function Badge({ children, tone = 'neutral', className = '' }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold ${toneClasses[tone] || toneClasses.neutral} ${className}`}>
      {children}
    </span>
  );
}
