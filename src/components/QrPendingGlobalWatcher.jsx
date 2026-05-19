import React from 'react';
import { BellRing } from 'lucide-react';
import Button from './Button.jsx';
import { getTables, isGetTablesRequestInFlight } from '../services/api.js';
import { getCurrentRoutePath, navigateTo } from '../services/router.js';
import { playQrPendingBeep, showQrPendingBrowserNotification } from '../services/qrPendingAlerts.js';
import {
  readQrBrowserNotificationEnabled,
  readQrPendingSoundEnabled,
  readSeenPendingCount,
  requestPendingTableFocus,
  writeSeenPendingCount,
} from '../services/qrPendingState.js';

const QR_PENDING_WATCH_INTERVAL_MS = 15000;

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatNumber(value) {
  return new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(toNumber(value));
}

function isCustomerOrderRoute(path) {
  return path === '/order';
}

function getPendingCount(table) {
  return toNumber(table?.order?.pending_item_count || 0);
}

function getPendingTotal(table) {
  return toNumber(table?.order?.pending_total || 0);
}

function buildPendingToast(tables) {
  const newAlerts = [];

  tables.forEach((table) => {
    const tableNo = table.table_no;
    const pendingCount = getPendingCount(table);
    const previousCount = readSeenPendingCount(tableNo);

    if (pendingCount > previousCount) {
      newAlerts.push({
        table_no: tableNo,
        table_name: table.table_name,
        pending_item_count: pendingCount,
        pending_total: getPendingTotal(table),
      });
    }

    writeSeenPendingCount(tableNo, pendingCount);
  });

  if (!newAlerts.length) return null;

  if (newAlerts.length === 1) {
    return newAlerts[0];
  }

  return {
    table_no: newAlerts[0].table_no,
    table_name: newAlerts[0].table_name,
    table_count: newAlerts.length,
    pending_item_count: newAlerts.reduce((sum, alert) => sum + toNumber(alert.pending_item_count), 0),
    pending_total: newAlerts.reduce((sum, alert) => sum + toNumber(alert.pending_total), 0),
  };
}

function openTablesForToast(toast) {
  requestPendingTableFocus(toast.table_no);
  navigateTo('/tables');
}

export default function QrPendingGlobalWatcher() {
  const [routePath, setRoutePath] = React.useState(getCurrentRoutePath);
  const [toast, setToast] = React.useState(null);
  const isPollingRef = React.useRef(false);

  React.useEffect(() => {
    const handleRoute = () => {
      const nextPath = getCurrentRoutePath();
      setRoutePath(nextPath);

      if (isCustomerOrderRoute(nextPath)) {
        setToast(null);
      }
    };

    window.addEventListener('popstate', handleRoute);
    window.addEventListener('hashchange', handleRoute);
    return () => {
      window.removeEventListener('popstate', handleRoute);
      window.removeEventListener('hashchange', handleRoute);
    };
  }, []);

  React.useEffect(() => {
    if (isCustomerOrderRoute(routePath)) {
      return undefined;
    }

    const pollTables = async () => {
      if (getCurrentRoutePath() === '/order') {
        return;
      }

      if (isPollingRef.current || isGetTablesRequestInFlight()) {
        if (import.meta.env.DEV) {
          console.log('[QR Pending] poll skipped: GET_TABLES in flight');
        }
        return;
      }

      isPollingRef.current = true;

      try {
        if (import.meta.env.DEV) {
          console.log('[QR Pending] poll started');
        }

        const result = await getTables({ forceRefresh: true });

        if (!result?.success || getCurrentRoutePath() === '/order') {
          return;
        }

        const nextToast = buildPendingToast(result.tables || []);

        if (nextToast) {
          setToast(nextToast);

          if (readQrPendingSoundEnabled()) {
            playQrPendingBeep();
          }

          if (readQrBrowserNotificationEnabled()) {
            showQrPendingBrowserNotification(nextToast, () => openTablesForToast(nextToast));
          }
        }
      } catch (error) {
        if (import.meta.env.DEV) {
          console.warn('[QR Pending] poll failed');
        }
      } finally {
        isPollingRef.current = false;
      }
    };

    const timer = window.setInterval(pollTables, QR_PENDING_WATCH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [routePath]);

  if (isCustomerOrderRoute(routePath) || !toast) {
    return null;
  }

  const openTables = () => {
    setToast(null);
    openTablesForToast(toast);
  };

  return (
    <div className="fixed right-4 top-4 z-[80] w-[min(360px,calc(100vw-32px))] rounded-[26px] border border-amber-300 bg-white p-4 shadow-2xl shadow-stone-950/20">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-white">
          <BellRing size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-black text-stone-950">
            {toast.table_count
              ? `มีรายการใหม่จาก QR ${formatNumber(toast.table_count)} โต๊ะ`
              : `โต๊ะ ${toast.table_no} มีรายการใหม่จาก QR ${formatNumber(toast.pending_item_count)} รายการ`}
          </p>
          <p className="mt-1 text-sm font-semibold text-stone-500">
            ยอดรอยืนยัน ฿{formatNumber(toast.pending_total)}
          </p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="dark" onClick={openTables}>
              เปิดดู
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setToast(null)}>
              ปิด
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
