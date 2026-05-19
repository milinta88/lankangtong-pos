import React from 'react';
import { AlertTriangle, Check, QrCode, RefreshCw, Save, Search, Settings, SlidersHorizontal } from 'lucide-react';
import { getAdminMenus, getCachedAdminMenusResponse, updateMenuBasic } from '../services/api.js';
import { navigateTo } from '../App.jsx';
import AppShell from '../components/AppShell.jsx';
import Button from '../components/Button.jsx';
import Input from '../components/Input.jsx';
import StatCard from '../components/StatCard.jsx';
import StatusBadge from '../components/StatusBadge.jsx';

const editableFields = [
  'price',
  'is_available',
  'is_recommended',
  'track_stock',
  'stock_mode',
  'stock_qty',
  'low_stock_level',
];

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizeMenu(menu) {
  return {
    menu_id: menu.menu_id || '',
    category_id: menu.category_id || '',
    name_th: menu.name_th || '',
    price: toNumber(menu.price),
    image_url: menu.image_url || '',
    is_available: Boolean(menu.is_available),
    is_recommended: Boolean(menu.is_recommended),
    track_stock: Boolean(menu.track_stock),
    stock_mode: menu.stock_mode || 'NONE',
    stock_qty: toNumber(menu.stock_qty),
    low_stock_level: toNumber(menu.low_stock_level),
    sort_order: toNumber(menu.sort_order),
  };
}

function formatMoney(value) {
  return new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(toNumber(value));
}

function getMenuPatch(original, draft) {
  const patch = {};

  editableFields.forEach((field) => {
    if (draft[field] !== original[field]) {
      patch[field] = draft[field];
    }
  });

  return patch;
}

function isDirty(original, draft) {
  return Object.keys(getMenuPatch(original, draft)).length > 0;
}

function MenuImage({ menu }) {
  const [failed, setFailed] = React.useState(false);
  const imageUrl = typeof menu.image_url === 'string' ? menu.image_url.trim() : '';
  const shouldShowImage = imageUrl.startsWith('https://') && !failed;

  React.useEffect(() => {
    setFailed(false);
  }, [imageUrl]);

  return (
    <div className="h-14 w-14 overflow-hidden rounded-2xl bg-[#efe5da] shadow-sm ring-1 ring-[#eadbc9]">
      {shouldShowImage ? (
        <img
          src={imageUrl}
          alt={menu.name_th}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#efe5da] to-[#fff7ef] text-xs font-black text-[#a78b73]">
          POS
        </div>
      )}
    </div>
  );
}

function ToggleCell({ checked, label, onChange }) {
  return (
    <label className="inline-flex items-center gap-2 rounded-full bg-[#fffaf3] px-2.5 py-1.5 text-sm font-bold text-stone-700 ring-1 ring-[#eadbc9]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5 rounded border-stone-300 text-[#6f4e37] focus:ring-[#6f4e37]"
      />
      {label}
    </label>
  );
}

