import React from 'react';
import { ArrowLeft, Printer, RefreshCw } from 'lucide-react';
import { getOrderDetail } from '../services/api.js';
import { getReceiptDetail, saveReceiptDetail } from '../services/receiptCache.js';
import { navigateTo } from '../App.jsx';
import Button from '../components/Button.jsx';
import Receipt58mm from '../components/Receipt58mm.jsx';

export default function Receipt({ orderId }) {
  const [detail, setDetail] = React.useState(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  const loadDetail = React.useCallback(async ({ force = false } = {}) => {
    if (!orderId) return;

    setIsLoading(true);
    setError('');

    try {
      if (!force) {
        const cached = getReceiptDetail(orderId);

        if (cached) {
          setDetail(cached);
          setIsLoading(false);
          return;
        }
      }

      const result = await getOrderDetail(orderId);

      if (!result.success) {
        throw new Error(result.message || 'GET_ORDER_DETAIL failed');
      }

      setDetail(result);
      saveReceiptDetail(orderId, result);
    } catch (loadError) {
      setError(loadError.message || 'Cannot load receipt');
    } finally {
      setIsLoading(false);
    }
  }, [orderId]);

  React.useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  return (
    <main className="min-h-screen bg-[#f5efe6] px-4 py-5 text-stone-950">
      <div className="no-print mx-auto mb-5 flex max-w-5xl flex-col gap-4 rounded-2xl border border-stone-200 bg-white/90 p-4 shadow-xl shadow-stone-900/5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#8a6a4f]">ล้านก๋างโต้ง</p>
          <h1 className="mt-1 text-2xl font-black">Receipt 58mm</h1>
          <p className="text-sm font-semibold text-stone-500">พรีวิวใบเสร็จก่อนพิมพ์</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => navigateTo('/pos')}>
            <ArrowLeft size={17} />
            POS
          </Button>
          <Button onClick={() => loadDetail({ force: true })}>
            <RefreshCw size={17} />
            Refresh
          </Button>
          <Button onClick={() => window.print()} disabled={!detail} variant="dark">
            <Printer size={17} />
            Print
          </Button>
        </div>
      </div>

      <section className="mx-auto flex max-w-5xl justify-center rounded-3xl border border-stone-200 bg-white/50 px-4 py-8 shadow-inner">
        {isLoading ? (
          <div className="h-[560px] w-[58mm] animate-pulse rounded bg-white shadow-xl" />
        ) : error ? (
          <div className="no-print max-w-lg rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">
            {error}
          </div>
        ) : (
          <Receipt58mm detail={detail} />
        )}
      </section>
    </main>
  );
}
