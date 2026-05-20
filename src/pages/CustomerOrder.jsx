import React from 'react';
import { AlertTriangle, CheckCircle2, ImageOff, Minus, Plus, Send, ShoppingBag } from 'lucide-react';
import {
  getCachedMenuResponse,
  getCachedSettingsResponse,
  getMenu,
  getSettings,
  submitQrTableOrder,
} from '../services/api.js';
import { getCurrentRouteSearch } from '../services/router.js';
import CategoryTabs from '../components/CategoryTabs.jsx';
import Input from '../components/Input.jsx';
import { getTableDisplayName } from '../utils/tableDisplay.js';

const defaultSettings = {
  shop_name: 'ล้านก๋างโต้ง',
};

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatMoney(value) {
  return new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(toNumber(value));
}

function makeCartItem(menu) {
  return {
    cart_id: `${menu.menu_id}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    menu_id: menu.menu_id,
    menu_name: menu.menu_name,
    quantity: 1,
    unit_price: toNumber(menu.base_price),
    note: '',
    total: toNumber(menu.base_price),
  };
}

function MenuTile({ menu, selectedQuantity = 0, onAdd, onDecrease }) {
  const [imageFailed, setImageFailed] = React.useState(false);
  const imageUrl = typeof menu.image_url === 'string' ? menu.image_url.trim() : '';
  const shouldShowImage = imageUrl.startsWith('https://') && !imageFailed;
  const hasSelectedQuantity = selectedQuantity > 0;

  React.useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  return (
    <div
      className="flex gap-3 rounded-[24px] border border-[#eadbc9] bg-white p-3 text-left shadow-sm shadow-stone-900/5 transition active:scale-[0.99] hover:border-[#d4b99d]"
    >
      <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-[20px] bg-[#efe5da]">
        {shouldShowImage ? (
          <img
            src={imageUrl}
            alt={menu.menu_name}
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#efe5da] to-[#fff7ef] text-[#a78b73]">
            <ImageOff size={24} />
          </div>
        )}
        {hasSelectedQuantity ? (
          <span className="absolute right-1.5 top-1.5 inline-flex min-w-8 items-center justify-center rounded-full bg-emerald-600 px-2 py-1 text-xs font-black text-white shadow-lg shadow-emerald-900/20">
            x{selectedQuantity}
          </span>
        ) : null}
      </div>
      <div className="min-w-0 flex-1 py-0.5">
        <p className="line-clamp-2 font-black leading-snug text-stone-950">{menu.menu_name}</p>
        {menu.description ? <p className="mt-1 line-clamp-2 text-xs font-semibold text-stone-500">{menu.description}</p> : null}
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-lg font-black text-[#6f4e37]">฿{formatMoney(menu.base_price)}</span>
          <div className="flex items-center rounded-2xl bg-[#f4ede6] p-1 shadow-sm">
            <button
              type="button"
              onClick={() => onDecrease(menu)}
              disabled={!hasSelectedQuantity}
              aria-label={`ลด ${menu.menu_name}`}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-stone-700 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-30"
            >
              <Minus size={16} />
            </button>
            <span className="min-w-9 text-center text-sm font-black text-stone-950">{selectedQuantity}</span>
            <button
              type="button"
              onClick={() => onAdd(menu)}
              aria-label={`เพิ่ม ${menu.menu_name}`}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0f0b08] text-white shadow-sm shadow-stone-950/15 transition active:scale-95"
            >
              <Plus size={17} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CustomerOrder() {
  const [routeSearch, setRouteSearch] = React.useState(() => getCurrentRouteSearch());
  const query = React.useMemo(() => new URLSearchParams(routeSearch), [routeSearch]);
  const tableNo = query.get('table') || '';
  const token = query.get('token') || '';
  const routeKey = `${tableNo}:${token}`;
  const missingQrData = !tableNo || !token;
  const cachedMenu = React.useMemo(() => (missingQrData ? null : getCachedMenuResponse()), [missingQrData]);
  const cachedSettings = React.useMemo(() => (missingQrData ? null : getCachedSettingsResponse()), [missingQrData]);
  const [settings, setSettings] = React.useState(() => ({
    ...defaultSettings,
    ...(cachedSettings?.settings || {}),
  }));
  const [categories, setCategories] = React.useState(() => cachedMenu?.categories || []);
  const [menus, setMenus] = React.useState(() => cachedMenu?.menus || []);
  const [activeCategory, setActiveCategory] = React.useState('ALL');
  const [cart, setCart] = React.useState([]);
  const [note, setNote] = React.useState('');
  const [customerName, setCustomerName] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(() => !missingQrData && !cachedMenu?.success);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState('');
  const [success, setSuccess] = React.useState(null);

  const hasMenuRef = React.useRef(Boolean(cachedMenu?.success));
  const isMountedRef = React.useRef(false);
  const menuRequestIdRef = React.useRef(0);
  const routeKeyRef = React.useRef(routeKey);

  React.useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  React.useEffect(() => {
    function syncRouteSearch() {
      setRouteSearch(getCurrentRouteSearch());
    }

    window.addEventListener('hashchange', syncRouteSearch);
    window.addEventListener('popstate', syncRouteSearch);

    return () => {
      window.removeEventListener('hashchange', syncRouteSearch);
      window.removeEventListener('popstate', syncRouteSearch);
    };
  }, []);

  React.useEffect(() => {
    routeKeyRef.current = routeKey;
    menuRequestIdRef.current += 1;
    setCart([]);
    setNote('');
    setCustomerName('');
    setError('');
    setSuccess(null);
    setIsSubmitting(false);
    setIsRefreshing(false);
    setActiveCategory('ALL');

    if (missingQrData) {
      setIsLoading(false);
      return;
    }

    setIsLoading(!hasMenuRef.current);
  }, [missingQrData, routeKey]);

  React.useEffect(() => {
    async function loadMenu() {
      if (missingQrData) {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
        return;
      }

      const requestId = menuRequestIdRef.current + 1;
      menuRequestIdRef.current = requestId;
      const showFullLoading = !hasMenuRef.current;

      if (showFullLoading) {
        setIsLoading(true);
      } else {
        setIsRefreshing(true);
      }
      setError('');

      try {
        const [menuResult, settingsResult] = await Promise.all([
          getMenu(),
          getSettings(),
        ]);

        if (!menuResult.success) throw new Error(menuResult.message || 'GET_MENU failed');

        if (!isMountedRef.current || menuRequestIdRef.current !== requestId) {
          return;
        }

        setCategories(menuResult.categories || []);
        setMenus(menuResult.menus || []);
        hasMenuRef.current = true;

        if (settingsResult.success) {
          setSettings({ ...defaultSettings, ...(settingsResult.settings || {}) });
        }
      } catch (loadError) {
        if (!isMountedRef.current || menuRequestIdRef.current !== requestId) {
          return;
        }
        setError(loadError.message || 'ไม่สามารถโหลดเมนูได้');
      } finally {
        if (!isMountedRef.current || menuRequestIdRef.current !== requestId) {
          return;
        }
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }

    loadMenu();
  }, [missingQrData, routeKey]);

  const visibleMenus = React.useMemo(() => {
    return menus.filter((menu) => activeCategory === 'ALL' || menu.category_id === activeCategory);
  }, [activeCategory, menus]);

  const totals = React.useMemo(() => {
    const subtotal = cart.reduce((sum, item) => sum + item.total, 0);
    return { subtotal, total: subtotal };
  }, [cart]);
  const cartQuantityByMenuId = React.useMemo(
    () =>
      cart.reduce((quantities, item) => {
        quantities[item.menu_id] = (quantities[item.menu_id] || 0) + item.quantity;
        return quantities;
      }, {}),
    [cart],
  );

  function addToCart(menu) {
    setCart((current) => {
      const existing = current.find((item) => item.menu_id === menu.menu_id && item.note === '');

      if (!existing) return [...current, makeCartItem(menu)];

      return current.map((item) => {
        if (item.cart_id !== existing.cart_id) return item;
        const quantity = item.quantity + 1;
        return { ...item, quantity, total: quantity * item.unit_price };
      });
    });
  }

  function decreaseFromMenu(menu) {
    setCart((current) => {
      const target = [...current]
        .reverse()
        .find((item) => item.menu_id === menu.menu_id && item.note === '') ||
        [...current].reverse().find((item) => item.menu_id === menu.menu_id);

      if (!target) return current;

      return current
        .map((item) => {
          if (item.cart_id !== target.cart_id) return item;
          const quantity = Math.max(0, item.quantity - 1);
          return { ...item, quantity, total: quantity * item.unit_price };
        })
        .filter((item) => item.quantity > 0);
    });
  }

  function updateCartItem(cartId, updates) {
    setCart((current) =>
      current
        .map((item) => {
          if (item.cart_id !== cartId) return item;
          const next = { ...item, ...updates };
          next.quantity = Math.max(0, toNumber(next.quantity));
          next.total = next.quantity * next.unit_price;
          return next;
        })
        .filter((item) => item.quantity > 0),
    );
  }

  async function handleSubmit() {
    if (isSubmitting || !cart.length || missingQrData) return;

    const submitRouteKey = routeKey;
    setIsSubmitting(true);
    setError('');

    try {
      const result = await submitQrTableOrder({
        table_no: tableNo,
        qr_token: token,
        customer_name: customerName,
        note,
        items: cart.map((item) => ({
          menu_id: item.menu_id,
          quantity: item.quantity,
          note: item.note,
        })),
      });

      if (!isMountedRef.current || routeKeyRef.current !== submitRouteKey) {
        return;
      }

      if (!result.success) {
        if (result.error === 'INVALID_TABLE_QR') {
          throw new Error('QR โต๊ะนี้ไม่ถูกต้อง กรุณาแจ้งพนักงาน');
        }

        throw new Error(result.message || 'ส่งออเดอร์ไม่สำเร็จ');
      }

      setSuccess({
        ...result,
        routeKey: submitRouteKey,
      });
      setCart([]);
    } catch (submitError) {
      if (!isMountedRef.current || routeKeyRef.current !== submitRouteKey) {
        return;
      }

      setError(submitError.message || 'ส่งออเดอร์ไม่สำเร็จ');
    } finally {
      if (!isMountedRef.current || routeKeyRef.current !== submitRouteKey) {
        return;
      }

      setIsSubmitting(false);
    }
  }

  const visibleSuccess = success && success.routeKey === routeKey ? success : null;

  if (visibleSuccess) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,#fff8ec_0,#f5efe6_42%,#eee1d2_100%)] px-4 py-6 text-stone-950">
        <section className="mx-auto max-w-md rounded-[32px] border border-emerald-200 bg-white p-6 text-center shadow-2xl shadow-stone-900/10">
          <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircle2 size={52} />
          </span>
          <h1 className="mt-4 text-3xl font-black">ส่งออเดอร์แล้ว</h1>
          <p className="mt-2 text-sm font-semibold text-stone-500">กรุณารอพนักงานยืนยันรายการก่อนเข้าบิล</p>
          <div className="mt-5 grid gap-3 rounded-[24px] border border-[#eadbc9] bg-[#fffaf3] p-4 text-left">
            <div className="flex justify-between gap-3">
              <span className="font-bold text-stone-500">โต๊ะ</span>
              <span className="font-black">
                {getTableDisplayName(visibleSuccess.table_no, visibleSuccess.table_no ? `โต๊ะ ${visibleSuccess.table_no}` : '')}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="font-bold text-stone-500">เลขออเดอร์</span>
              <span className="font-black">{visibleSuccess.order_no}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="font-bold text-stone-500">ยอดรวม</span>
              <span className="font-black">฿{formatMoney(visibleSuccess.total)}</span>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#fff8ec_0,#f5efe6_42%,#eee1d2_100%)] pb-36 text-stone-950">
      <header className="sticky top-0 z-20 border-b border-[#eadbc9] bg-[#fffaf3]/95 px-4 py-4 shadow-sm backdrop-blur">
        <div className="mx-auto max-w-2xl">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#8a6a4f]">{settings.shop_name}</p>
          <div className="mt-1 flex items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-black">สั่งอาหารที่โต๊ะ</h1>
              <p className="text-sm font-bold text-stone-500">
                {getTableDisplayName(tableNo, tableNo ? `โต๊ะ ${tableNo}` : 'ไม่พบข้อมูลโต๊ะ')}
              </p>
            </div>
            <span className="rounded-full border border-[#d9c2aa] bg-white px-3 py-1 text-xs font-black text-[#6f4e37] shadow-sm">
              QR Order
            </span>
          </div>
          <p className="mt-3 rounded-2xl bg-white/70 px-3 py-2 text-sm font-semibold text-stone-600">
            เลือกเมนูแล้วกดส่งออเดอร์ พนักงานจะชำระเงินที่โต๊ะ
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-4">
        {missingQrData ? (
          <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700 shadow-sm">
            <AlertTriangle className="mt-0.5 shrink-0" size={18} />
            <span>ลิงก์ QR ไม่ครบถ้วน กรุณาสแกน QR บนโต๊ะอีกครั้งหรือแจ้งพนักงาน</span>
          </div>
        ) : null}

        {error ? (
          <div className="mb-4 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700 shadow-sm">
            <AlertTriangle className="mt-0.5 shrink-0" size={18} />
            <span>{error}</span>
          </div>
        ) : null}

        {!missingQrData ? (
          <>
            <CategoryTabs categories={categories} activeCategory={activeCategory} onChange={setActiveCategory} />

            {isRefreshing ? (
              <p className="mt-3 text-xs font-bold text-stone-500">กำลังอัปเดตข้อมูล...</p>
            ) : null}

            <section className="mt-4 grid gap-3">
              {isLoading
                ? Array.from({ length: 6 }).map((_, index) => (
                    <div key={index} className="h-32 animate-pulse rounded-[24px] bg-white ring-1 ring-[#eadbc9]" />
                  ))
                : visibleMenus.map((menu) => (
                    <MenuTile
                      key={menu.menu_id}
                      menu={menu}
                      selectedQuantity={cartQuantityByMenuId[menu.menu_id] || 0}
                      onAdd={addToCart}
                      onDecrease={decreaseFromMenu}
                    />
                  ))}
            </section>
          </>
        ) : null}
      </div>

      <section className="fixed inset-x-0 bottom-0 z-30 p-3">
        <div className="mx-auto max-w-2xl rounded-[28px] border border-[#eadbc9] bg-white/95 p-3 shadow-[0_-18px_50px_rgba(28,25,23,0.18)] backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-stone-500">รายการในตะกร้า</p>
              <p className="text-2xl font-black">฿{formatMoney(totals.total)}</p>
            </div>
            <button
              type="button"
              disabled={!cart.length || isSubmitting || missingQrData}
              onClick={handleSubmit}
              className="inline-flex h-14 items-center justify-center gap-2 rounded-[20px] bg-[#0f0b08] px-5 text-sm font-black text-white shadow-lg shadow-stone-950/15 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-stone-300 disabled:shadow-none"
            >
              <Send size={18} />
              {isSubmitting ? 'กำลังส่ง...' : 'ส่งออเดอร์'}
            </button>
          </div>

          {cart.length ? (
            <details className="mt-3 max-h-[58vh] overflow-y-auto rounded-[24px] border border-[#eadbc9] bg-[#fffaf3] p-3">
              <summary className="cursor-pointer text-sm font-black text-stone-700">ดูรายการและหมายเหตุ</summary>
              <div className="mt-3 space-y-3">
                {cart.map((item) => (
                  <div key={item.cart_id} className="rounded-[22px] border border-[#eadbc9] bg-white p-3 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-black">{item.menu_name}</p>
                        <p className="text-xs font-semibold text-stone-500">฿{formatMoney(item.unit_price)}</p>
                      </div>
                      <p className="font-black">฿{formatMoney(item.total)}</p>
                    </div>
                    <div className="mt-3 flex items-center rounded-2xl bg-[#f4ede6] p-1">
                      <button
                        type="button"
                        onClick={() => updateCartItem(item.cart_id, { quantity: item.quantity - 1 })}
                        className="h-10 w-10 rounded-xl hover:bg-white"
                      >
                        <Minus className="mx-auto" size={16} />
                      </button>
                      <span className="w-12 text-center font-black">{item.quantity}</span>
                      <button
                        type="button"
                        onClick={() => updateCartItem(item.cart_id, { quantity: item.quantity + 1 })}
                        className="h-10 w-10 rounded-xl hover:bg-white"
                      >
                        <Plus className="mx-auto" size={16} />
                      </button>
                    </div>
                    <Input
                      value={item.note}
                      onChange={(event) => updateCartItem(item.cart_id, { note: event.target.value })}
                      placeholder="หมายเหตุรายการนี้"
                      className="mt-3 h-10 w-full rounded-xl border-[#eadbc9]"
                    />
                  </div>
                ))}
                <Input
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                  placeholder="ชื่อผู้สั่ง (ถ้าต้องการ)"
                  className="w-full rounded-2xl border-[#eadbc9]"
                />
                <Input
                  as="textarea"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="หมายเหตุรวม"
                  rows={2}
                  className="w-full resize-none rounded-2xl border-[#eadbc9]"
                />
              </div>
            </details>
          ) : (
            <div className="mt-3 flex items-center justify-center gap-2 rounded-[22px] bg-[#fffaf3] p-3 text-sm font-bold text-stone-400">
              <ShoppingBag size={18} />
              เลือกเมนูเพื่อเพิ่มลงตะกร้า
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
