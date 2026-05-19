import React from 'react';
import { AlertTriangle, Boxes, CircleAlert, CircleCheck, Package, RefreshCw, Search, XCircle } from 'lucide-react';
import { getCachedStockResponse, getStock } from '../services/api.js';
import AppShell from '../components/AppShell.jsx';
import Button from '../components/Button.jsx';
import Input from '../components/Input.jsx';
import StatCard from '../components/StatCard.jsx';
import StatusBadge from '../components/StatusBadge.jsx';

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatNumber(value) {
  return new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(toNumber(value));
}

function formatMoney(value) {
  return new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(toNumber(value));
}

function hasCost(value) {
  return value !== null && value !== undefined && value !== '' && toNumber(value) > 0;
}

function getStockStatus(item) {
  const stockQty = toNumber(item.stock_qty);
  const lowStockLevel = toNumber(item.low_stock_level);

  if (stockQty <= 0) {
    return { label: 'หมด', tone: 'danger', icon: XCircle };
  }

  if (stockQty <= lowStockLevel) {
    return { label: 'ใกล้หมด', tone: 'warning', icon: CircleAlert };
  }

  return { label: 'ปกติ', tone: 'success', icon: CircleCheck };
}

function normalizeDirectMenu(item) {
  return {
    menu_id: item.menu_id || item.target_id || '',
    menu_name: item.menu_name || item.item_name || 'ไม่ระบุชื่อสินค้า',
    category_name: item.category_name || '',
    stock_qty: toNumber(item.stock_qty),
    low_stock_level: toNumber(item.low_stock_level),
    stock_mode: item.stock_mode || 'DIRECT',
    cost: item.cost,
  };
}

function getMenuKey(item) {
  return item.menu_id || item.target_id || item.menu_name;
}

function StockStatusBadge({ item }) {
  const status = getStockStatus(item);
  return <StatusBadge tone={status.tone}>{status.label}</StatusBadge>;
}

function ProductCell({ item }) {
  return (
    <div className="min-w-0">
      <p className="font-black text-stone-950">{item.menu_name}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-stone-500">
        {item.menu_id ? <span>{item.menu_id}</span> : null}
        {item.category_name ? <span>{item.category_name}</span> : null}
        {hasCost(item.cost) ? <span>ต้นทุน ฿{formatMoney(item.cost)}</span> : null}
      </div>
    </div>
  );
}