export default function Admin() {
  const cachedAdminMenus = React.useMemo(() => getCachedAdminMenusResponse(), []);
  const cachedNormalizedMenus = React.useMemo(
    () => (cachedAdminMenus?.success ? (cachedAdminMenus.menus || []).map(normalizeMenu) : []),
    [cachedAdminMenus],
  );
  const [menus, setMenus] = React.useState(() => cachedNormalizedMenus);
  const [originalMenus, setOriginalMenus] = React.useState(() => {
    const originals = {};
    cachedNormalizedMenus.forEach((menu) => {
      originals[menu.menu_id] = { ...menu };
    });
    return originals;
  });
  const [search, setSearch] = React.useState('');
  const [activeCategory, setActiveCategory] = React.useState('ALL');
  const [savingRows, setSavingRows] = React.useState({});
  const [rowMessages, setRowMessages] = React.useState({});
  const [error, setError] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(() => !cachedAdminMenus?.success);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const hasLoadedMenusRef = React.useRef(Boolean(cachedAdminMenus?.success));
  const isMountedRef = React.useRef(false);
  const adminMenusRequestIdRef = React.useRef(0);

  React.useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadMenus = React.useCallback(async ({ force = false, clearMessages = true } = {}) => {
    const requestId = adminMenusRequestIdRef.current + 1;
    adminMenusRequestIdRef.current = requestId;
    const showFullLoading = !hasLoadedMenusRef.current;

    if (showFullLoading) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }
    setError('');
    if (clearMessages) {
      setRowMessages({});
    }

    try {
      const result = await getAdminMenus({ force });

      if (!result.success) {
        throw new Error(result.message || 'GET_ADMIN_MENUS failed');
      }

      if (!isMountedRef.current || adminMenusRequestIdRef.current !== requestId) {
        return;
      }

      const nextMenus = (result.menus || []).map(normalizeMenu);
      const nextOriginals = {};

      nextMenus.forEach((menu) => {
        nextOriginals[menu.menu_id] = { ...menu };
      });

      setMenus(nextMenus);
      setOriginalMenus(nextOriginals);
      hasLoadedMenusRef.current = true;
    } catch (loadError) {
      if (isMountedRef.current && adminMenusRequestIdRef.current === requestId) {
        setError(loadError.message || 'Cannot load admin menus');
      }
    } finally {
      if (isMountedRef.current && adminMenusRequestIdRef.current === requestId) {
        if (showFullLoading) {
          setIsLoading(false);
        } else {
          setIsRefreshing(false);
        }
      }
    }
  }, []);

  React.useEffect(() => {
    loadMenus();
  }, [loadMenus]);

  const categories = React.useMemo(() => {
    return Array.from(new Set(menus.map((menu) => menu.category_id).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b),
    );
  }, [menus]);

  React.useEffect(() => {
    if (activeCategory !== 'ALL' && !categories.includes(activeCategory)) {
      setActiveCategory('ALL');
    }
  }, [activeCategory, categories]);

  const filteredMenus = React.useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return menus.filter((menu) => {
      const matchesSearch =
        !keyword ||
        menu.menu_id.toLowerCase().includes(keyword) ||
        menu.name_th.toLowerCase().includes(keyword) ||
        menu.category_id.toLowerCase().includes(keyword);
      const matchesCategory = activeCategory === 'ALL' || menu.category_id === activeCategory;

      return matchesSearch && matchesCategory;
    });
  }, [activeCategory, menus, search]);

  function updateDraft(menuId, field, value) {
    setMenus((current) =>
      current.map((menu) => (menu.menu_id === menuId ? { ...menu, [field]: value } : menu)),
    );
    setRowMessages((current) => ({ ...current, [menuId]: '' }));
  }

  async function saveMenu(menu) {
    const original = originalMenus[menu.menu_id];

    if (!original) return;

    const patch = getMenuPatch(original, menu);

    if (!Object.keys(patch).length) {
      return;
    }

    setSavingRows((current) => ({ ...current, [menu.menu_id]: true }));
    setRowMessages((current) => ({ ...current, [menu.menu_id]: '' }));

    try {
      const result = await updateMenuBasic(menu.menu_id, patch);

      if (!result.success) {
        throw new Error(result.message || 'UPDATE_MENU_BASIC failed');
      }

      if (!isMountedRef.current) {
        return;
      }

      const updatedMenu = normalizeMenu(result.menu || menu);

      setMenus((current) => current.map((item) => (item.menu_id === updatedMenu.menu_id ? updatedMenu : item)));
      setOriginalMenus((current) => ({ ...current, [updatedMenu.menu_id]: { ...updatedMenu } }));
      setRowMessages((current) => ({ ...current, [updatedMenu.menu_id]: 'Saved' }));
      await loadMenus({ force: true, clearMessages: false });
    } catch (saveError) {
      if (isMountedRef.current) {
        setRowMessages((current) => ({
          ...current,
          [menu.menu_id]: saveError.message || 'Cannot save menu',
        }));
      }
    } finally {
      if (isMountedRef.current) {
        setSavingRows((current) => ({ ...current, [menu.menu_id]: false }));
      }
    }
  }

  return (
    <AppShell
      title="Admin"
      subtitle="จัดการเมนู ราคา และสต็อกพื้นฐาน"
      actions={
        <>
          <Button onClick={() => navigateTo('/table-qr')} variant="ghost">
            <QrCode size={18} />
            QR โต๊ะ
          </Button>
          <Button onClick={() => loadMenus({ force: true })} disabled={isLoading || isRefreshing}>
            <RefreshCw size={18} className={isLoading || isRefreshing ? 'animate-spin' : ''} />
            Refresh
          </Button>
        </>
      }
    >
        {error ? (
          <div className="mb-4 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700 shadow-sm">
            <AlertTriangle className="mt-0.5 shrink-0" size={18} />
            <span>{error}</span>
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-3">
          <StatCard icon={Settings} label="เมนูทั้งหมด" value={menus.length} tone="coffee" />
          <StatCard icon={Check} label="เปิดขาย" value={menus.filter((menu) => menu.is_available).length} tone="success" />
          <StatCard icon={SlidersHorizontal} label="DIRECT stock" value={menus.filter((menu) => menu.stock_mode === 'DIRECT').length} tone="warning" />
        </section>

        <section className="mt-5 rounded-[30px] border border-[#eadbc9] bg-white/85 p-4 shadow-2xl shadow-stone-900/5 backdrop-blur">
          <div className="flex flex-col gap-4 rounded-[24px] border border-[#eadbc9] bg-[#fffaf3] p-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-black">Menu settings</h2>
              <p className="text-sm font-semibold text-stone-500">แก้ไขเฉพาะราคา สถานะขาย และสต็อกพื้นฐาน</p>
              {isRefreshing ? (
                <p className="mt-1 text-xs font-bold text-stone-500">ข้อมูลล่าสุด กำลังอัปเดต...</p>
              ) : null}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:items-center">
              <select
                value={activeCategory}
                onChange={(event) => setActiveCategory(event.target.value)}
                className="h-11 rounded-2xl border border-[#eadbc9] bg-white px-3 text-sm font-bold outline-none ring-[#6f4e37] focus:ring-2"
                aria-label="Filter by category"
              >
                <option value="ALL">ทุกหมวดหมู่</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
              <div className="relative w-full sm:w-[320px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search menu"
                  className="w-full rounded-2xl border-[#eadbc9] pl-10"
                />
              </div>
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-[24px] border border-[#eadbc9] bg-white shadow-sm">
            <div className="max-h-[calc(100vh-290px)] overflow-auto">
              <table className="w-full min-w-[1180px] text-left text-sm">
                <thead className="sticky top-0 z-10 bg-[#f6efe7] text-xs uppercase text-[#7a5b43]">
                  <tr>
                    <th className="px-4 py-3">เมนู</th>
                    <th className="px-4 py-3 text-right">ราคา</th>
                    <th className="px-4 py-3">สถานะ</th>
                    <th className="px-4 py-3">แนะนำ</th>
                    <th className="px-4 py-3">ตัดสต็อก</th>
                    <th className="px-4 py-3">Stock mode</th>
                    <th className="px-4 py-3 text-right">คงเหลือ</th>
                    <th className="px-4 py-3 text-right">จุดเตือน</th>
                    <th className="px-4 py-3">Save</th>
                  </tr>
                </thead>
                <tbody>
                  {!isLoading &&
                    filteredMenus.map((menu) => {
                      const original = originalMenus[menu.menu_id] || menu;
                      const dirty = isDirty(original, menu);
                      const isSaving = Boolean(savingRows[menu.menu_id]);
                      const rowMessage = rowMessages[menu.menu_id];

                      return (
                        <tr key={menu.menu_id} className={`border-t border-[#eadbc9] align-top transition ${dirty ? 'bg-amber-50/60' : 'hover:bg-[#fffaf3]'}`}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <MenuImage menu={menu} />
                              <div className="min-w-0">
                                <p className="font-black text-stone-950">{menu.name_th || menu.menu_id}</p>
                                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-stone-500">
                                  <span>{menu.menu_id}</span>
                                  {menu.category_id ? <span>{menu.category_id}</span> : null}
                                  <span className="font-black text-[#4b3020]">฿{formatMoney(menu.price)}</span>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Input
                              type="number"
                              min="0"
                              value={menu.price}
                              onChange={(event) => updateDraft(menu.menu_id, 'price', toNumber(event.target.value))}
                              className="h-10 w-24 rounded-xl border-[#eadbc9] text-right font-black"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <ToggleCell
                              checked={menu.is_available}
                              label={menu.is_available ? 'เปิดขาย' : 'ปิด'}
                              onChange={(value) => updateDraft(menu.menu_id, 'is_available', value)}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <ToggleCell
                              checked={menu.is_recommended}
                              label="แนะนำ"
                              onChange={(value) => updateDraft(menu.menu_id, 'is_recommended', value)}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <ToggleCell
                              checked={menu.track_stock}
                              label="Track"
                              onChange={(value) => updateDraft(menu.menu_id, 'track_stock', value)}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <select
                              value={menu.stock_mode}
                              onChange={(event) => updateDraft(menu.menu_id, 'stock_mode', event.target.value)}
                              className="h-10 rounded-xl border border-[#eadbc9] bg-white px-2 text-sm font-bold outline-none ring-[#6f4e37] focus:ring-2"
                            >
                              <option value="NONE">NONE</option>
                              <option value="DIRECT">DIRECT</option>
                              <option value="RECIPE">RECIPE</option>
                            </select>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Input
                              type="number"
                              value={menu.stock_qty}
                              onChange={(event) => updateDraft(menu.menu_id, 'stock_qty', toNumber(event.target.value))}
                              className="h-10 w-24 rounded-xl border-[#eadbc9] text-right font-black"
                            />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Input
                              type="number"
                              min="0"
                              value={menu.low_stock_level}
                              onChange={(event) => updateDraft(menu.menu_id, 'low_stock_level', toNumber(event.target.value))}
                              className="h-10 w-24 rounded-xl border-[#eadbc9] text-right font-black"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-2">
                              <button
                                type="button"
                                onClick={() => saveMenu(menu)}
                                disabled={!dirty || isSaving}
                                className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-[#0f0b08] px-3 text-sm font-black text-white shadow-sm transition hover:bg-[#5b3f2d] disabled:cursor-not-allowed disabled:bg-stone-300 disabled:shadow-none"
                              >
                                <Save size={16} />
                                {isSaving ? 'Saving' : 'Save'}
                              </button>
                              {rowMessage ? (
                                <span className={`rounded-full px-2 py-1 text-xs font-bold ${rowMessage === 'Saved' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                                  {rowMessage}
                                </span>
                              ) : dirty ? (
                                <StatusBadge tone="warning">Unsaved</StatusBadge>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>

            {isLoading ? (
              <div className="grid gap-3 p-4">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="h-14 animate-pulse rounded-2xl bg-stone-100" />
                ))}
              </div>
            ) : null}

            {!isLoading && !filteredMenus.length ? (
              <div className="flex h-48 items-center justify-center bg-[#fffaf3] text-sm font-semibold text-stone-400">
                ไม่พบเมนู
              </div>
            ) : null}
          </div>
        </section>
    </AppShell>
  );
}
