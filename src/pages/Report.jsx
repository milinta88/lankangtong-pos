import React from 'react';
import { AlertTriangle, Banknote, CalendarDays, CreditCard, ExternalLink, Eye, Loader2, RefreshCw, ReceiptText, ShoppingBag, Trophy, WalletCards, X } from 'lucide-react';
import { getCachedDailyReportResponse, getDailyReport, getOrderDetail, getRecentOrders } from '../services/api.js';
import { navigateTo } from '../App.jsx';
import { saveReceiptDetail } from '../services/receiptCache.js';
import AppShell from '../components/AppShell.jsx';
import Button from '../components/Button.jsx';
import Input from '../components/Input.jsx';
import StatCard from '../components/StatCard.jsx';
import StatusBadge from '../components/StatusBadge.jsx';

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

function formatNumber(value) {
  return new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(toNumber(value));
}

function getTodayInputValue() {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function methodLabel(method) {
  const normalized = String(method || '').toUpperCase();
  const labels = {
    CASH: 'เงินสด',
    TRANSFER: 'โอน',
    QR: 'QR',
    CARD: 'Card',
    UNKNOWN: 'ไม่ระบุ',
    OTHER: 'อื่นๆ',
  };

  return labels[normalized] || normalized || '-';
}

function methodTone(method) {
  const normalized = String(method || '').toUpperCase();
  if (normalized === 'CASH') return 'success';
  if (normalized === 'TRANSFER' || normalized === 'QR' || normalized === 'CARD') return 'warning';
  return 'neutral';
}

function statusTone(status, paymentStatus) {
  const normalizedStatus = String(status || '').toUpperCase();
  const normalizedPaymentStatus = String(paymentStatus || '').toUpperCase();

  if (normalizedStatus === 'PAID' || normalizedPaymentStatus === 'PAID') return 'success';
  if (normalizedStatus === 'CANCELLED' || normalizedPaymentStatus === 'CANCELLED') return 'danger';
  if (normalizedPaymentStatus === 'UNPAID') return 'warning';
  return 'neutral';
}

function statusLabel(status, paymentStatus) {
  const normalizedStatus = String(status || '').toUpperCase();
  const normalizedPaymentStatus = String(paymentStatus || '').toUpperCase();

  if (normalizedStatus === 'PAID' || normalizedPaymentStatus === 'PAID') return 'ชำระแล้ว';
  if (normalizedStatus === 'CANCELLED' || normalizedPaymentStatus === 'CANCELLED') return 'ยกเลิก';
  if (normalizedPaymentStatus === 'UNPAID') return 'ยังไม่ชำระ';
  return normalizedStatus || normalizedPaymentStatus || '-';
}

function orderTypeLabel(order) {
  const orderType = String(order?.order_type || '').toUpperCase();

  if (orderType === 'DINE_IN') {
    return order?.table_no ? `ทานที่ร้าน / ${order.table_no}` : 'ทานที่ร้าน';
  }

  if (orderType === 'TAKEAWAY') return 'กลับบ้าน';
  return orderType || '-';
}

function getLatestPayment(payments) {
  if (!Array.isArray(payments) || !payments.length) return null;

  return payments
    .slice()
    .sort((left, right) => {
      const leftTime = new Date(left.paid_at || left.created_at || 0).getTime();
      const rightTime = new Date(right.paid_at || right.created_at || 0).getTime();
      return rightTime - leftTime;
    })[0];
}

function EmptyState({ children }) {
  return (
    <div className="flex h-40 items-center justify-center rounded-[22px] border border-dashed border-[#d8c2a9] bg-[#fffaf3] text-sm font-bold text-stone-400">
      {children}
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="grid gap-3 p-4">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="h-12 animate-pulse rounded-2xl bg-stone-100" />
      ))}
    </div>
  );
}

function emptyReportForDate(businessDate) {
  return {
    business_date: businessDate,
    summary: {},
    top_items: [],
    recent_orders: [],
    payment_summary: [],
  };
}

function normalizeReportResult(result, businessDate) {
  return {
    business_date: result.business_date || businessDate,
    summary: result.summary || {},
    top_items: result.top_items || [],
    recent_orders: result.recent_orders || [],
    payment_summary: result.payment_summary || [],
  };
}

