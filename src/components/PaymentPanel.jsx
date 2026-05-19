import React from 'react';
import { CreditCard, Printer, QrCode, ShieldCheck, Wallet } from 'lucide-react';
import { generatePromptPayQrDataUrl } from '../utils/promptpayQr.js';
import Input from './Input.jsx';

function formatMoney(value) {
  return new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value || 0);
}

const paymentMethods = [
  ['CASH', Wallet],
  ['QR', QrCode],
  ['TRANSFER', CreditCard],
];

export default function PaymentPanel({
  total,
  method,
  received,
  settings,
  settingsWarnings = [],
  isBusy,
  busyLabel = 'กำลังบันทึก...',
  busyHint = '',
  canSubmit,
  onMethodChange,
  onReceivedChange,
  onSubmit,
}) {
  const usesPromptPay = method === 'QR' || method === 'TRANSFER';
  const promptPayEnabled = Boolean(settings?.promptpay_enabled);
  const promptPayId = String(settings?.promptpay_id || '');
  const promptPayName = settings?.promptpay_name || settings?.shop_name || 'ล้านก๋างโต้ง';
  const effectiveReceived = method === 'CASH' ? Number(received || 0) : total;
  const change = Math.max(0, effectiveReceived - total);
  const [qrDataUrl, setQrDataUrl] = React.useState('');
  const [qrError, setQrError] = React.useState('');

  React.useEffect(() => {
    let isActive = true;

    setQrDataUrl('');
    setQrError('');

    if (!usesPromptPay || !promptPayEnabled) {
      return undefined;
    }

    generatePromptPayQrDataUrl(promptPayId, total)
      .then((dataUrl) => {
        if (isActive) setQrDataUrl(dataUrl);
      })
      .catch((error) => {
        if (isActive) setQrError(error.message || 'Cannot generate PromptPay QR.');
      });

    return () => {
      isActive = false;
    };
  }, [promptPayEnabled, promptPayId, total, usesPromptPay]);

  return (
    <section className="rounded-[26px] border border-[#eadbc9] bg-white p-4 shadow-xl shadow-stone-900/5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black text-stone-950">ชำระเงิน</h2>
          <p className="text-xs font-semibold text-stone-500">เลือกวิธีรับชำระ</p>
        </div>
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[#fff2d8] text-[#8a5a25]">
          <Printer size={20} />
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {paymentMethods.map(([value, Icon]) => (
          <button
            key={value}
            type="button"
            disabled={isBusy}
            onClick={() => onMethodChange(value)}
            className={`flex h-12 items-center justify-center gap-2 rounded-2xl text-sm font-black transition active:scale-[0.98] ${
              method === value
                ? 'bg-[#0f0b08] text-white shadow-md shadow-stone-950/15'
                : 'bg-[#f6efe7] text-[#5b3f2d] hover:bg-[#ead9c7]'
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            <Icon size={18} />
            {value}
          </button>
        ))}
      </div>

      {usesPromptPay && promptPayEnabled ? (
        <div className="mt-4 rounded-[24px] border border-[#ead9c7] bg-gradient-to-b from-white to-[#fff7ed] p-4 text-center shadow-sm">
          <div className="flex items-center justify-center gap-2 text-[#5b3f2d]">
            <ShieldCheck size={18} />
            <p className="text-sm font-black">สแกนจ่ายพร้อมเพย์</p>
          </div>
          <p className="mt-1 text-xs font-semibold text-stone-500">ชื่อบัญชี: {promptPayName}</p>
          {qrDataUrl ? (
            <div className="mx-auto mt-4 w-fit rounded-[24px] bg-white p-3 shadow-lg shadow-stone-900/10 ring-1 ring-[#eadbc9]">
              <img src={qrDataUrl} alt="PromptPay QR" className="h-56 w-56" />
            </div>
          ) : qrError ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">
              {qrError}
            </div>
          ) : (
            <div className="mx-auto mt-4 h-56 w-56 rounded-[24px] bg-white p-3 shadow-lg shadow-stone-900/10 ring-1 ring-[#eadbc9]">
              <div className="h-full animate-pulse rounded-2xl bg-stone-100" />
            </div>
          )}
          <p className="mt-4 text-3xl font-black text-stone-950">฿{formatMoney(total)}</p>
          <p className="mt-1 rounded-full bg-amber-50 px-3 py-2 text-xs font-black text-amber-700">
            กรุณาตรวจสอบยอดเงินเข้าก่อนกดยืนยัน
          </p>
        </div>
      ) : null}

      {settingsWarnings.length ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
          {settingsWarnings.join(' ')}
        </div>
      ) : null}

      {method === 'CASH' ? (
        <label className="mt-4 block text-xs font-bold uppercase tracking-wide text-stone-500">
          Received
          <Input
            value={received}
            onChange={(event) => onReceivedChange(event.target.value)}
            inputMode="decimal"
            disabled={isBusy}
            className="mt-1 w-full rounded-2xl border-[#eadbc9] text-lg font-black"
          />
        </label>
      ) : (
        <div className="mt-4 rounded-2xl border border-[#eadbc9] bg-[#fffaf3] p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-stone-500">Payment amount</p>
          <p className="text-xl font-black text-stone-950">฿{formatMoney(total)}</p>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 rounded-[22px] bg-[#f4ede6] p-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-stone-500">Total</p>
          <p className="text-xl font-black">฿{formatMoney(total)}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-stone-500">Change</p>
          <p className="text-xl font-black">฿{formatMoney(change)}</p>
        </div>
      </div>

      <button
        type="button"
        disabled={!canSubmit || isBusy}
        onClick={onSubmit}
        className="mt-4 h-14 w-full rounded-[20px] bg-[#0f0b08] text-base font-black text-white shadow-lg shadow-stone-950/15 transition hover:bg-[#5b3f2d] active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-stone-300 disabled:shadow-none"
      >
        {isBusy ? busyLabel : 'บันทึกและพิมพ์'}
      </button>

      {isBusy && busyHint ? (
        <p className="mt-3 rounded-2xl bg-amber-50 px-3 py-2 text-center text-xs font-black text-amber-800">
          {busyHint}
        </p>
      ) : null}
    </section>
  );
}
