import promptpayQr from 'promptpay-qr';
import QRCode from 'qrcode';

function normalizeAmount(amount) {
  const number = Number(amount);

  if (!Number.isFinite(number) || number <= 0) {
    throw new Error('PromptPay amount must be greater than zero.');
  }

  return Math.round(number * 100) / 100;
}

function normalizePromptPayId(promptpayId) {
  const id = String(promptpayId || '').trim();

  if (!id) {
    throw new Error('PromptPay ID is required.');
  }

  return id;
}

export function generatePromptPayPayload(promptpayId, amount) {
  const id = normalizePromptPayId(promptpayId);
  const roundedAmount = normalizeAmount(amount);

  return promptpayQr(id, { amount: roundedAmount });
}

export async function generatePromptPayQrDataUrl(promptpayId, amount) {
  const payload = generatePromptPayPayload(promptpayId, amount);

  return QRCode.toDataURL(payload, {
    width: 240,
    margin: 1,
    errorCorrectionLevel: 'M',
  });
}