function BillDetailModal({ detail, isLoading, error, onClose, onOpenReceipt }) {
  const order = detail?.order || {};
  const items = Array.isArray(detail?.items) ? detail.items : [];
  const payments = Array.isArray(detail?.payments) ? detail.payments : [];
  const latestPayment = getLatestPayment(payments);
  const totals = detail?.totals || {
    subtotal: order.subtotal,
    discount: order.discount,
    total: order.total,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/50 p-4">
      <div className="max-h-[88vh] w-full max-w-3xl overflow-hidden rounded-[30px] border border-[#eadbc9] bg-[#fffaf6] shadow-2xl shadow-stone-950/30">
        <div className="flex items-start justify-between gap-4 border-b border-[#eadbc9] bg-white/80 p-5">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#8a6a4f]">รายละเอียดบิล</p>
            <h2 className="mt-1 text-2xl font-black text-stone-950">
              {order.order_no || order.order_id || 'กำลังโหลด...'}
            </h2>
            {order.order_id ? (
              <p className="mt-1 text-xs font-semibold text-stone-500">{order.order_id}</p>
            ) : null}
          </div>
          <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close bill detail">
            <X size={18} />
          </Button>
        </div>

        <div className="max-h-[calc(88vh-92px)] overflow-y-auto p-5">
          {isLoading ? (
            <div className="flex h-60 items-center justify-center rounded-[24px] border border-[#eadbc9] bg-white">
              <Loader2 className="animate-spin text-[#6f4e37]" size={30} />
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">
              {error}
            </div>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-[22px] border border-[#eadbc9] bg-white p-4">
                  <p className="text-xs font-bold uppercase text-stone-400">เวลา</p>
                  <p className="mt-1 font-black text-stone-950">{formatDateTime(order.closed_at || latestPayment?.paid_at || order.created_at)}</p>
                </div>
                <div className="rounded-[22px] border border-[#eadbc9] bg-white p-4">
                  <p className="text-xs font-bold uppercase text-stone-400">ประเภท</p>
                  <p className="mt-1 font-black text-stone-950">{orderTypeLabel(order)}</p>
                </div>
                <div className="rounded-[22px] border border-[#eadbc9] bg-white p-4">
                  <p className="text-xs font-bold uppercase text-stone-400">ชำระเงิน</p>
                  <div className="mt-2">
                    <StatusBadge tone={methodTone(latestPayment?.method)}>{methodLabel(latestPayment?.method)}</StatusBadge>
                  </div>
                </div>
                <div className="rounded-[22px] border border-[#eadbc9] bg-white p-4">
                  <p className="text-xs font-bold uppercase text-stone-400">สถานะ</p>
                  <div className="mt-2">
                    <StatusBadge tone={statusTone(order.status, order.payment_status)}>
                      {statusLabel(order.status, order.payment_status)}
                    </StatusBadge>
                  </div>
                </div>
              </div>

              <div className="mt-4 overflow-hidden rounded-[24px] border border-[#eadbc9] bg-white shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px] text-left text-sm">
                    <thead className="bg-[#f6efe7] text-xs uppercase text-[#7a5b43]">
                      <tr>
                        <th className="px-4 py-3">สินค้า</th>
                        <th className="px-4 py-3 text-right">จำนวน</th>
                        <th className="px-4 py-3 text-right">ราคา</th>
                        <th className="px-4 py-3 text-right">รวม</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={item.item_id || `${item.menu_id}-${item.menu_name_snapshot}`} className="border-t border-[#eadbc9]">
                          <td className="px-4 py-3 align-top">
                            <p className="font-black text-stone-950">{item.menu_name_snapshot || item.menu_name || item.menu_id}</p>
                            {item.note ? <p className="mt-1 text-xs font-semibold text-stone-500">{item.note}</p> : null}
                            {item.status ? <p className="mt-1 text-[11px] font-bold uppercase text-stone-400">{item.status}</p> : null}
                          </td>
                          <td className="px-4 py-3 text-right font-black align-top">{formatNumber(item.quantity)}</td>
                          <td className="px-4 py-3 text-right font-bold align-top">฿{formatMoney(item.unit_price)}</td>
                          <td className="px-4 py-3 text-right font-black text-[#4b3020] align-top">฿{formatMoney(item.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!items.length ? <EmptyState>ไม่มีรายการสินค้าในบิลนี้</EmptyState> : null}
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_280px]">
                <div className="rounded-[24px] border border-[#eadbc9] bg-white p-4">
                  <h3 className="font-black text-stone-950">การชำระเงิน</h3>
                  {payments.length ? (
                    <div className="mt-3 space-y-2">
                      {payments.map((payment) => (
                        <div key={payment.payment_id || payment.paid_at} className="flex items-center justify-between gap-3 rounded-2xl bg-[#fffaf3] p-3 text-sm">
                          <div>
                            <StatusBadge tone={methodTone(payment.method)}>{methodLabel(payment.method)}</StatusBadge>
                            <p className="mt-1 text-xs font-semibold text-stone-500">{formatDateTime(payment.paid_at || payment.created_at)}</p>
                          </div>
                          <div className="text-right font-black text-stone-950">
                            <p>฿{formatMoney(payment.amount)}</p>
                            <p className="text-xs text-stone-500">รับ ฿{formatMoney(payment.received)} / ทอน ฿{formatMoney(payment.change_amount)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm font-semibold text-stone-500">ยังไม่มีข้อมูลการชำระเงิน</p>
                  )}
                </div>

                <div className="rounded-[24px] border border-[#eadbc9] bg-white p-4">
                  <div className="space-y-2 text-sm font-bold text-stone-600">
                    <div className="flex justify-between">
                      <span>Subtotal</span>
                      <span>฿{formatMoney(totals.subtotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Discount</span>
                      <span>฿{formatMoney(totals.discount)}</span>
                    </div>
                    <div className="flex justify-between border-t border-dashed border-stone-300 pt-3 text-2xl font-black text-stone-950">
                      <span>Total</span>
                      <span>฿{formatMoney(totals.total)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <Button onClick={onClose}>ปิด</Button>
                <Button variant="dark" onClick={onOpenReceipt} disabled={!order.order_id}>
                  <ExternalLink size={17} />
                  เปิดใบเสร็จ
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Report() {
  const [businessDate, setBusinessDate] = React.useState(getTodayInputValue);
  const [report, setReport] = React.useState(() => {
    const initialDate = getTodayInputValue();
    const cachedReport = getCachedDailyReportResponse(initialDate);
    return cachedReport?.success ? normalizeReportResult(cachedReport, initialDate) : emptyReportForDate(initialDate);
  });
  const [error, setError] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(() => !getCachedDailyReportResponse(getTodayInputValue())?.success);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [recentOrders, setRecentOrders] = React.useState([]);
  const [recentError, setRecentError] = React.useState('');
  const [isRecentLoading, setIsRecentLoading] = React.useState(true);
  const [selectedBill, setSelectedBill] = React.useState(null);
  const [billDetail, setBillDetail] = React.useState(null);
  const [billDetailError, setBillDetailError] = React.useState('');
  const [isBillDetailLoading, setIsBillDetailLoading] = React.useState(false);
  const hasLoadedReportRef = React.useRef(Boolean(getCachedDailyReportResponse(getTodayInputValue())?.success));
  const isMountedRef = React.useRef(false);
  const reportRequestIdRef = React.useRef(0);
  const recentRequestIdRef = React.useRef(0);
  const billDetailRequestIdRef = React.useRef(0);
  const autoLoadedDateRef = React.useRef('');

  React.useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadReport = React.useCallback(async ({ force = true } = {}) => {
    const requestId = reportRequestIdRef.current + 1;
    reportRequestIdRef.current = requestId;
    const requestedDate = businessDate;
    const showFullLoading = !hasLoadedReportRef.current;

    if (showFullLoading) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }
    setError('');

    try {
      const result = await getDailyReport(requestedDate, { force });
      if (!result.success) throw new Error(result.message || 'GET_DAILY_REPORT failed');

      if (!isMountedRef.current || reportRequestIdRef.current !== requestId) {
        return;
      }

      setReport(normalizeReportResult(result, requestedDate));
      hasLoadedReportRef.current = true;
    } catch (loadError) {
      if (isMountedRef.current && reportRequestIdRef.current === requestId) {
        setError(loadError.message || 'Cannot load daily report');
      }
    } finally {
      if (isMountedRef.current && reportRequestIdRef.current === requestId) {
        if (showFullLoading) {
          setIsLoading(false);
        } else {
          setIsRefreshing(false);
        }
      }
    }
  }, [businessDate]);

  const loadRecentOrders = React.useCallback(async () => {
    const requestId = recentRequestIdRef.current + 1;
    recentRequestIdRef.current = requestId;
    setIsRecentLoading(true);
    setRecentError('');

    try {
      const result = await getRecentOrders({
        limit: 20,
        include_cancelled: false,
      });

      if (!result.success) throw new Error(result.message || 'GET_RECENT_ORDERS failed');

      if (!isMountedRef.current || recentRequestIdRef.current !== requestId) {
        return;
      }

      setRecentOrders(result.orders || []);
    } catch (loadError) {
      if (isMountedRef.current && recentRequestIdRef.current === requestId) {
        setRecentError(loadError.message || 'Cannot load recent orders');
      }
    } finally {
      if (isMountedRef.current && recentRequestIdRef.current === requestId) {
        setIsRecentLoading(false);
      }
    }
  }, []);

  const openBillDetail = React.useCallback(async (order) => {
    if (!order?.order_id) return;

    const requestId = billDetailRequestIdRef.current + 1;
    billDetailRequestIdRef.current = requestId;

    setSelectedBill(order);
    setBillDetail(null);
    setBillDetailError('');
    setIsBillDetailLoading(true);

    try {
      const result = await getOrderDetail({ order_id: order.order_id });

      if (!result.success) throw new Error(result.message || 'GET_ORDER_DETAIL failed');

      if (!isMountedRef.current || billDetailRequestIdRef.current !== requestId) {
        return;
      }

      setBillDetail(result);
    } catch (loadError) {
      if (isMountedRef.current && billDetailRequestIdRef.current === requestId) {
        setBillDetailError(loadError.message || 'Cannot load bill detail');
      }
    } finally {
      if (isMountedRef.current && billDetailRequestIdRef.current === requestId) {
        setIsBillDetailLoading(false);
      }
    }
  }, []);

  const closeBillDetail = React.useCallback(() => {
    billDetailRequestIdRef.current += 1;
    setSelectedBill(null);
    setBillDetail(null);
    setBillDetailError('');
    setIsBillDetailLoading(false);
  }, []);

  const openReceiptForSelectedBill = React.useCallback(() => {
    const orderId = billDetail?.order?.order_id || selectedBill?.order_id;

    if (!orderId) return;

    if (billDetail?.success) {
      saveReceiptDetail(orderId, billDetail);
    }

    navigateTo(`/receipt/${encodeURIComponent(orderId)}`);
  }, [billDetail, selectedBill]);

  const refreshAll = React.useCallback(() => {
    loadReport({ force: true });
    loadRecentOrders();
  }, [loadReport, loadRecentOrders]);

  React.useEffect(() => {
    if (!isMountedRef.current) {
      return;
    }

    const hasAutoLoadedDate = autoLoadedDateRef.current === businessDate;
    const cachedReport = getCachedDailyReportResponse(businessDate);

    if (cachedReport?.success) {
      setReport(normalizeReportResult(cachedReport, businessDate));
      hasLoadedReportRef.current = true;
      setIsLoading(false);
    } else {
      setReport(emptyReportForDate(businessDate));
      hasLoadedReportRef.current = false;
    }

    if (hasAutoLoadedDate) {
      return;
    }

    autoLoadedDateRef.current = businessDate;
    loadReport({ force: true });
  }, [businessDate, loadReport]);

  React.useEffect(() => {
    if (!isMountedRef.current) {
      return;
    }

    loadRecentOrders();
  }, [loadRecentOrders]);

  const summary = report.summary || {};
  const nonCashSales = toNumber(summary.transfer_sales) + toNumber(summary.qr_sales) + toNumber(summary.card_sales);

  return (
    <AppShell
      title="Report"
      subtitle="รายงานยอดขายรายวัน"
      actions={
        <>
          <label className="flex h-11 items-center gap-2 rounded-2xl border border-[#eadbc9] bg-white px-3 text-sm font-bold text-stone-600 shadow-sm">
            <CalendarDays size={18} />
            <input
              type="date"
              value={businessDate}
              onChange={(event) => setBusinessDate(event.target.value)}
              className="bg-transparent text-stone-950 outline-none"
              aria-label="Business date"
            />
          </label>
          <Button onClick={refreshAll} disabled={isLoading || isRefreshing || isRecentLoading}>
            <RefreshCw size={18} className={isLoading || isRefreshing || isRecentLoading ? 'animate-spin' : ''} />
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

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1.35fr_repeat(4,minmax(0,1fr))]">
        <div className="overflow-hidden rounded-[28px] border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-[#fffaf3] p-5 shadow-xl shadow-stone-900/5 md:col-span-2 xl:col-span-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-emerald-700">ยอดขายรวม</p>
              <p className="mt-2 text-4xl font-black text-stone-950">฿{formatMoney(summary.total_sales)}</p>
              <p className="mt-2 text-xs font-semibold text-stone-500">Business date: {report.business_date}</p>
              {isRefreshing ? (
                <p className="mt-1 text-xs font-bold text-stone-500">ข้อมูลล่าสุด กำลังอัปเดต...</p>
              ) : null}
            </div>
            <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white text-emerald-700 shadow-sm ring-1 ring-emerald-200">
              <Banknote size={24} />
            </span>
          </div>
        </div>
        <StatCard icon={ReceiptText} label="จำนวนบิล" value={formatNumber(summary.order_count)} />
        <StatCard icon={ShoppingBag} label="จำนวนรายการขาย" value={formatNumber(summary.item_count)} />
        <StatCard icon={WalletCards} label="เงินสด" value={formatMoney(summary.cash_sales)} prefix="฿" tone="coffee" />
        <StatCard icon={CreditCard} label="โอน/QR/Card" value={formatMoney(nonCashSales)} prefix="฿" tone="warning" />
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-[30px] border border-[#eadbc9] bg-white/85 p-4 shadow-2xl shadow-stone-900/5 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-stone-950">สินค้าขายดี</h2>
              <p className="text-sm font-semibold text-stone-500">Top selling items</p>
            </div>
            <Trophy className="text-amber-600" size={24} />
          </div>

          <div className="mt-4 overflow-hidden rounded-[24px] border border-[#eadbc9] bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="bg-[#f6efe7] text-xs uppercase text-[#7a5b43]">
                  <tr>
                    <th className="px-4 py-3">สินค้า</th>
                    <th className="px-4 py-3 text-right">จำนวน</th>
                    <th className="px-4 py-3 text-right">ยอดขาย</th>
                  </tr>
                </thead>
                <tbody>
                  {!isLoading &&
                    report.top_items.map((item) => (
                      <tr key={item.menu_id || item.menu_name} className="border-t border-[#eadbc9] transition hover:bg-[#fffaf3]">
                        <td className="px-4 py-3">
                          <p className="font-black text-stone-950">{item.menu_name}</p>
                          {item.menu_id ? <p className="mt-1 text-xs font-semibold text-stone-500">{item.menu_id}</p> : null}
                        </td>
                        <td className="px-4 py-3 text-right text-lg font-black">{formatNumber(item.quantity)}</td>
                        <td className="px-4 py-3 text-right font-black text-[#4b3020]">฿{formatMoney(item.total)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {isLoading ? <LoadingRows /> : null}
            {!isLoading && !report.top_items.length ? <EmptyState>ยังไม่มีรายการขายในวันนี้</EmptyState> : null}
          </div>
        </section>

        <section className="rounded-[30px] border border-[#eadbc9] bg-white/85 p-4 shadow-2xl shadow-stone-900/5 backdrop-blur">
          <div>
            <h2 className="text-xl font-black text-stone-950">สรุปการชำระเงิน</h2>
            <p className="text-sm font-semibold text-stone-500">Payment summary</p>
          </div>

          <div className="mt-4 overflow-hidden rounded-[24px] border border-[#eadbc9] bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#f6efe7] text-xs uppercase text-[#7a5b43]">
                <tr>
                  <th className="px-4 py-3">วิธีชำระเงิน</th>
                  <th className="px-4 py-3 text-right">จำนวนบิล</th>
                  <th className="px-4 py-3 text-right">ยอดเงิน</th>
                </tr>
              </thead>
              <tbody>
                {!isLoading &&
                  report.payment_summary.map((payment) => (
                    <tr key={payment.method} className="border-t border-[#eadbc9] transition hover:bg-[#fffaf3]">
                      <td className="px-4 py-3">
                        <StatusBadge tone={methodTone(payment.method)}>{methodLabel(payment.method)}</StatusBadge>
                      </td>
                      <td className="px-4 py-3 text-right font-bold">{formatNumber(payment.order_count)}</td>
                      <td className="px-4 py-3 text-right font-black text-[#4b3020]">฿{formatMoney(payment.amount)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {isLoading ? <LoadingRows /> : null}
            {!isLoading && !report.payment_summary.length ? <EmptyState>ยังไม่มีข้อมูลการชำระเงิน</EmptyState> : null}
          </div>
        </section>
      </div>

      <section className="mt-5 rounded-[30px] border border-[#eadbc9] bg-white/85 p-4 shadow-2xl shadow-stone-900/5 backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-stone-950">บิลล่าสุด</h2>
            <p className="text-sm font-semibold text-stone-500">คลิกเพื่อดูรายละเอียดรายการขายในบิล</p>
          </div>
          <Button size="sm" onClick={loadRecentOrders} disabled={isRecentLoading}>
            <RefreshCw size={16} className={isRecentLoading ? 'animate-spin' : ''} />
            โหลดบิล
          </Button>
        </div>

        {recentError ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700">
            {recentError}
          </div>
        ) : null}

        <div className="mt-4 overflow-hidden rounded-[24px] border border-[#eadbc9] bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-[#f6efe7] text-xs uppercase text-[#7a5b43]">
                <tr>
                  <th className="px-4 py-3">บิล</th>
                  <th className="px-4 py-3">เวลา</th>
                  <th className="px-4 py-3">ประเภท</th>
                  <th className="px-4 py-3">วิธีชำระเงิน</th>
                  <th className="px-4 py-3">สถานะ</th>
                  <th className="px-4 py-3 text-right">ยอดรวม</th>
                  <th className="px-4 py-3 text-right">ดู</th>
                </tr>
              </thead>
              <tbody>
                {!isRecentLoading &&
                  recentOrders.map((order) => (
                    <tr
                      key={order.order_id}
                      className="cursor-pointer border-t border-[#eadbc9] transition hover:bg-[#fffaf3]"
                      onClick={() => openBillDetail(order)}
                    >
                      <td className="px-4 py-3">
                        <p className="font-black text-stone-950">{order.order_no || order.order_id}</p>
                        <p className="mt-1 text-xs font-semibold text-stone-500">
                          {order.order_id} · {formatNumber(order.item_count)} รายการ
                        </p>
                      </td>
                      <td className="px-4 py-3 font-semibold text-stone-600">
                        {formatDateTime(order.closed_at || order.created_at)}
                      </td>
                      <td className="px-4 py-3 font-bold text-stone-700">{orderTypeLabel(order)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={methodTone(order.payment_method)}>{methodLabel(order.payment_method)}</StatusBadge>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={statusTone(order.status, order.payment_status)}>
                          {statusLabel(order.status, order.payment_status)}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3 text-right text-lg font-black text-[#4b3020]">฿{formatMoney(order.total)}</td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(event) => {
                            event.stopPropagation();
                            openBillDetail(order);
                          }}
                        >
                          <Eye size={16} />
                          รายละเอียด
                        </Button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {isRecentLoading ? <LoadingRows /> : null}
          {!isRecentLoading && !recentOrders.length ? <EmptyState>ยังไม่มีบิลล่าสุด</EmptyState> : null}
        </div>
      </section>

      {selectedBill ? (
        <BillDetailModal
          detail={billDetail}
          isLoading={isBillDetailLoading}
          error={billDetailError}
          onClose={closeBillDetail}
          onOpenReceipt={openReceiptForSelectedBill}
        />
      ) : null}
    </AppShell>
  );
}
