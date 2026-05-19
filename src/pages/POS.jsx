import React from 'react';
import { AlertTriangle, Plus, RefreshCw, Search, X } from 'lucide-react';
import {
  checkoutOrder,
  getCachedMenuResponse,
  getCachedSettingsResponse,
  getMenu,
  getSettings,
} from '../services/api.js';
import { saveReceiptDetail } from '../services/receiptCache.js';
import { navigateTo } from '../App.jsx';
import AppShell from '../components/AppShell.jsx';
import Button from '../components/Button.jsx';
import CategoryTabs from '../components/CategoryTabs.jsx';
import MenuCard from '../components/MenuCard.jsx';
import CartPanel from '../components/CartPanel.jsx';
import PaymentPanel from '../components/PaymentPanel.jsx';
import StatusBadge from '../components/StatusBadge.jsx';

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function makeCartItem(menu) {
  const cartId = `${menu.menu_id}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return {
    cart_id: cartId,
    menu_id: menu.menu_id,
    menu_name: menu.menu_name,
    quantity: 1,
    unit_price: toNumber(menu.base_price),
    note: '',
    total: toNumber(menu.base_price),
  };
}

function makeManualCartItem(form) {
  const cartId = `CUSTOM_COUNTER-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const quantity = toNumber(form.quantity);
  const unitPrice = toNumber(form.price);
  const name = form.name.trim();

  return {
    cart_id: cartId,
    menu_id: 'CUSTOM_COUNTER',
    menu_name: name,
    menu_name_snapshot: name,
    item_type: 'CUSTOM_COUNTER',
    quantity,
    unit_price: unitPrice,
    note: form.note.trim(),
    total: quantity * unitPrice,
  };
}

