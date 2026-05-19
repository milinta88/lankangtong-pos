import React from 'react';
import QRCode from 'qrcode';
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Minus,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  Search,
  ShoppingBag,
  Utensils,
  XCircle,
} from 'lucide-react';
import {
  addItemsToTableOrder,
  clearTableOrder,
  confirmTablePendingItems,
  getCachedMenuResponse,
  getCachedSettingsResponse,
  getCachedTablesResponse,
  getMenu,
  getSettings,
  getTableOrder,
  getTableQrLinks,
  getTables,
  hasFreshTablesClientCache,
  openTable,
  payTableOrder,
  TABLES_UPDATED_EVENT,
  updateTablesClientCache,
} from '../services/api.js';
import { saveReceiptDetail } from '../services/receiptCache.js';
import { navigateTo } from '../App.jsx';
import { getCurrentRoutePath, PRODUCTION_ORDER_URL } from '../services/router.js';
import {
  consumePendingTableFocus,
  peekPendingTableFocus,
  QR_PENDING_FOCUS_EVENT,
  readSeenPendingCount,
  writeSeenPendingCount,
} from '../services/qrPendingState.js';
import AppShell from '../components/AppShell.jsx';
import Button from '../components/Button.jsx';
import CategoryTabs from '../components/CategoryTabs.jsx';
import Input from '../components/Input.jsx';
import PaymentPanel from '../components/PaymentPanel.jsx';
import StatusBadge from '../components/StatusBadge.jsx';

