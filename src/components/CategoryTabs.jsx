export default function CategoryTabs({ categories, activeCategory, onChange }) {
  const baseClass =
    'h-11 shrink-0 rounded-full px-5 text-sm font-black transition active:scale-[0.98]';

  function tabClass(isActive) {
    return `${baseClass} ${
      isActive
        ? 'bg-[#4b3020] text-white shadow-md shadow-[#4b3020]/20'
        : 'bg-white text-stone-700 ring-1 ring-[#eadbc9] hover:bg-[#f7efe6] hover:text-[#4b3020]'
    }`;
  }

  return (
    <div className="flex gap-2 overflow-x-auto rounded-[22px] border border-[#eadbc9] bg-[#fffaf5] p-2 shadow-inner shadow-stone-900/5">
      <button
        type="button"
        onClick={() => onChange('ALL')}
        className={tabClass(activeCategory === 'ALL')}
      >
        ทั้งหมด
      </button>
      {categories.map((category) => (
        <button
          key={category.category_id}
          type="button"
          onClick={() => onChange(category.category_id)}
          className={tabClass(activeCategory === category.category_id)}
        >
          {category.category_name}
        </button>
      ))}
    </div>
  );
}