function formatMoney(value) {
  return new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function ManualCounterSaleModal({
  form,
  error,
  onChange,
  onCancel,
  onSubmit,
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-950/40 px-4 py-5 backdrop-blur-sm sm:items-center">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md overflow-hidden rounded-[28px] border border-[#eadbc9] bg-white shadow-2xl shadow-stone-950/20"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#eadbc9] bg-[#fffaf3] p-5">
          <div>
            <h2 className="text-xl font-black text-stone-950">ขายหน้าร้าน</h2>
            <p className="mt-1 text-sm font-semibold text-stone-500">เพิ่มสินค้าทั่วไปเข้าบิลนี้</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-stone-500 ring-1 ring-[#eadbc9] transition hover:bg-stone-50 hover:text-stone-950"
            aria-label="Close manual sale form"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <label className="block text-xs font-bold uppercase tracking-wide text-stone-500">
            ชื่อสินค้า
            <input
              value={form.name}
              onChange={(event) => onChange('name', event.target.value)}
              autoFocus
              className="mt-1 h-12 w-full rounded-2xl border border-[#eadbc9] bg-white px-3 text-sm font-semibold text-stone-950 outline-none ring-[#6f4e37] transition placeholder:text-stone-400 focus:ring-2"
              placeholder="เช่น ไฟแช็ก"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-bold uppercase tracking-wide text-stone-500">
              ราคา
              <input
                value={form.price}
                onChange={(event) => onChange('price', event.target.value)}
                inputMode="decimal"
                className="mt-1 h-12 w-full rounded-2xl border border-[#eadbc9] bg-white px-3 text-sm font-semibold text-stone-950 outline-none ring-[#6f4e37] transition placeholder:text-stone-400 focus:ring-2"
                placeholder="0"
              />
            </label>
            <label className="block text-xs font-bold uppercase tracking-wide text-stone-500">
              จำนวน
              <input
                value={form.quantity}
                onChange={(event) => onChange('quantity', event.target.value)}
                inputMode="decimal"
                className="mt-1 h-12 w-full rounded-2xl border border-[#eadbc9] bg-white px-3 text-sm font-semibold text-stone-950 outline-none ring-[#6f4e37] transition placeholder:text-stone-400 focus:ring-2"
                placeholder="1"
              />
            </label>
          </div>

          <label className="block text-xs font-bold uppercase tracking-wide text-stone-500">
            หมายเหตุ
            <textarea
              value={form.note}
              onChange={(event) => onChange('note', event.target.value)}
              rows={2}
              className="mt-1 w-full resize-none rounded-2xl border border-[#eadbc9] bg-white px-3 py-2 text-sm font-semibold text-stone-950 outline-none ring-[#6f4e37] transition placeholder:text-stone-400 focus:ring-2"
              placeholder="Optional"
            />
          </label>

          {error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700">
              {error}
            </div>
          ) : null}
        </div>

        <div className="flex gap-3 border-t border-[#eadbc9] bg-[#fffaf3] p-5">
          <Button type="button" variant="subtle" size="lg" className="flex-1 rounded-2xl" onClick={onCancel}>
            ยกเลิก
          </Button>
          <Button type="submit" variant="dark" size="lg" className="flex-1 rounded-2xl">
            เพิ่มเข้าตะกร้า
          </Button>
        </div>
      </form>
    </div>
  );
}

const defaultSettings = {
  shop_name: 'ล้านก๋างโต้ง',
  receipt_width: '58mm',
  promptpay_enabled: false,
  promptpay_id: '',
  promptpay_name: 'ล้านก๋างโต้ง',
  receipt_qr_enabled: false,
  receipt_qr_size_mm: 30,
};

export default function POS() {
  const cachedMenu = React.useMemo(() => getCachedMenuResponse(), []);
  const cachedSettings = React.useMemo(() => getCachedSettingsResponse(), []);
  const [categories, setCategories] = React.useState(() => cachedMenu?.categories || []);
  const [menus, setMenus] = React.useState(() => cachedMenu?.menus || []);
  const [activeCategory, setActiveCategory] = React.useState('ALL');
  const [search, setSearch] = React.useState('');
  const [cart, setCart] = React.useState([]);
  const [orderType, setOrderType] = React.useState('TAKEAWAY');
  const [tableNo, setTableNo] = React.useState('');
  const [note, setNote] = React.useState('');
  const [discount, setDiscount] = React.useState('0');
  const [paymentMethod, setPaymentMethod] = React.useState('CASH');
  const [received, setReceived] = React.useState('');
  const [isManualSaleOpen, setIsManualSaleOpen] = React.useState(false);
  const [manualSaleForm, setManualSaleForm] = React.useState({
    name: '',
    price: '',
    quantity: '1',
    note: '',
  });
  const [manualSaleError, setManualSaleError] = React.useState('');
  const [settings, setSettings] = React.useState(() => ({
    ...defaultSettings,
    ...(cachedSettings?.settings || {}),
  }));
  const [settingsWarnings, setSettingsWarnings] = React.useState(() => cachedSettings?.warnings || []);
  const [isLoading, setIsLoading] = React.useState(() => !cachedMenu?.success);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [checkoutStep, setCheckoutStep] = React.useState(0);
  const [isSlowCheckout, setIsSlowCheckout] = React.useState(false);
  const [error, setError] = React.useState('');
  const hasMenuRef = React.useRef(Boolean(cachedMenu?.success));
  const isMountedRef = React.useRef(false);
  const menuRequestIdRef = React.useRef(0);
  const checkoutMessages = React.useMemo(
    () => [
      'กำลังสร้างบิล...',
      'กำลังรับชำระเงิน...',
      'กำลังตัดสต็อก...',
      'กำลังออกใบเสร็จ...',
    ],
    [],
  );

  React.useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadMenu = React.useCallback(async ({ force = false } = {}) => {
    const requestId = menuRequestIdRef.current + 1;
    menuRequestIdRef.current = requestId;
    var showFullLoading = !hasMenuRef.current;

    if (showFullLoading) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }
    setError('');
    setSettingsWarnings([]);

    try {
      const [menuResult, settingsResult] = await Promise.allSettled([
        getMenu({ force }),
        getSettings({ force }),
      ]);

      if (menuResult.status === 'rejected') {
        throw menuResult.reason;
      }

      const result = menuResult.value;

      if (!result.success) {
        throw new Error(result.message || 'GET_MENU failed');
      }

      if (!isMountedRef.current || menuRequestIdRef.current !== requestId) {
        return;
      }

      const nextMenus = result.menus || [];

      if (import.meta.env.DEV) {
        const sampleImageUrls = nextMenus.slice(0, 5).map((menu) => menu.image_url || '');
        console.log('GET_MENU first 5 image_url values:', JSON.stringify(sampleImageUrls));
      }

      setCategories(result.categories || []);
      setMenus(nextMenus);
      hasMenuRef.current = true;

      if (settingsResult.status === 'fulfilled' && settingsResult.value.success) {
        setSettings({
          ...defaultSettings,
          ...(settingsResult.value.settings || {}),
        });
        setSettingsWarnings(settingsResult.value.warnings || []);
      } else if (settingsResult.status === 'fulfilled') {
        setSettings(defaultSettings);
        setSettingsWarnings([settingsResult.value.message || 'GET_SETTINGS failed']);
      } else {
        setSettings(defaultSettings);
        setSettingsWarnings([settingsResult.reason?.message || 'Cannot load settings']);
      }
    } catch (loadError) {
      if (isMountedRef.current && menuRequestIdRef.current === requestId) {
        setError(loadError.message || 'Cannot load menu');
      }
    } finally {
      if (isMountedRef.current && menuRequestIdRef.current === requestId) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, []);

  React.useEffect(() => {
    loadMenu();
  }, [loadMenu]);

  const totals = React.useMemo(() => {
    const subtotal = cart.reduce((sum, item) => sum + item.total, 0);
    const discountValue = Math.max(0, toNumber(discount));

    return {
      subtotal,
      discount: discountValue,
      total: Math.max(0, subtotal - discountValue),
    };
  }, [cart, discount]);

  React.useEffect(() => {
    setReceived(String(totals.total || ''));
  }, [totals.total]);

  React.useEffect(() => {
    if (!isSubmitting) {
      setCheckoutStep(0);
      return undefined;
    }

    const timer = window.setInterval(() => {
      setCheckoutStep((current) => Math.min(current + 1, checkoutMessages.length - 1));
    }, 900);

    return () => window.clearInterval(timer);
  }, [isSubmitting, checkoutMessages.length]);

  React.useEffect(() => {
    if (!isSubmitting) {
      setIsSlowCheckout(false);
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setIsSlowCheckout(true);
    }, 6000);

    return () => window.clearTimeout(timer);
  }, [isSubmitting]);

  const visibleMenus = React.useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return menus.filter((menu) => {
      const matchCategory = activeCategory === 'ALL' || menu.category_id === activeCategory;
      const matchSearch =
        !keyword ||
        menu.menu_name?.toLowerCase().includes(keyword) ||
        menu.menu_name_en?.toLowerCase().includes(keyword);

      return matchCategory && matchSearch;
    });
  }, [menus, activeCategory, search]);

  function addToCart(menu) {
    setCart((current) => {
      const existing = current.find((item) => item.menu_id === menu.menu_id && item.note === '');

      if (!existing) {
        return [...current, makeCartItem(menu)];
      }

      return current.map((item) => {
        if (item.cart_id !== existing.cart_id) return item;
        const quantity = item.quantity + 1;

        return {
          ...item,
          quantity,
          total: quantity * item.unit_price,
        };
      });
    });
  }

  function updateQuantity(cartId, delta) {
    setCart((current) =>
      current
        .map((item) => {
          if (item.cart_id !== cartId) return item;
          const quantity = Math.max(0, item.quantity + delta);

          return {
            ...item,
            quantity,
            total: quantity * item.unit_price,
          };
        })
        .filter((item) => item.quantity > 0),
    );
  }

  function updateItemNote(cartId, nextNote) {
    setCart((current) =>
      current.map((item) => (item.cart_id === cartId ? { ...item, note: nextNote } : item)),
    );
  }

  function openManualSale() {
    setOrderType('TAKEAWAY');
    setManualSaleForm({
      name: '',
      price: '',
      quantity: '1',
      note: '',
    });
    setManualSaleError('');
    setIsManualSaleOpen(true);
  }

  function updateManualSaleForm(field, value) {
    setManualSaleForm((current) => ({
      ...current,
      [field]: value,
    }));
    setManualSaleError('');
  }

  function closeManualSale() {
    setIsManualSaleOpen(false);
    setManualSaleError('');
  }

  function handleManualSaleSubmit(event) {
    event.preventDefault();

    const name = manualSaleForm.name.trim();
    const price = toNumber(manualSaleForm.price);
    const quantity = toNumber(manualSaleForm.quantity);

    if (!name) {
      setManualSaleError('กรุณากรอกชื่อสินค้า');
      return;
    }

    if (price <= 0) {
      setManualSaleError('ราคาต้องมากกว่า 0');
      return;
    }

    if (quantity <= 0) {
      setManualSaleError('จำนวนต้องมากกว่า 0');
      return;
    }

    setCart((current) => [...current, makeManualCartItem(manualSaleForm)]);
    closeManualSale();
  }

  function handlePaymentMethodChange(nextMethod) {
    setPaymentMethod(nextMethod);

    if (nextMethod !== 'CASH') {
      setReceived(String(totals.total || ''));
    }
  }

  async function handleCheckout() {
    if (isSubmitting || !cart.length || totals.total <= 0) return;

    setIsSubmitting(true);
    setCheckoutStep(0);
    setError('');

    try {
      const receivedAmount = paymentMethod === 'CASH' ? toNumber(received || totals.total) : totals.total;
      const checkoutPayload = {
        order_type: orderType,
        table_no: orderType === 'DINE_IN' ? tableNo : '',
        note,
        discount: totals.discount,
        created_by: 'CASHIER',
        items: cart.map((item) => ({
          menu_id: item.menu_id,
          menu_name: item.item_type === 'CUSTOM_COUNTER' ? item.menu_name : undefined,
          menu_name_snapshot: item.item_type === 'CUSTOM_COUNTER' ? item.menu_name_snapshot || item.menu_name : undefined,
          quantity: item.quantity,
          unit_price: item.item_type === 'CUSTOM_COUNTER' ? item.unit_price : undefined,
          note: item.note,
          discount: 0,
          total: item.item_type === 'CUSTOM_COUNTER' ? item.total : undefined,
          item_type: item.item_type,
        })),
        payment: {
          method: paymentMethod,
          amount: totals.total,
          received: receivedAmount,
          reference: '',
        },
      };
      const checkoutResult = await checkoutOrder(checkoutPayload);

      if (!isMountedRef.current) {
        return;
      }

      if (!checkoutResult.success) {
        throw new Error(checkoutResult.message || 'CHECKOUT_ORDER failed');
      }

      const orderId = checkoutResult.order?.order_id || checkoutResult.order_id;

      if (!orderId) {
        throw new Error('CHECKOUT_ORDER did not return order_id');
      }

      setCheckoutStep(3);
      saveReceiptDetail(orderId, {
        ...checkoutResult,
        payments: checkoutResult.payment ? [checkoutResult.payment] : [],
      });

      navigateTo(`/receipt/${encodeURIComponent(orderId)}`);
    } catch (submitError) {
      if (isMountedRef.current) {
        setError(submitError.message || 'Cannot complete payment');
      }
    } finally {
      if (isMountedRef.current) {
        setIsSubmitting(false);
      }
    }
  }

  return (
    <AppShell
      title="POS"
      subtitle="หน้าขายสำหรับแคชเชียร์"
      actions={
        <>
          <StatusBadge tone={menus.length ? 'success' : 'neutral'}>{menus.length} menus</StatusBadge>
          <Button onClick={() => loadMenu({ force: true })} size="icon" title="Refresh" aria-label="Refresh menu">
            <RefreshCw size={18} className={isRefreshing ? 'animate-spin' : ''} />
          </Button>
        </>
      }
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_440px]">
        <section className="min-w-0 rounded-[30px] border border-[#eadbc9] bg-white/85 p-4 shadow-2xl shadow-stone-900/5 backdrop-blur">
          <div className="flex flex-col gap-4 rounded-[24px] border border-[#eadbc9] bg-[#fffaf3] p-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-black text-stone-950">เมนู</h2>
              <p className="text-sm font-semibold text-stone-500">ยอดในบิล ฿{formatMoney(totals.total)}</p>
            </div>
            <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
              <Button onClick={openManualSale} variant="dark" size="lg" className="rounded-2xl px-5">
                <Plus size={18} />
                + ขายหน้าร้าน
              </Button>
              <div className="relative w-full lg:w-[380px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search menu"
                  className="h-12 w-full rounded-2xl border border-[#eadbc9] bg-white pl-10 pr-3 text-sm font-semibold outline-none ring-[#6f4e37] transition placeholder:text-stone-400 focus:ring-2"
                />
              </div>
            </div>
          </div>

          <div className="mt-4">
            <CategoryTabs categories={categories} activeCategory={activeCategory} onChange={setActiveCategory} />
          </div>

          {isRefreshing ? (
            <p className="mt-3 text-xs font-bold text-stone-500">กำลังอัปเดตข้อมูล...</p>
          ) : null}

          {error ? (
            <div className="mt-4 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700 shadow-sm">
              <AlertTriangle className="mt-0.5 shrink-0" size={18} />
              <span>{error}</span>
            </div>
          ) : null}

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-3 min-[1800px]:grid-cols-4">
            {isLoading ? (
              Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="h-[308px] animate-pulse rounded-[26px] bg-white ring-1 ring-[#eadbc9]" />
              ))
            ) : visibleMenus.length ? (
              visibleMenus.map((menu) => <MenuCard key={menu.menu_id} menu={menu} onAdd={addToCart} />)
            ) : (
              <div className="col-span-full flex h-56 flex-col items-center justify-center rounded-[26px] border border-dashed border-[#d8c2a9] bg-[#fffaf3] text-sm font-bold text-stone-400">
                ไม่พบเมนู
              </div>
            )}
          </div>
        </section>

        <aside className="space-y-4 xl:sticky xl:top-5 xl:self-start">
          <CartPanel
            cart={cart}
            orderType={orderType}
            tableNo={tableNo}
            note={note}
            discount={discount}
            totals={totals}
            onOrderTypeChange={setOrderType}
            onTableNoChange={setTableNo}
            onNoteChange={setNote}
            onDiscountChange={setDiscount}
            onIncrease={(cartId) => updateQuantity(cartId, 1)}
            onDecrease={(cartId) => updateQuantity(cartId, -1)}
            onRemove={(cartId) => setCart((current) => current.filter((item) => item.cart_id !== cartId))}
            onItemNoteChange={updateItemNote}
          />
          <PaymentPanel
            total={totals.total}
            method={paymentMethod}
            received={received}
            settings={settings}
            settingsWarnings={settingsWarnings}
            isBusy={isSubmitting}
            canSubmit={cart.length > 0 && totals.total > 0}
            busyLabel={checkoutMessages[checkoutStep]}
            busyHint={isSlowCheckout ? 'ระบบกำลังบันทึกข้อมูล กรุณาอย่าปิดหน้านี้' : ''}
            onMethodChange={handlePaymentMethodChange}
            onReceivedChange={setReceived}
            onSubmit={handleCheckout}
          />
        </aside>
      </div>

      {isManualSaleOpen ? (
        <ManualCounterSaleModal
          form={manualSaleForm}
          error={manualSaleError}
          onChange={updateManualSaleForm}
          onCancel={closeManualSale}
          onSubmit={handleManualSaleSubmit}
        />
      ) : null}
    </AppShell>
  );
}
