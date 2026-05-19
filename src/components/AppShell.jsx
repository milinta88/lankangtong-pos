import { BarChart3, Boxes, Coffee, LayoutGrid, Settings } from 'lucide-react';
import NavLink from './NavLink.jsx';
import { getCurrentRoutePath } from '../services/router.js';

const navItems = [
  { href: '/pos', label: 'POS', icon: Coffee },
  { href: '/tables', label: 'โต๊ะ', icon: LayoutGrid },
  { href: '/stock', label: 'Stock', icon: Boxes },
  { href: '/report', label: 'Report', icon: BarChart3 },
  { href: '/admin', label: 'Admin', icon: Settings },
];

function isActiveRoute(href) {
  const path = getCurrentRoutePath();

  if (href === '/pos') {
    return path === '/' || path === '/pos';
  }

  return path.startsWith(href);
}

export default function AppShell({ title, subtitle, actions, children, contentClassName = '' }) {
  return (
    <main className="min-h-screen bg-[#f5efe6] text-stone-950 lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="hidden border-r border-[#e5d7c7] bg-white/90 px-4 py-5 shadow-sm lg:block">
        <div className="rounded-2xl bg-[#f6efe7] p-4 ring-1 ring-[#ead9c7]">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#8a6a4f]">Langangtong</p>
          <h1 className="mt-1 text-2xl font-black text-[#3f2a1d]">ล้านก๋างโต้ง</h1>
          <p className="mt-1 text-sm font-semibold text-stone-500">Cafe POS</p>
        </div>
        <nav className="mt-5 grid gap-2">
          {navItems.map((item) => (
            <NavLink key={item.href} {...item} active={isActiveRoute(item.href)} />
          ))}
        </nav>
      </aside>

      <section className="min-w-0">
        <div className="border-b border-[#e5d7c7] bg-white/85 backdrop-blur">
          <div className="mx-auto flex max-w-[1680px] flex-col gap-4 px-4 py-4 md:px-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#8a6a4f] lg:hidden">ล้านก๋างโต้ง</p>
                <h2 className="text-2xl font-black text-stone-950">{title}</h2>
                {subtitle ? <p className="mt-1 text-sm font-semibold text-stone-500">{subtitle}</p> : null}
              </div>
              {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
            </div>

            <nav className="flex gap-2 overflow-x-auto pb-1 lg:hidden">
              {navItems.map((item) => (
                <NavLink key={item.href} {...item} active={isActiveRoute(item.href)} />
              ))}
            </nav>
          </div>
        </div>

        <div className={`mx-auto max-w-[1680px] px-4 py-5 md:px-6 ${contentClassName}`}>
          {children}
        </div>
      </section>
    </main>
  );
}