const defaultSettings = {
  shop_name: 'ล้านก๋างโต้ง',
  receipt_width: '58mm',
  promptpay_enabled: false,
  promptpay_id: '',
  promptpay_name: 'ล้านก๋างโต้ง',
  receipt_qr_enabled: false,
  receipt_qr_size_mm: 30,
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

function statusTone(status) {
  if (status === 'AVAILABLE') return 'success';
  if (status === 'READY_TO_PAY') return 'warning';
  return 'coffee';
}

function statusLabel(status) {
  const labels = {
    AVAILABLE: 'ว่าง',
    OCCUPIED: 'มีลูกค้า',
    READY_TO_PAY: 'รอชำระ',
  };

  return labels[status] || status;
}

function tableCardClass(status, isSelected) {
  const selected = isSelected ? 'ring-2 ring-[#4b3020] ring-offset-2 ring-offset-[#f5efe6]' : '';
  const base =
    'rounded-[26px] border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0';

  if (status === 'AVAILABLE') {
    return `${base} ${selected} border-emerald-200 bg-gradient-to-br from-white to-emerald-50 hover:border-emerald-300`;
  }

  if (status === 'READY_TO_PAY') {
    return `${base} ${selected} border-indigo-200 bg-gradient-to-br from-white to-indigo-50 hover:border-indigo-300`;
  }

  return `${base} ${selected} border-amber-200 bg-gradient-to-br from-white to-amber-50 hover:border-amber-300`;
}

function formatShortTime(value) {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function markPaidTableAvailable(tables, detail, paidOrder, orderId) {
  const tableNo = detail?.table?.table_no || paidOrder?.table_no || paidOrder?.table_id || '';
  const tableId = detail?.table?.table_id || paidOrder?.table_id || tableNo;

  return tables.map((table) => {
    const matchesPaidTable =
      (tableNo && table.table_no === tableNo) ||
      (tableId && table.table_id === tableId) ||
      (orderId && table.current_order_id === orderId);

    if (!matchesPaidTable) return table;

    const nextTable = { ...table };
    delete nextTable.order;

    return {
      ...nextTable,
      status: 'AVAILABLE',
      current_order_id: '',
    };
  });
}

function markClearedTableAvailable(tables, detail, clearedOrder, orderId) {
  return markPaidTableAvailable(tables, detail, clearedOrder, orderId);
}

function buildTableOrderSummary(detail) {
  const order = detail?.order || {};
  const totals = detail?.totals || {};
  const pendingTotals = detail?.pending_totals || {};
  const items = Array.isArray(detail?.items) ? detail.items : [];
  const pendingItems = Array.isArray(detail?.pending_items) ? detail.pending_items : [];
  const itemCount = totals.item_count === undefined
    ? items.reduce((sum, item) => sum + toNumber(item.quantity), 0)
    : toNumber(totals.item_count);
  const pendingItemCount = pendingTotals.item_count === undefined
    ? pendingItems.reduce((sum, item) => sum + toNumber(item.quantity), 0)
    : toNumber(pendingTotals.item_count);

  return {
    order_no: order.order_no || '',
    total: toNumber(totals.total === undefined ? order.total : totals.total),
    item_count: itemCount,
    pending_item_count: pendingItemCount,
    pending_total: toNumber(pendingTotals.total === undefined ? pendingTotals.subtotal : pendingTotals.total),
    has_pending_items: pendingItemCount > 0,
    created_at: order.created_at || '',
  };
}

function markTableOrderActive(tables, detail) {
  const sourceTable = detail?.table || {};
  const order = detail?.order || {};
  const tableNo = sourceTable.table_no || order.table_no || order.table_id || '';
  const tableId = sourceTable.table_id || order.table_id || tableNo;
  const orderId = order.order_id || sourceTable.current_order_id || '';
  let didUpdate = false;

  const nextTables = tables.map((table) => {
    const matchesTable =
      (tableNo && table.table_no === tableNo) ||
      (tableId && table.table_id === tableId) ||
      (orderId && table.current_order_id === orderId);

    if (!matchesTable) return table;

    didUpdate = true;

    return {
      ...table,
      ...sourceTable,
      status: 'OCCUPIED',
      current_order_id: orderId,
      order: buildTableOrderSummary(detail),
    };
  });

  if (didUpdate || !sourceTable.table_no) {
    return nextTables;
  }

  return nextTables.concat({
    ...sourceTable,
    status: 'OCCUPIED',
    current_order_id: orderId,
    order: buildTableOrderSummary(detail),
  });
}

function getTablePendingCount(table) {
  return toNumber(table?.order?.pending_item_count || 0);
}

function getTablePendingTotal(table) {
  return toNumber(table?.order?.pending_total || 0);
}

export default function Tables() {
  const cachedMenu = React.useMemo(() => getCachedMenuResponse(), []);
  const cachedSettings = React.useMemo(() => getCachedSettingsResponse(), []);
  const cachedTables = React.useMemo(() => getCachedTablesResponse(), []);
  const [tables, setTables] = React.useState(() => cachedTables?.tables || []);
  const [categories, setCategories] = React.useState(() => cachedMenu?.categories || []);
  const [menus, setMenus] = React.useState(() => cachedMenu?.menus || []);
  const [settings, setSettings] = React.useState(() => ({
    ...defaultSettings,
    ...(cachedSettings?.settings || {}),
  }));
  const [settingsWarnings, setSettingsWarnings] = React.useState(() => cachedSettings?.warnings || []);
  const [activeCategory, setActiveCategory] = React.useState('ALL');
  const [search, setSearch] = React.useState('');
  const [selectedDetail, setSelectedDetail] = React.useState(null);
  const [cart, setCart] = React.useState([]);
  const [paymentMethod, setPaymentMethod] = React.useState('CASH');
  const [received, setReceived] = React.useState('');
  const [qrCards, setQrCards] = React.useState([]);
  const [showQrCards, setShowQrCards] = React.useState(false);
  const [pendingToast, setPendingToast] = React.useState(null);
  const [isClearModalOpen, setIsClearModalOpen] = React.useState(false);
  const [clearReason, setClearReason] = React.useState('');
  const [clearConfirm, setClearConfirm] = React.useState('');
  const [clearSuccess, setClearSuccess] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(() => !cachedTables?.success);
  const [isRefreshingTables, setIsRefreshingTables] = React.useState(false);
  const [isWorking, setIsWorking] = React.useState(false);
  const [isPayingTable, setIsPayingTable] = React.useState(false);
  const [isClearingTable, setIsClearingTable] = React.useState(false);
  const [tablePaymentStep, setTablePaymentStep] = React.useState(0);
  const [isSlowTablePayment, setIsSlowTablePayment] = React.useState(false);
  const [error, setError] = React.useState('');
  const [refreshWarning, setRefreshWarning] = React.useState('');
  const hasLoadedTablesRef = React.useRef(Boolean(cachedTables?.success));
  const tablesRequestRef = React.useRef({ inFlight: false, latestId: 0 });
  const autoRefreshStateRef = React.useRef({
    isBusy: false,
    isPanelOpen: false,
  });
  const isMountedRef = React.useRef(false);
  const tablesRef = React.useRef(tables);
  const pendingSectionRef = React.useRef(null);
  const seenPendingCountsRef = React.useRef({});
  const tablePaymentMessages = React.useMemo(
    () => [
      'กำลังปิดบิลโต๊ะ...',
      'กำลังบันทึกการชำระเงิน...',
      'กำลังตัดสต็อก...',
      'กำลังคืนสถานะโต๊ะ...',
      'กำลังออกใบเสร็จ...',
    ],
    [],
  );

  React.useEffect(() => {
    isMountedRef.current = true;

    if (import.meta.env.DEV) {
      console.log('[Tables] mounted');
    }

    return () => {
      isMountedRef.current = false;

      if (import.meta.env.DEV) {
        console.log('[Tables] unmounted');
      }
    };
  }, []);

  React.useEffect(() => {
    tablesRef.current = tables;
  }, [tables]);

  const loadTables = React.useCallback(
    async ({ showLoading = true, force = false, silentError = false } = {}) => {
    if (getCurrentRoutePath() !== '/tables') {
      return null;
    }

    if (tablesRequestRef.current.inFlight) {
      if (import.meta.env.DEV) {
        console.log('[Tables] refresh skipped: already refreshing');
      }

      return null;
    }

    const requestId = tablesRequestRef.current.latestId + 1;
    tablesRequestRef.current = { inFlight: true, latestId: requestId };
    const showFullLoading = showLoading && !hasLoadedTablesRef.current;
    const isFreshCacheAvailable = hasFreshTablesClientCache();

    if (import.meta.env.DEV && !force) {
      console.log(isFreshCacheAvailable ? '[Tables] using cached tables' : '[Tables] initial fetch started');
    }

    if (showFullLoading) {
      setIsLoading(true);
    } else {
      setIsRefreshingTables(true);
    }
    setError('');
    setRefreshWarning('');

    try {
      const tablesResult = await getTables({ forceRefresh: force });
      const isLatestRequest =
        isMountedRef.current &&
        getCurrentRoutePath() === '/tables' &&
        tablesRequestRef.current.latestId === requestId;

      if (!isLatestRequest) {
        return tablesResult;
      }

      if (!tablesResult.success) throw new Error(tablesResult.message || 'GET_TABLES failed');

      setTables(tablesResult.tables || []);
      tablesRef.current = tablesResult.tables || [];
      hasLoadedTablesRef.current = true;
      return tablesResult;
    } catch (loadError) {
      if (isMountedRef.current && tablesRequestRef.current.latestId === requestId) {
        if (silentError) {
          setRefreshWarning(loadError.message || 'Cannot refresh tables');
        } else {
          setError(loadError.message || 'Cannot load tables');
        }
      }

      return null;
    } finally {
      if (isMountedRef.current && tablesRequestRef.current.latestId === requestId) {
        tablesRequestRef.current.inFlight = false;

        if (showFullLoading) {
          setIsLoading(false);
        } else {
          setIsRefreshingTables(false);
        }
      }
    }
    },
    [],
  );

  const forceRefreshTables = React.useCallback(
    async ({ showLoading = false, silentError = false } = {}) => {
      return loadTables({ showLoading, force: true, silentError });
    },
    [loadTables],
  );

  const commitTablesOptimistically = React.useCallback((updater) => {
    tablesRequestRef.current = {
      inFlight: false,
      latestId: tablesRequestRef.current.latestId + 1,
    };
    setIsRefreshingTables(false);

    const nextTables = typeof updater === 'function' ? updater(tablesRef.current) : updater;

    tablesRef.current = nextTables;
    setTables(nextTables);
    updateTablesClientCache(nextTables);
    hasLoadedTablesRef.current = true;

    return nextTables;
  }, []);

  const loadData = React.useCallback(async () => {
    const tablesPromise = loadTables({ showLoading: true });

    try {
      const [menuResult, settingsResult] = await Promise.all([
        getMenu(),
        getSettings(),
      ]);

      if (!menuResult.success) throw new Error(menuResult.message || 'GET_MENU failed');

      if (!isMountedRef.current || getCurrentRoutePath() !== '/tables') {
        return;
      }

      setCategories(menuResult.categories || []);
      setMenus(menuResult.menus || []);

      if (settingsResult.success) {
        setSettings({ ...defaultSettings, ...(settingsResult.settings || {}) });
        setSettingsWarnings(settingsResult.warnings || []);
      }
    } catch (loadError) {
      if (isMountedRef.current) {
        setError(loadError.message || 'Cannot load tables');
      }
    } finally {
      await tablesPromise;
    }
  }, [loadTables]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  React.useEffect(() => {
    const handleTablesUpdated = (event) => {
      if (!isMountedRef.current || getCurrentRoutePath() !== '/tables') {
        return;
      }

      const nextTables = event.detail?.tables;

      if (!Array.isArray(nextTables)) {
        return;
      }

      tablesRef.current = nextTables;
      setTables(nextTables);
      hasLoadedTablesRef.current = true;
      setIsLoading(false);
      setIsRefreshingTables(false);
    };

    window.addEventListener(TABLES_UPDATED_EVENT, handleTablesUpdated);
    return () => window.removeEventListener(TABLES_UPDATED_EVENT, handleTablesUpdated);
  }, []);

  autoRefreshStateRef.current = {
    isBusy: isWorking || isPayingTable || isClearingTable,
    isPanelOpen: Boolean(selectedDetail?.order) || showQrCards || isClearModalOpen,
  };

  React.useEffect(() => {
    const timer = window.setInterval(() => {
      if (getCurrentRoutePath() !== '/tables') {
        return;
      }

      if (document.visibilityState !== 'visible') {
        return;
      }

      if (autoRefreshStateRef.current.isPanelOpen || autoRefreshStateRef.current.isBusy) {
        if (import.meta.env.DEV) {
          console.log('[Tables] auto refresh skipped: panel open');
        }
        return;
      }

      if (tablesRequestRef.current.inFlight) {
        if (import.meta.env.DEV) {
          console.log('[Tables] auto refresh skipped: in flight');
        }
        return;
      }

      if (hasFreshTablesClientCache()) {
        if (import.meta.env.DEV) {
          console.log('[Tables] auto refresh skipped: cache still valid');
        }
        return;
      }

      if (import.meta.env.DEV) {
        console.log('[Tables] auto refresh started');
      }

      loadTables({ showLoading: false, force: true });
    }, 60000);

    return () => window.clearInterval(timer);
  }, [loadTables]);

  React.useEffect(() => {
    if (!isPayingTable) {
      setTablePaymentStep(0);
      return undefined;
    }

    const timer = window.setInterval(() => {
      setTablePaymentStep((current) => Math.min(current + 1, tablePaymentMessages.length - 1));
    }, 900);

    return () => window.clearInterval(timer);
  }, [isPayingTable, tablePaymentMessages.length]);

  React.useEffect(() => {
    if (!isPayingTable) {
      setIsSlowTablePayment(false);
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setIsSlowTablePayment(true);
    }, 6000);

    return () => window.clearTimeout(timer);
  }, [isPayingTable]);

  const selectedTotal = toNumber(selectedDetail?.totals?.total || selectedDetail?.order?.total || 0);

  React.useEffect(() => {
    setReceived(String(selectedTotal || ''));
  }, [selectedTotal]);

  const visibleMenus = React.useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return menus.filter((menu) => {
      const matchesCategory = activeCategory === 'ALL' || menu.category_id === activeCategory;
      const matchesSearch =
        !keyword ||
        menu.menu_name?.toLowerCase().includes(keyword) ||
        menu.menu_name_en?.toLowerCase().includes(keyword);

      return matchesCategory && matchesSearch;
    });
  }, [activeCategory, menus, search]);

  const pendingTotals = React.useMemo(() => {
    const subtotal = cart.reduce((sum, item) => sum + item.total, 0);
    return { subtotal, discount: 0, total: subtotal };
  }, [cart]);

  const tableSummary = React.useMemo(
    () => ({
      available: tables.filter((table) => table.status === 'AVAILABLE').length,
      occupied: tables.filter((table) => table.status === 'OCCUPIED').length,
      readyToPay: tables.filter((table) => table.status === 'READY_TO_PAY').length,
    }),
    [tables],
  );
  const pendingTables = React.useMemo(
    () => tables.filter((table) => getTablePendingCount(table) > 0),
    [tables],
  );
  const selectedPendingItems = React.useMemo(
    () => (Array.isArray(selectedDetail?.pending_items) ? selectedDetail.pending_items : []),
    [selectedDetail],
  );
  const selectedPendingCount = selectedPendingItems.reduce((sum, item) => sum + toNumber(item.quantity), 0);
  const selectedPaymentStatus = String(selectedDetail?.order?.payment_status || '').toUpperCase();
  const canClearSelectedTable =
    selectedDetail?.order &&
    selectedDetail?.table?.status === 'OCCUPIED' &&
    selectedPaymentStatus === 'UNPAID';

  React.useEffect(() => {
    if (!tables.length) return;

    const nextSeenCounts = { ...seenPendingCountsRef.current };
    const newAlerts = [];

    tables.forEach((table) => {
      const tableNo = table.table_no;
      const pendingCount = getTablePendingCount(table);
      const previousCount = Math.max(
        tableNo in seenPendingCountsRef.current ? toNumber(seenPendingCountsRef.current[tableNo]) : 0,
        readSeenPendingCount(tableNo),
      );

      if (pendingCount > previousCount) {
        newAlerts.push({
          table_no: tableNo,
          table_name: table.table_name,
          pending_item_count: pendingCount,
          pending_total: getTablePendingTotal(table),
        });
      }

      nextSeenCounts[tableNo] = pendingCount;
    });

    seenPendingCountsRef.current = nextSeenCounts;
    Object.entries(nextSeenCounts).forEach(([tableNo, count]) => {
      writeSeenPendingCount(tableNo, count);
    });

    if (newAlerts.length) {
      const newestAlert =
        newAlerts.length === 1
          ? newAlerts[0]
          : {
              table_no: newAlerts[0].table_no,
              table_name: newAlerts[0].table_name,
              table_count: newAlerts.length,
              pending_item_count: newAlerts.reduce((sum, alert) => sum + toNumber(alert.pending_item_count), 0),
              pending_total: newAlerts.reduce((sum, alert) => sum + toNumber(alert.pending_total), 0),
            };

      setPendingToast(newestAlert);

    }
  }, [tables]);

  function markTablePendingSeen(tableNo, count = 0) {
    if (!tableNo) return;

    const nextSeenCounts = {
      ...seenPendingCountsRef.current,
      [tableNo]: toNumber(count),
    };

    seenPendingCountsRef.current = nextSeenCounts;
    writeSeenPendingCount(tableNo, nextSeenCounts[tableNo]);
  }

  function handleOpenPendingTable(tableNo) {
    const table = tablesRef.current.find((row) => row.table_no === tableNo);

    if (!table) return;

    setPendingToast(null);
    void handleSelectTable(table, { focusPending: true });
  }

  async function handleSelectTable(table, options = {}) {
    setIsWorking(true);
    setError('');
    setRefreshWarning('');
    setCart([]);

    try {
      const result =
        table.status === 'AVAILABLE'
          ? await openTable({ table_no: table.table_no, created_by: 'STAFF' })
          : await getTableOrder({ table_no: table.table_no });

      if (!result.success) throw new Error(result.message || 'Cannot open table');

      if (!isMountedRef.current || getCurrentRoutePath() !== '/tables') {
        return;
      }

      setSelectedDetail(result);
      markTablePendingSeen(table.table_no, result.pending_totals?.item_count || 0);

      if (table.status === 'AVAILABLE' && result.order) {
        commitTablesOptimistically((currentTables) => markTableOrderActive(currentTables, result));
      }

      if (options.focusPending) {
        window.setTimeout(() => {
          pendingSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 50);
      }
    } catch (selectError) {
      if (isMountedRef.current) {
        setError(selectError.message || 'Cannot open table');
      }
    } finally {
      if (isMountedRef.current) {
        setIsWorking(false);
      }
    }
  }

  function openFocusedPendingTable() {
    if (!tables.length || isWorking || isPayingTable || isClearingTable) {
      return;
    }

    const tableNo = peekPendingTableFocus();

    if (!tableNo) {
      return;
    }

    const table = tablesRef.current.find((row) => row.table_no === tableNo);

    if (!table) {
      return;
    }

    consumePendingTableFocus();
    setPendingToast(null);
    void handleSelectTable(table, { focusPending: true });
  }

  React.useEffect(() => {
    openFocusedPendingTable();
  }, [isClearingTable, isPayingTable, isWorking, tables]);

  React.useEffect(() => {
    const handleFocusPendingTable = () => {
      openFocusedPendingTable();
    };

    window.addEventListener(QR_PENDING_FOCUS_EVENT, handleFocusPendingTable);
    return () => window.removeEventListener(QR_PENDING_FOCUS_EVENT, handleFocusPendingTable);
  }, [isClearingTable, isPayingTable, isWorking, tables]);

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

  async function handleAddItems() {
    const orderId = selectedDetail?.order?.order_id;

    if (!orderId || !cart.length) return;

    setIsWorking(true);
    setError('');
    setRefreshWarning('');

    try {
      const result = await addItemsToTableOrder({
        order_id: orderId,
        created_by: 'STAFF',
        items: cart.map((item) => ({
          menu_id: item.menu_id,
          quantity: item.quantity,
          note: item.note,
          discount: 0,
        })),
      });

      if (!result.success) throw new Error(result.message || 'ADD_ITEMS_TO_TABLE_ORDER failed');

      if (!isMountedRef.current || getCurrentRoutePath() !== '/tables') {
        return;
      }

      setSelectedDetail(result);
      setCart([]);
      commitTablesOptimistically((currentTables) => markTableOrderActive(currentTables, result));
    } catch (addError) {
      if (isMountedRef.current) {
        setError(addError.message || 'Cannot add items');
      }
    } finally {
      if (isMountedRef.current) {
        setIsWorking(false);
      }
    }
  }

  async function handleConfirmPendingItems(itemIds) {
    const orderId = selectedDetail?.order?.order_id;

    if (!orderId || isWorking || isPayingTable) return;

    setIsWorking(true);
    setError('');
    setRefreshWarning('');

    try {
      const result = await confirmTablePendingItems({
        order_id: orderId,
        item_ids: itemIds,
        confirmed_by: 'STAFF',
      });

      if (!result.success) throw new Error(result.message || 'CONFIRM_TABLE_PENDING_ITEMS failed');

      if (!isMountedRef.current || getCurrentRoutePath() !== '/tables') {
        return;
      }

      setSelectedDetail(result);
      markTablePendingSeen(result.table?.table_no, result.pending_totals?.item_count || 0);
      commitTablesOptimistically((currentTables) => markTableOrderActive(currentTables, result));
      setPendingToast(null);
    } catch (confirmError) {
      if (isMountedRef.current) {
        setError(confirmError.message || 'Cannot confirm QR items');
      }
    } finally {
      if (isMountedRef.current) {
        setIsWorking(false);
      }
    }
  }

  function openClearTableModal() {
    if (!canClearSelectedTable) return;

    setClearReason('');
    setClearConfirm('');
    setError('');
    setIsClearModalOpen(true);
  }

  function closeClearTableModal() {
    if (isClearingTable) return;

    setIsClearModalOpen(false);
    setClearReason('');
    setClearConfirm('');
  }

  async function handleClearTable() {
    const orderId = selectedDetail?.order?.order_id;
    const tableNo = selectedDetail?.table?.table_no;

    if (!orderId || !tableNo || !canClearSelectedTable || isClearingTable) return;

    if (clearConfirm.trim().toUpperCase() !== 'CLEAR') {
      setError('กรุณาพิมพ์ CLEAR เพื่อยืนยันการเคลียร์โต๊ะ');
      return;
    }

    setIsClearingTable(true);
    setIsWorking(true);
    setError('');
    setRefreshWarning('');

    try {
      const result = await clearTableOrder({
        table_no: tableNo,
        order_id: orderId,
        reason: clearReason,
        cleared_by: 'STAFF',
      });

      if (!isMountedRef.current || getCurrentRoutePath() !== '/tables') {
        return;
      }

      if (!result.success) throw new Error(result.message || 'CLEAR_TABLE_ORDER failed');

      const clearedTableNo = result.table?.table_no || tableNo;

      markTablePendingSeen(clearedTableNo, 0);
      commitTablesOptimistically((currentTables) =>
        markClearedTableAvailable(currentTables, selectedDetail, result.order, orderId),
      );
      setSelectedDetail(null);
      setCart([]);
      setPendingToast(null);
      setIsClearModalOpen(false);
      setClearReason('');
      setClearConfirm('');
      setClearSuccess(`เคลียร์โต๊ะ ${clearedTableNo} แล้ว`);
      void forceRefreshTables({ showLoading: false, silentError: true });
    } catch (clearError) {
      if (isMountedRef.current) {
        setError(clearError.message || 'Cannot clear table');
      }
    } finally {
      if (isMountedRef.current) {
        setIsClearingTable(false);
        setIsWorking(false);
      }
    }
  }

  async function handlePayTable() {
    const orderId = selectedDetail?.order?.order_id;

    if (!orderId || selectedTotal <= 0 || isWorking || isPayingTable) return;

    if (selectedPendingItems.length) {
      setError('ยังมีรายการใหม่จาก QR ที่ยังไม่ได้รับเข้าบิล');
      return;
    }

    setIsPayingTable(true);
    setTablePaymentStep(0);
    setIsWorking(true);
    setError('');
    setRefreshWarning('');

    try {
      const receivedAmount = paymentMethod === 'CASH' ? toNumber(received || selectedTotal) : selectedTotal;
      const result = await payTableOrder({
        order_id: orderId,
        method: paymentMethod,
        amount: selectedTotal,
        received: receivedAmount,
        reference: '',
        created_by: 'STAFF',
      });

      if (!isMountedRef.current || getCurrentRoutePath() !== '/tables') {
        return;
      }

      if (!result.success) throw new Error(result.message || 'PAY_TABLE_ORDER failed');

      saveReceiptDetail(result.order.order_id, {
        ...result,
        payments: result.payment ? [result.payment] : [],
      });

      commitTablesOptimistically((currentTables) => markPaidTableAvailable(currentTables, selectedDetail, result.order, orderId));

      setTablePaymentStep(4);
      setSelectedDetail(null);
      setCart([]);
      void forceRefreshTables({ showLoading: false, silentError: true });
      navigateTo(`/receipt/${encodeURIComponent(result.order.order_id)}`);
    } catch (payError) {
      if (isMountedRef.current) {
        setError(payError.message || 'Cannot pay table');
      }
    } finally {
      if (isMountedRef.current) {
        setIsWorking(false);
        setIsPayingTable(false);
      }
    }
  }

  async function handleGenerateQrLinks() {
    setIsWorking(true);
    setError('');

    try {
      const baseUrl = PRODUCTION_ORDER_URL;
      const result = await getTableQrLinks(baseUrl);

      if (!result.success) throw new Error(result.message || 'GET_TABLE_QR_LINKS failed');

      if (!isMountedRef.current || getCurrentRoutePath() !== '/tables') {
        return;
      }

      const cards = await Promise.all(
        (result.qr_links || []).map(async (link) => ({
          ...link,
          qr_image: await QRCode.toDataURL(link.qr_url, {
            width: 220,
            margin: 1,
            errorCorrectionLevel: 'M',
          }),
        })),
      );

      if (!isMountedRef.current || getCurrentRoutePath() !== '/tables') {
        return;
      }

      setQrCards(cards);
      setShowQrCards(true);
    } catch (qrError) {
      if (isMountedRef.current) {
        setError(qrError.message || 'Cannot generate table QR');
      }
    } finally {
      if (isMountedRef.current) {
        setIsWorking(false);
      }
    }
  }

  return (
    <AppShell
      title="Tables"
      subtitle="จัดการโต๊ะและออเดอร์หน้าร้าน"
      actions={
        <>
          <Button onClick={handleGenerateQrLinks} disabled={isWorking}>
            <QrCode size={18} />
            Generate table QR
          </Button>
          <Button
            onClick={() => {
              if (import.meta.env.DEV) {
                console.log('[Tables] manual refresh started');
              }
              forceRefreshTables({ showLoading: false });
            }}
            disabled={isLoading || isRefreshingTables}
          >
            <RefreshCw size={18} className={isLoading || isRefreshingTables ? 'animate-spin' : ''} />
            Refresh
          </Button>
        </>
      }
    >
      <style>
        {`
          @media print {
            body * { visibility: hidden; }
            .table-qr-print, .table-qr-print * { visibility: visible; }
            .table-qr-print { position: absolute; inset: 0; background: white; padding: 16px; }
          }
        `}
      </style>

      {error ? (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700 shadow-sm">
          <AlertTriangle className="mt-0.5 shrink-0" size={18} />
          <span>{error}</span>
        </div>
      ) : null}

      {!error && refreshWarning ? (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800 shadow-sm">
          <AlertTriangle className="mt-0.5 shrink-0" size={18} />
          <span>{refreshWarning}</span>
        </div>
      ) : null}

      {pendingTables.length ? (
        <section className="mb-4 rounded-[28px] border border-amber-300 bg-gradient-to-r from-amber-50 to-rose-50 p-4 shadow-xl shadow-amber-900/10">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-md shadow-amber-900/20">
                <BellRing size={20} />
              </span>
              <div>
                <h2 className="text-lg font-black text-stone-950">
                  มีรายการใหม่จาก QR {pendingTables.length} โต๊ะ
                </h2>
                <p className="text-sm font-semibold text-amber-800">
                  กดเลือกโต๊ะเพื่อรับรายการเข้าบิลก่อนชำระเงิน
                </p>
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {pendingTables.map((table) => (
              <button
                key={table.table_no}
                type="button"
                onClick={() => handleOpenPendingTable(table.table_no)}
                className="rounded-2xl bg-white px-3 py-2 text-sm font-black text-rose-700 shadow-sm ring-1 ring-rose-200 transition hover:bg-rose-50"
              >
                {table.table_no}: {formatMoney(getTablePendingCount(table))} รายการ
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {pendingToast ? (
        <div className="fixed right-4 top-4 z-50 w-[min(360px,calc(100vw-32px))] rounded-[26px] border border-amber-300 bg-white p-4 shadow-2xl shadow-stone-950/20">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-white">
              <BellRing size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-black text-stone-950">
                {pendingToast.table_count
                  ? `มีรายการใหม่จาก QR ${formatMoney(pendingToast.table_count)} โต๊ะ`
                  : `โต๊ะ ${pendingToast.table_no} มีรายการใหม่จาก QR ${formatMoney(pendingToast.pending_item_count)} รายการ`}
              </p>
              <p className="mt-1 text-sm font-semibold text-stone-500">
                ยอดรอยืนยัน ฿{formatMoney(pendingToast.pending_total)}
              </p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="dark" onClick={() => handleOpenPendingTable(pendingToast.table_no)}>
                  {pendingToast.table_count ? 'เปิดโต๊ะแรก' : 'เปิดดู'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPendingToast(null)}>
                  ปิด
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {clearSuccess ? (
        <div className="fixed right-4 top-4 z-50 w-[min(340px,calc(100vw-32px))] rounded-[24px] border border-emerald-200 bg-white p-4 text-sm font-black text-emerald-700 shadow-2xl shadow-stone-950/20">
          <div className="flex items-center justify-between gap-3">
            <span>{clearSuccess}</span>
            <button type="button" onClick={() => setClearSuccess('')} className="text-stone-400 hover:text-stone-950">
              ปิด
            </button>
          </div>
        </div>
      ) : null}

      {isClearModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-950/50 px-4 py-5 backdrop-blur-sm sm:items-center">
          <section className="w-full max-w-md overflow-hidden rounded-[28px] border border-rose-200 bg-white shadow-2xl shadow-stone-950/25">
            <div className="border-b border-rose-100 bg-rose-50 p-5">
              <div className="flex items-start gap-3">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-600 text-white">
                  <AlertTriangle size={20} />
                </span>
                <div>
                  <h2 className="text-xl font-black text-stone-950">
                    เคลียร์โต๊ะ {selectedDetail?.table?.table_no}?
                  </h2>
                  <p className="mt-1 text-sm font-bold text-rose-700">
                    รายการทั้งหมดในโต๊ะนี้จะถูกยกเลิก โต๊ะจะกลับเป็นว่าง และจะไม่บันทึกเป็นยอดขาย
                  </p>
                </div>
              </div>
            </div>
            <div className="space-y-4 p-5">
              <label className="block text-xs font-bold uppercase tracking-wide text-stone-500">
                Reason
                <Input
                  as="textarea"
                  value={clearReason}
                  onChange={(event) => setClearReason(event.target.value)}
                  rows={2}
                  placeholder="optional reason"
                  className="mt-1 w-full resize-none rounded-2xl border-[#eadbc9]"
                  disabled={isClearingTable}
                />
              </label>
              <label className="block text-xs font-bold uppercase tracking-wide text-stone-500">
                Type CLEAR to confirm
                <Input
                  value={clearConfirm}
                  onChange={(event) => setClearConfirm(event.target.value)}
                  placeholder="CLEAR"
                  className="mt-1 w-full rounded-2xl border-rose-200"
                  disabled={isClearingTable}
                />
              </label>
            </div>
            <div className="flex gap-3 border-t border-rose-100 bg-[#fffaf3] p-5">
              <Button
                onClick={closeClearTableModal}
                disabled={isClearingTable}
                variant="subtle"
                size="lg"
                className="flex-1 rounded-2xl"
              >
                ยกเลิก
              </Button>
              <Button
                onClick={handleClearTable}
                disabled={isClearingTable || clearConfirm.trim().toUpperCase() !== 'CLEAR'}
                variant="danger"
                size="lg"
                className="flex-1 rounded-2xl"
              >
                {isClearingTable ? 'กำลังเคลียร์...' : 'ยืนยันเคลียร์โต๊ะ'}
              </Button>
            </div>
          </section>
        </div>
      ) : null}

      {showQrCards ? (
        <section className="table-qr-print mb-5 rounded-[30px] border border-[#eadbc9] bg-white/90 p-4 shadow-xl shadow-stone-900/5">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-black text-stone-950">Table QR codes</h2>
              <p className="text-sm font-semibold text-stone-500">พิมพ์ QR สำหรับติดบนโต๊ะ หลัง deploy ให้ใช้ URL GitHub Pages จริง</p>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => window.print()}>
                <Printer size={18} />
                Print
              </Button>
              <Button onClick={() => setShowQrCards(false)} variant="ghost">
                Close
              </Button>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {qrCards.map((card) => (
              <div key={card.table_no} className="break-inside-avoid rounded-[24px] border border-[#eadbc9] bg-white p-4 text-center shadow-sm">
                <img src={card.qr_image} alt={`${card.table_name} QR`} className="mx-auto h-40 w-40" />
                <p className="mt-3 text-lg font-black text-stone-950">{card.table_name}</p>
                <p className="mt-1 break-all text-[10px] font-semibold text-stone-500">{card.qr_url}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_520px]">
        <section className="space-y-5">
          <div className="rounded-[30px] border border-[#eadbc9] bg-white/85 p-4 shadow-2xl shadow-stone-900/5 backdrop-blur">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-stone-950">โต๊ะทั้งหมด</h2>
                <p className="text-sm font-semibold text-stone-500">คลิกโต๊ะเพื่อเปิดบิลหรือดูออเดอร์</p>
                {isRefreshingTables ? (
                  <p className="mt-1 text-xs font-bold text-stone-500">กำลังอัปเดตข้อมูล...</p>
                ) : null}
              </div>
              <StatusBadge tone="coffee">{tables.length} tables</StatusBadge>
            </div>

            <div className="mb-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-[22px] border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-xs font-bold text-emerald-700">โต๊ะว่าง</p>
                <p className="mt-1 text-2xl font-black text-emerald-800">{tableSummary.available}</p>
              </div>
              <div className="rounded-[22px] border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-bold text-amber-700">กำลังใช้งาน</p>
                <p className="mt-1 text-2xl font-black text-amber-800">{tableSummary.occupied}</p>
              </div>
              <div className="rounded-[22px] border border-indigo-200 bg-indigo-50 p-3">
                <p className="text-xs font-bold text-indigo-700">รอชำระ</p>
                <p className="mt-1 text-2xl font-black text-indigo-800">{tableSummary.readyToPay}</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {isLoading
                ? Array.from({ length: 10 }).map((_, index) => (
                    <div key={index} className="h-44 animate-pulse rounded-[26px] bg-stone-100" />
                  ))
                : tables.map((table) => (
                    <button
                      key={table.table_id || table.table_no}
                      type="button"
                      onClick={() => handleSelectTable(table)}
                      className={tableCardClass(
                        table.status,
                        selectedDetail?.table?.table_no === table.table_no,
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xl font-black text-stone-950">{table.table_name}</p>
                          <p className="text-xs font-bold text-stone-500">{table.table_no}</p>
                        </div>
                        <StatusBadge tone={statusTone(table.status)}>{statusLabel(table.status)}</StatusBadge>
                      </div>
                      {getTablePendingCount(table) > 0 ? (
                        <div className="mt-3 inline-flex rounded-full bg-rose-600 px-3 py-1 text-xs font-black text-white shadow-md shadow-rose-900/20">
                          รายการใหม่ {formatMoney(getTablePendingCount(table))}
                        </div>
                      ) : null}
                      {table.order ? (
                        <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                          <div className="rounded-2xl bg-white/80 p-2 shadow-sm">
                            <p className="text-xs font-bold text-stone-500">ยอด</p>
                            <p className="text-lg font-black">฿{formatMoney(table.order.total)}</p>
                          </div>
                          <div className="rounded-2xl bg-white/80 p-2 shadow-sm">
                            <p className="text-xs font-bold text-stone-500">รายการ</p>
                            <p className="text-lg font-black">{formatMoney(table.order.item_count)}</p>
                          </div>
                          {formatShortTime(table.order.created_at) ? (
                            <div className="col-span-2 rounded-2xl bg-white/70 p-2 text-xs font-bold text-stone-500">
                              เปิดเมื่อ {formatShortTime(table.order.created_at)}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="mt-4 rounded-2xl bg-white/75 p-3 text-sm font-bold text-emerald-700 shadow-sm">
                          พร้อมเปิดโต๊ะ
                        </div>
                      )}
                    </button>
                  ))}
            </div>
          </div>

          <div className="rounded-[30px] border border-[#eadbc9] bg-white/85 p-4 shadow-2xl shadow-stone-900/5 backdrop-blur">
            <div className="flex flex-col gap-4 rounded-[24px] border border-[#eadbc9] bg-[#fffaf3] p-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-xl font-black text-stone-950">เพิ่มรายการเข้าโต๊ะ</h2>
                <p className="text-sm font-semibold text-stone-500">เพิ่มเมนูแล้วกดบันทึกเข้าออเดอร์โต๊ะ ยังไม่ตัดสต็อก</p>
              </div>
              <div className="relative w-full lg:w-[360px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search menu"
                  className="w-full rounded-2xl border-[#eadbc9] pl-10"
                />
              </div>
            </div>

            <div className="mt-4">
              <CategoryTabs categories={categories} activeCategory={activeCategory} onChange={setActiveCategory} />
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {visibleMenus.map((menu) => (
                <button
                  key={menu.menu_id}
                  type="button"
                  disabled={!selectedDetail?.order}
                  onClick={() => addToCart(menu)}
                  className="flex items-center justify-between gap-3 rounded-[22px] border border-[#eadbc9] bg-white p-3 text-left shadow-sm shadow-stone-900/5 transition hover:-translate-y-0.5 hover:border-[#d9c2aa] hover:bg-[#fffaf3] hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <div className="min-w-0">
                    <p className="line-clamp-2 font-black text-stone-950">{menu.menu_name}</p>
                    <p className="mt-1 text-sm font-black text-[#6f4e37]">฿{formatMoney(menu.base_price)}</p>
                  </div>
                  <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#0f0b08] text-white">
                    <Plus size={20} />
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <aside className="space-y-4 2xl:sticky 2xl:top-5 2xl:max-h-[calc(100vh-40px)] 2xl:overflow-y-auto">
          <section className="rounded-[26px] border border-[#eadbc9] bg-white p-4 shadow-xl shadow-stone-900/5">
            {selectedDetail?.order ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-stone-500">{selectedDetail.table?.table_name}</p>
                    <h2 className="text-xl font-black text-stone-950">{selectedDetail.order.order_no}</h2>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <StatusBadge tone="coffee">UNPAID</StatusBadge>
                    {canClearSelectedTable ? (
                      <Button
                        onClick={openClearTableModal}
                        disabled={isWorking || isPayingTable || isClearingTable}
                        variant="danger"
                        className="rounded-2xl"
                      >
                        <XCircle size={16} />
                        เคลียร์โต๊ะ
                      </Button>
                    ) : null}
                  </div>
                </div>

                {selectedPendingItems.length ? (
                  <section
                    ref={pendingSectionRef}
                    className="mt-4 rounded-[24px] border border-amber-300 bg-amber-50 p-3 shadow-sm shadow-amber-900/10"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-base font-black text-amber-950">รายการใหม่จาก QR</h3>
                        <p className="text-xs font-bold text-amber-800">
                          ยังไม่รวมในยอดบิล ต้องรับเข้าบิลก่อนชำระเงิน
                        </p>
                      </div>
                      <StatusBadge tone="warning">{formatMoney(selectedPendingCount)} รายการ</StatusBadge>
                    </div>
                    <div className="mt-3 space-y-2">
                      {selectedPendingItems.map((item) => (
                        <div key={item.item_id} className="rounded-2xl border border-amber-200 bg-white p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-black text-stone-950">{item.menu_name_snapshot}</p>
                              <p className="text-xs font-semibold text-stone-500">
                                x{item.quantity} · ฿{formatMoney(item.unit_price)}
                              </p>
                              {item.note ? <p className="mt-1 text-xs font-semibold text-amber-700">{item.note}</p> : null}
                            </div>
                            <p className="font-black">฿{formatMoney(item.total)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <Button
                      onClick={() => handleConfirmPendingItems()}
                      disabled={isWorking || isPayingTable}
                      variant="success"
                      size="lg"
                      className="mt-3 w-full rounded-2xl"
                    >
                      <CheckCircle2 size={18} />
                      รับทั้งหมดเข้าบิล
                    </Button>
                  </section>
                ) : null}

                <h3 className="mt-4 text-sm font-black text-stone-700">รายการในบิล</h3>
                <div className="mt-4 max-h-[320px] space-y-2 overflow-y-auto pr-1">
                  {(selectedDetail.items || []).length ? (
                    selectedDetail.items.map((item) => (
                      <div key={item.item_id} className="flex items-start justify-between gap-3 rounded-2xl border border-[#eadbc9] bg-[#fffaf3] p-3">
                        <div className="min-w-0">
                          <p className="font-black text-stone-950">{item.menu_name_snapshot}</p>
                          <p className="text-xs font-semibold text-stone-500">x{item.quantity} · ฿{formatMoney(item.unit_price)}</p>
                          {item.note ? <p className="mt-1 text-xs font-semibold text-amber-700">{item.note}</p> : null}
                        </div>
                        <p className="font-black">฿{formatMoney(item.total)}</p>
                      </div>
                    ))
                  ) : (
                    <div className="flex h-28 items-center justify-center rounded-2xl border border-dashed border-[#d8c2a9] bg-[#fffaf3] text-sm font-bold text-stone-400">
                      ยังไม่มีรายการในโต๊ะ
                    </div>
                  )}
                </div>

                <div className="mt-4 rounded-[20px] bg-[#0f0b08] px-4 py-3 text-white shadow-lg shadow-stone-950/10">
                  <div className="flex items-center justify-between">
                    <span className="font-black">ยอดรวมโต๊ะ</span>
                    <span className="text-2xl font-black">฿{formatMoney(selectedTotal)}</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex h-48 flex-col items-center justify-center rounded-[22px] border border-dashed border-[#d8c2a9] bg-[#fffaf3] text-center text-sm font-bold text-stone-400">
                <Utensils size={34} />
                <p className="mt-2">เลือกโต๊ะเพื่อเริ่มจัดการออเดอร์</p>
              </div>
            )}
          </section>

          <section className="rounded-[26px] border border-[#eadbc9] bg-white p-4 shadow-xl shadow-stone-900/5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-stone-950">รายการรอเพิ่ม</h2>
                <p className="text-xs font-semibold text-stone-500">บันทึกเข้าโต๊ะก่อนชำระเงิน</p>
              </div>
              <StatusBadge tone={cart.length ? 'warning' : 'neutral'}>{cart.length}</StatusBadge>
            </div>

            <div className="max-h-[300px] space-y-3 overflow-y-auto pr-1">
              {cart.length ? (
                cart.map((item) => (
                  <div key={item.cart_id} className="rounded-[22px] border border-[#eadbc9] bg-white p-3 shadow-sm shadow-stone-900/5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-black text-stone-950">{item.menu_name}</p>
                        <p className="text-xs font-semibold text-stone-500">฿{formatMoney(item.unit_price)}</p>
                      </div>
                      <p className="font-black">฿{formatMoney(item.total)}</p>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <div className="flex items-center rounded-2xl bg-[#f4ede6] p-1">
                        <button
                          type="button"
                          onClick={() => updateCartItem(item.cart_id, { quantity: item.quantity - 1 })}
                          className="h-10 w-10 rounded-xl hover:bg-white"
                        >
                          <Minus className="mx-auto" size={16} />
                        </button>
                        <span className="w-10 text-center font-black">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateCartItem(item.cart_id, { quantity: item.quantity + 1 })}
                          className="h-10 w-10 rounded-xl hover:bg-white"
                        >
                          <Plus className="mx-auto" size={16} />
                        </button>
                      </div>
                    </div>
                    <Input
                      value={item.note}
                      onChange={(event) => updateCartItem(item.cart_id, { note: event.target.value })}
                      placeholder="Item note"
                      className="mt-3 h-10 w-full rounded-xl border-[#eadbc9] bg-[#fffaf6] text-xs"
                    />
                  </div>
                ))
              ) : (
                <div className="flex h-28 flex-col items-center justify-center rounded-2xl border border-dashed border-[#d8c2a9] bg-[#fffaf3] text-center text-sm font-bold text-stone-400">
                  <ShoppingBag size={26} />
                  <p className="mt-2">ยังไม่มีรายการรอเพิ่ม</p>
                </div>
              )}
            </div>

            <div className="mt-4 flex items-center justify-between rounded-[20px] bg-[#fffaf3] p-3">
              <span className="font-black text-stone-700">ยอดรอเพิ่ม</span>
              <span className="text-xl font-black text-stone-950">฿{formatMoney(pendingTotals.total)}</span>
            </div>
            <Button
              onClick={handleAddItems}
              disabled={!selectedDetail?.order || !cart.length || isWorking}
              variant="success"
              size="lg"
              className="mt-3 w-full"
            >
              <CheckCircle2 size={18} />
              บันทึกเข้าโต๊ะ
            </Button>
          </section>

          {selectedDetail?.order ? (
            <>
            {selectedPendingItems.length ? (
              <div className="rounded-[24px] border border-amber-200 bg-amber-50 p-4 text-sm font-black text-amber-800 shadow-sm">
                ยังมีรายการใหม่จาก QR ที่ยังไม่ได้รับเข้าบิล
              </div>
            ) : null}
            <PaymentPanel
              total={selectedTotal}
              method={paymentMethod}
              received={received}
              settings={settings}
              settingsWarnings={settingsWarnings}
              isBusy={isPayingTable}
              busyLabel={tablePaymentMessages[tablePaymentStep]}
              busyHint={isSlowTablePayment ? 'ระบบกำลังบันทึกข้อมูล กรุณาอย่าปิดหน้านี้' : ''}
              canSubmit={selectedTotal > 0 && !isWorking && !selectedPendingItems.length}
              onMethodChange={setPaymentMethod}
              onReceivedChange={setReceived}
              onSubmit={handlePayTable}
            />
            </>
          ) : null}
        </aside>
      </div>
    </AppShell>
  );
}
