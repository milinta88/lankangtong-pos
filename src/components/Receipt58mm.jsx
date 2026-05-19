import React from 'react';
import { generatePromptPayQrDataUrl } from '../utils/promptpayQr.js';

function formatMoney(value) {
  return new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function shouldShowPromptPayQr(receipt) {
  const method = String(receipt.payment_method || '').toUpperCase();

  return (
    (method === 'QR' || method === 'TRANSFER') &&
    Boolean(receipt.promptpay_enabled) &&
    Boolean(receipt.receipt_qr_enabled) &&
    Boolean(receipt.promptpay_id)
  );
}

export default function Receipt58mm({ detail }) {
  const order = detail?.order || {};
  const items = detail?.items || [];
  const receipt = detail?.receipt || {};
  const [qrDataUrl, setQrDataUrl] = React.useState('');

  React.useEffect(() => {
    let isActive = true;

    setQrDataUrl('');

    if (!shouldShowPromptPayQr(receipt)) {
      return undefined;
    }

    generatePromptPayQrDataUrl(receipt.promptpay_id, receipt.total)
      .then((dataUrl) => {
        if (isActive) {
          setQrDataUrl(dataUrl);
        }
      })
      .catch(() => {
        if (isActive) {
          setQrDataUrl('');
        }
      });

    return () => {
      isActive = false;
    };
  }, [
    receipt.payment_method,
    receipt.promptpay_enabled,
    receipt.receipt_qr_enabled,
    receipt.promptpay_id,
    receipt.total,
  ]);

  const qrSizeMm = Number(receipt.receipt_qr_size_mm) > 0 ? Number(receipt.receipt_qr_size_mm) : 30;

  return (
    <div className="receipt-print-area mx-auto w-[58mm] bg-white p-[3mm] font-mono text-[11px] leading-tight text-black shadow-panel">
      <div className="receipt-header text-center">
        <h1 className="receipt-shop-name text-[15px] font-black">{receipt.shop_name || 'ล้านก๋างโต้ง'}</h1>
        <p className="receipt-subtitle mt-1">ใบเสร็จรับเงิน</p>
      </div>

      <div className="my-2 border-t border-dashed border-black" />

      <div className="receipt-meta space-y-1">
        <div className="flex justify-between gap-2">
          <span>เลขที่</span>
          <span className="text-right">{receipt.order_no}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span>วันที่</span>
          <span className="text-right">{formatDateTime(receipt.created_at)}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span>ประเภท</span>
          <span>{order.order_type}</span>
        </div>
        {order.table_no ? (
          <div className="flex justify-between gap-2">
            <span>โต๊ะ</span>
            <span>{order.table_no}</span>
          </div>
        ) : null}
      </div>

      <div className="my-2 border-t border-dashed border-black" />

      <div className="receipt-items space-y-2">
        {items.map((item) => (
          <div className="receipt-item" key={item.item_id || `${item.menu_id}-${item.menu_name_snapshot}`}>
            <div className="receipt-item-row flex justify-between gap-2">
              <span className="receipt-item-name min-w-0 flex-1 break-words">{item.menu_name_snapshot}</span>
              <span className="receipt-item-total shrink-0 text-right">฿{formatMoney(item.total)}</span>
            </div>
            <div className="receipt-item-detail text-[10px] text-black/75">
              {item.quantity} x ฿{formatMoney(item.unit_price)}
              {item.note ? `  ${item.note}` : ''}
            </div>
          </div>
        ))}
      </div>

      <div className="my-2 border-t border-dashed border-black" />

      <div className="receipt-summary space-y-1">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>฿{formatMoney(receipt.subtotal)}</span>
        </div>
        <div className="flex justify-between">
          <span>Discount</span>
          <span>฿{formatMoney(receipt.discount)}</span>
        </div>
        <div className="receipt-total-row flex justify-between text-[13px] font-black">
          <span>Total</span>
          <span>฿{formatMoney(receipt.total)}</span>
        </div>
      </div>

      <div className="my-2 border-t border-dashed border-black" />

      <div className="receipt-payment space-y-1">
        <div className="flex justify-between">
          <span>ชำระโดย</span>
          <span>{receipt.payment_method}</span>
        </div>
        <div className="flex justify-between">
          <span>ยอดชำระ</span>
          <span>฿{formatMoney(receipt.total)}</span>
        </div>
        <div className="flex justify-between">
          <span>ยอดรับ</span>
          <span>฿{formatMoney(receipt.received)}</span>
        </div>
        <div className="flex justify-between">
          <span>เงินทอน</span>
          <span>฿{formatMoney(receipt.change_amount)}</span>
        </div>
        {receipt.paid_at ? (
          <div className="flex justify-between gap-2">
            <span>Paid</span>
            <span className="text-right">{formatDateTime(receipt.paid_at)}</span>
          </div>
        ) : null}
      </div>

      {qrDataUrl ? (
        <>
          <div className="my-2 border-t border-dashed border-black" />
          <div className="receipt-promptpay text-center">
            <p className="font-bold">สแกนจ่ายพร้อมเพย์</p>
            <img
              src={qrDataUrl}
              alt="PromptPay QR"
              className="receipt-qr mt-1"
              style={{
                width: `${qrSizeMm}mm`,
                height: `${qrSizeMm}mm`,
              }}
            />
            <p className="mt-1">{receipt.promptpay_name || receipt.shop_name || 'ล้านก๋างโต้ง'}</p>
          </div>
        </>
      ) : null}

      <div className="my-2 border-t border-dashed border-black" />

      <p className="receipt-footer text-center">ขอบคุณค่ะ</p>
    </div>
  );
}