export default function Stock() {
  const cachedStock = React.useMemo(() => getCachedStockResponse(), []);
  const [summary, setSummary] = React.useState(() => ({
    ingredients: [],
    directStockMenus: [],
    lowStockItems: [],
    ...(cachedStock?.success
      ? {
          ingredients: cachedStock.ingredients || [],
          directStockMenus: cachedStock.directStockMenus || [],
          lowStockItems: cachedStock.lowStockItems || [],
        }
      : {}),
  }));
  const [search, setSearch] = React.useState('');
  const [activeCategory, setActiveCategory] = React.useState('ALL');
  const [error, setError] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(() => !cachedStock?.success);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const hasLoadedStockRef = React.useRef(Boolean(cachedStock?.success));
  const isMountedRef = React.useRef(false);
  const stockRequestIdRef = React.useRef(0);
  const didInitialLoadRef = React.useRef(false);

  React.useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadStock = React.useCallback(async ({ force = true } = {}) => {
    const requestId = stockRequestIdRef.current + 1;
    stockRequestIdRef.current = requestId;
    const showFullLoading = !hasLoadedStockRef.current;

    if (showFullLoading) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }
    setError('');

    try {
      const result = await getStock({ force });
      if (!result.success) throw new Error(result.message || 'GET_STOCK failed');

      if (!isMountedRef.current || stockRequestIdRef.current !== requestId) {
        return;
      }

      setSummary({
        ingredients: result.ingredients || [],
        directStockMenus: result.directStockMenus || [],
        lowStockItems: result.lowStockItems || [],
      });
      hasLoadedStockRef.current = true;
    } catch (loadError) {
      if (isMountedRef.current && stockRequestIdRef.current === requestId) {
        setError(loadError.message || 'Cannot load stock');
      }
    } finally {
      if (isMountedRef.current && stockRequestIdRef.current === requestId) {
        if (showFullLoading) {
          setIsLoading(false);
        } else {
          setIsRefreshing(false);
        }
      }
    }
  }, []);

  React.useEffect(() => {
    if (didInitialLoadRef.current) {
      return;
    }

    didInitialLoadRef.current = true;
    loadStock();
  }, [loadStock]);

  const directStockMenus = React.useMemo(
    () => (summary.directStockMenus || []).map(normalizeDirectMenu),
    [summary.directStockMenus],
  );

  const directMenuById = React.useMemo(() => {
    const map = new Map();
    directStockMenus.forEach((item) => {
      if (item.menu_id) map.set(item.menu_id, item);
    });
    return map;
  }, [directStockMenus]);

  const lowStockItems = React.useMemo(() => {
    const apiLowItems = summary.lowStockItems || [];
    const directLowItems = directStockMenus.filter((item) => toNumber(item.stock_qty) <= toNumber(item.low_stock_level));

    if (!apiLowItems.length) return directLowItems;

    const normalizedApiItems = apiLowItems
      .map((item) => {
        const menuId = item.menu_id || item.target_id || '';
        const directItem = directMenuById.get(menuId);

        return normalizeDirectMenu({
          ...directItem,
          ...item,
          menu_id: menuId || directItem?.menu_id,
          menu_name: item.menu_name || item.item_name || directItem?.menu_name,
          stock_mode: item.stock_mode || directItem?.stock_mode || 'DIRECT',
        });
      })
      .filter((item) => (item.menu_id ? directMenuById.has(item.menu_id) : item.stock_mode === 'DIRECT'));

    return normalizedApiItems.length ? normalizedApiItems : directLowItems;
  }, [directMenuById, directStockMenus, summary.lowStockItems]);

  const categories = React.useMemo(() => {
    return Array.from(new Set(directStockMenus.map((item) => item.category_name).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b, 'th'),
    );
  }, [directStockMenus]);

  React.useEffect(() => {
    if (activeCategory !== 'ALL' && !categories.includes(activeCategory)) {
      setActiveCategory('ALL');
    }
  }, [activeCategory, categories]);

  const filteredMenus = React.useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return directStockMenus.filter((item) => {
      const matchesSearch =
        !keyword ||
        item.menu_name.toLowerCase().includes(keyword) ||
        item.menu_id.toLowerCase().includes(keyword) ||
        item.category_name.toLowerCase().includes(keyword);
      const matchesCategory = activeCategory === 'ALL' || item.category_name === activeCategory;

      return matchesSearch && matchesCategory;
    });
  }, [activeCategory, directStockMenus, search]);

  const outOfStockCount = directStockMenus.filter((item) => toNumber(item.stock_qty) <= 0).length;

  return (
    <AppShell
      title="Stock"
      subtitle="รายการสินค้าคงเหลือ"
      actions={
        <Button onClick={() => loadStock({ force: true })} disabled={isLoading || isRefreshing}>
          <RefreshCw size={18} className={isLoading || isRefreshing ? 'animate-spin' : ''} />
          Refresh
        </Button>
      }
    >
      {error ? (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700 shadow-sm">
          <AlertTriangle className="mt-0.5 shrink-0" size={18} />
          <span>{error}</span>
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard icon={Boxes} label="จำนวนรายการ stock ทั้งหมด" value={formatNumber(directStockMenus.length)} tone="coffee" />
        <StatCard icon={CircleAlert} label="จำนวนรายการใกล้หมด" value={formatNumber(lowStockItems.length)} tone="warning" />
        <StatCard icon={XCircle} label="จำนวนของหมดแล้ว" value={formatNumber(outOfStockCount)} tone="danger" />
      </section>

      {lowStockItems.length ? (
        <section className="mt-5 rounded-[30px] border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4 shadow-xl shadow-stone-900/5">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-amber-700 shadow-sm ring-1 ring-amber-200">
              <CircleAlert size={20} />
            </span>
            <div>
              <h2 className="text-lg font-black text-amber-950">รายการใกล้หมด</h2>
              <p className="text-sm font-semibold text-amber-800/75">ตรวจเช็คสินค้า DIRECT stock ก่อนขายต่อ</p>
            </div>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {lowStockItems.map((item) => {
              const status = getStockStatus(item);
              const Icon = status.icon;

              return (
                <div key={`low-${getMenuKey(item)}`} className="rounded-[24px] bg-white p-4 shadow-sm shadow-stone-900/5 ring-1 ring-amber-200">
                  <div className="flex items-start justify-between gap-3">
                    <ProductCell item={item} />
                    <Icon className={status.tone === 'danger' ? 'text-rose-600' : 'text-amber-600'} size={22} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-2xl bg-[#fffaf3] p-3">
                      <p className="text-xs font-bold text-stone-500">คงเหลือ</p>
                      <p className="text-xl font-black">{formatNumber(item.stock_qty)}</p>
                    </div>
                    <div className="rounded-2xl bg-[#fffaf3] p-3">
                      <p className="text-xs font-bold text-stone-500">จุดเตือน</p>
                      <p className="text-xl font-black">{formatNumber(item.low_stock_level)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="mt-5 rounded-[30px] border border-[#eadbc9] bg-white/85 p-4 shadow-2xl shadow-stone-900/5 backdrop-blur">
        <div className="flex flex-col gap-4 rounded-[24px] border border-[#eadbc9] bg-[#fffaf3] p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-black text-stone-950">DIRECT stock</h2>
            <p className="text-sm font-semibold text-stone-500">เบียร์ เหล้า น้ำขวด โซดา เครื่องดื่มกระป๋อง และสินค้าแพ็กสำเร็จรูป</p>
            {isRefreshing ? (
              <p className="mt-1 text-xs font-bold text-stone-500">ข้อมูลล่าสุด กำลังอัปเดต...</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row lg:items-center">
            {categories.length ? (
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
            ) : null}
            <div className="relative w-full sm:w-[320px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search stock"
                className="w-full rounded-2xl border-[#eadbc9] pl-10"
              />
            </div>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-[24px] border border-[#eadbc9] bg-white shadow-sm">
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="sticky top-0 bg-[#f6efe7] text-xs uppercase text-[#7a5b43]">
                <tr>
                  <th className="px-4 py-3">สินค้า</th>
                  <th className="px-4 py-3 text-right">คงเหลือ</th>
                  <th className="px-4 py-3 text-right">จุดเตือน</th>
                  <th className="px-4 py-3">สถานะ</th>
                  <th className="px-4 py-3">ประเภท stock</th>
                </tr>
              </thead>
              <tbody>
                {filteredMenus.map((item) => {
                  const status = getStockStatus(item);
                  return (
                    <tr
                      key={getMenuKey(item)}
                      className={`border-t border-[#eadbc9] transition hover:bg-[#fffaf3] ${status.tone === 'warning' ? 'bg-amber-50/70' : ''} ${status.tone === 'danger' ? 'bg-rose-50/70' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <ProductCell item={item} />
                      </td>
                      <td className="px-4 py-3 text-right text-lg font-black">{formatNumber(item.stock_qty)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-stone-600">{formatNumber(item.low_stock_level)}</td>
                      <td className="px-4 py-3">
                        <StockStatusBadge item={item} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge>{item.stock_mode}</StatusBadge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 p-3 md:hidden">
            {filteredMenus.map((item) => (
              <div key={getMenuKey(item)} className="rounded-[22px] border border-[#eadbc9] bg-white p-3 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <ProductCell item={item} />
                  <StockStatusBadge item={item} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-2xl bg-[#fffaf3] p-2">
                    <p className="text-xs font-bold text-stone-500">คงเหลือ</p>
                    <p className="text-lg font-black">{formatNumber(item.stock_qty)}</p>
                  </div>
                  <div className="rounded-2xl bg-[#fffaf3] p-2">
                    <p className="text-xs font-bold text-stone-500">จุดเตือน</p>
                    <p className="text-lg font-black">{formatNumber(item.low_stock_level)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {isLoading ? (
            <div className="grid gap-3 p-4">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="h-14 animate-pulse rounded-2xl bg-stone-100" />
              ))}
            </div>
          ) : null}

          {!isLoading && !filteredMenus.length ? (
            <div className="flex h-48 flex-col items-center justify-center gap-2 bg-[#fffaf3] text-center text-sm font-bold text-stone-400">
              <Package size={30} />
              <p>ไม่พบรายการ stock</p>
            </div>
          ) : null}
        </div>
      </section>
    </AppShell>
  );
}
