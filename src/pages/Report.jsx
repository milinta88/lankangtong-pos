import React from 'react';
import { AlertTriangle, Banknote, CalendarDays, CreditCard, RefreshCw, ReceiptText, ShoppingBag, Trophy, WalletCards } from 'lucide-react';
import { getCachedDailyReportResponse, getDailyReport } from '../services/api.js';
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
  const hasLoadedReportRef = React.useRef(Boolean(getCachedDailyReportResponse(getTodayInputValue())?.success));
  const isMountedRef = React.useRef(false);
  const reportRequestIdRef = React.useRef(0);
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
          <Button onClick={() => loadReport({ force: true })} disabled={isLoading || isRefreshing}>
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
        <div>
          <h2 className="text-xl font-black text-stone-950">บิลล่าสุด</h2>
          <p className="text-sm font-semibold text-stone-500">Recent paid orders</p>
        </div>

        <div className="mt-4 overflow-hidden rounded-[24px] border border-[#eadbc9] bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-[#f6efe7] text-xs uppercase text-[#7a5b43]">
                <tr>
                  <th className="px-4 py-3">บิล</th>
                  <th className="px-4 py-3">เวลา</th>
                  <th className="px-4 py-3">วิธีชำระเงิน</th>
                  <th className="px-4 py-3 text-right">ยอดรวม</th>
                </tr>
              </thead>
              <tbody>
                {!isLoading &&
                  report.recent_orders.map((order) => (
                    <tr key={order.order_id} className="border-t border-[#eadbc9] transition hover:bg-[#fffaf3]">
                      <td className="px-4 py-3">
                        <p className="font-black text-stone-950">{order.order_no || order.order_id}</p>
                        <p className="mt-1 text-xs font-semibold text-stone-500">{order.order_id}</p>
                      </td>
                      <td className="px-4 py-3 font-semibold text-stone-600">{formatDateTime(order.created_at)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={methodTone(order.payment_method)}>{methodLabel(order.payment_method)}</StatusBadge>
                      </td>
                      <td className="px-4 py-3 text-right text-lg font-black text-[#4b3020]">฿{formatMoney(order.total)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {isLoading ? <LoadingRows /> : null}
          {!isLoading && !report.recent_orders.length ? <EmptyState>ยังไม่มีบิลที่ชำระเงินแล้ว</EmptyState> : null}
        </div>
      </section>
    </AppShell>
  );
}
