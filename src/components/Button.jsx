const variants = {
  primary: 'bg-[#6f4e37] text-white shadow-sm hover:bg-[#5b3f2d]',
  dark: 'bg-stone-950 text-white shadow-sm hover:bg-stone-800',
  success: 'bg-emerald-700 text-white shadow-sm hover:bg-emerald-800',
  subtle: 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-50',
  ghost: 'bg-stone-100 text-stone-700 hover:bg-stone-200',
  danger: 'bg-rose-600 text-white shadow-sm hover:bg-rose-700',
};

export default function Button({
  children,
  type = 'button',
  variant = 'subtle',
  size = 'md',
  className = '',
  ...props
}) {
  const sizeClass = size === 'lg' ? 'h-12 px-5 text-sm' : size === 'icon' ? 'h-11 w-11 p-0' : 'h-10 px-3 text-sm';

  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-black transition disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-white ${sizeClass} ${variants[variant] || variants.subtle} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
