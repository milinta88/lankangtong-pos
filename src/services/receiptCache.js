function getReceiptKey(orderId) {
  return `langangtong:receipt:${orderId}`;
}

export function saveReceiptDetail(orderId, detail) {
  if (!orderId || typeof sessionStorage === 'undefined') return;

  sessionStorage.setItem(getReceiptKey(orderId), JSON.stringify(detail));
}

export function getReceiptDetail(orderId) {
  if (!orderId || typeof sessionStorage === 'undefined') return null;

  const raw = sessionStorage.getItem(getReceiptKey(orderId));

  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

