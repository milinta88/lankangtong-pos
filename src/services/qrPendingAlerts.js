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

export function playQrPendingBeep() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;

    if (!AudioContext) return;

    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.22, context.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.38);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.42);
    window.setTimeout(() => context.close().catch(() => {}), 700);
  } catch (error) {
    // Browsers may block audio until a user interaction. Visual/browser alerts still cover the workflow.
  }
}

export function canUseBrowserNotifications() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getBrowserNotificationPermission() {
  if (!canUseBrowserNotifications()) return 'unsupported';
  return window.Notification.permission;
}

export async function requestBrowserNotificationPermission() {
  if (!canUseBrowserNotifications()) return 'unsupported';

  return window.Notification.requestPermission();
}

export function getQrPendingNotificationText(toast) {
  if (toast?.table_count) {
    return {
      title: 'มีออเดอร์ใหม่จาก QR',
      body: `มีรายการใหม่จาก QR ${formatNumber(toast.table_count)} โต๊ะ`,
    };
  }

  return {
    title: 'มีออเดอร์ใหม่จาก QR',
    body: `โต๊ะ ${toast?.table_no || ''} มีรายการใหม่ ${formatNumber(toast?.pending_item_count)} รายการ`,
  };
}

export function showQrPendingBrowserNotification(toast, onClick) {
  if (!canUseBrowserNotifications() || window.Notification.permission !== 'granted') {
    return null;
  }

  const { title, body } = getQrPendingNotificationText(toast);
  const notification = new window.Notification(title, {
    body,
    tag: toast?.table_count ? 'qr-pending-multiple' : `qr-pending-${toast?.table_no || 'table'}`,
    renotify: true,
  });

  notification.onclick = () => {
    try {
      window.focus();
      onClick?.();
      notification.close();
    } catch (error) {
      // Ignore notification click failures; the in-app toast remains available.
    }
  };

  return notification;
}
