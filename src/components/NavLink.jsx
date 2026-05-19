import { navigateTo, routeHref } from '../services/router.js';

export default function NavLink({ href, label, icon: Icon, active }) {
  function handleClick(event) {
    event.preventDefault();
    navigateTo(href);
  }

  return (
    <a
      href={routeHref(href)}
      onClick={handleClick}
      className={`inline-flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-black transition ${
        active
          ? 'bg-[#6f4e37] text-white shadow-sm'
          : 'text-stone-600 hover:bg-[#f6efe7] hover:text-[#5b3f2d]'
      }`}
    >
      {Icon ? <Icon size={18} /> : null}
      <span>{label}</span>
    </a>
  );
}
