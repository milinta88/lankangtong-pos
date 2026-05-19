import React from 'react';

const Input = React.forwardRef(function Input(
  { className = '', as = 'input', ...props },
  ref,
) {
  const Component = as;

  return (
    <Component
      ref={ref}
      className={`rounded-lg border border-stone-200 bg-white px-3 text-sm font-semibold text-stone-900 outline-none ring-[#6f4e37] transition placeholder:text-stone-400 focus:ring-2 ${Component === 'textarea' ? 'py-2' : 'h-11'} ${className}`}
      {...props}
    />
  );
});

export default Input;
