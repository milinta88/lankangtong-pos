import { getTableDisplayName } from '../utils/tableDisplay.js';

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

export const QR_ALERT_BEEP_FREQUENCY = 1600;
export const QR_ALERT_BEEP_GAIN = 0.62;
export const QR_ALERT_BEEP_DURATION_MS = 250;
export const QR_ALERT_BEEP_PAUSE_MS = 150;
export const QR_ALERT_BEEP_COUNT = 3;
export const QR_ALERT_SOUND_PATH = 'sounds/qr-alert.mp3';
export const QR_ALERT_SOUND_VOLUME = 1.0;

let isQrAlertSoundPlaying = false;

function getNotificationIconUrl() {
  if (typeof window === 'undefined') return '';

  const basePath = import.meta.env?.BASE_URL || '/';
  return new URL(`${basePath}favicon.svg`, window.location.origin).toString();
}

function getNotificationOptions(options = {}) {
  const iconUrl = getNotificationIconUrl();

  return {
    icon: iconUrl,
    badge: iconUrl,
    tag: 'qr-pending-order',
    renotify: true,
    requireInteraction: true,
    silent: false,
    ...options,
  };
}

function getPublicAssetUrl(path) {
  if (typeof window === 'undefined') return path;

  const basePath = import.meta.env?.BASE_URL || '/';
  const cleanBasePath = basePath.endsWith('/') ? basePath : `${basePath}/`;
  const cleanPath = String(path || '').replace(/^\/+/, '');
  return new URL(`${cleanBasePath}${cleanPath}`, window.location.origin).toString();
}

async function playFallbackBeep() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;

    if (!AudioContext) return;

    const context = new AudioContext();

    if (context.state === 'suspended') {
      await context.resume();
    }

    const startTime = context.currentTime;
    const durationSeconds = QR_ALERT_BEEP_DURATION_MS / 1000;
    const gapSeconds = (QR_ALERT_BEEP_DURATION_MS + QR_ALERT_BEEP_PAUSE_MS) / 1000;

    for (let index = 0; index < QR_ALERT_BEEP_COUNT; index += 1) {
      const beepStart = startTime + index * gapSeconds;
      const beepEnd = beepStart + durationSeconds;
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.type = 'square';
      oscillator.frequency.setValueAtTime(QR_ALERT_BEEP_FREQUENCY, beepStart);
      gain.gain.setValueAtTime(0.0001, beepStart);
      gain.gain.linearRampToValueAtTime(QR_ALERT_BEEP_GAIN, beepStart + 0.02);
      gain.gain.setValueAtTime(QR_ALERT_BEEP_GAIN, Math.max(beepStart + 0.02, beepEnd - 0.04));
      gain.gain.exponentialRampToValueAtTime(0.0001, beepEnd);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(beepStart);
      oscillator.stop(beepEnd + 0.02);
    }

    const totalMs =
      QR_ALERT_BEEP_COUNT * QR_ALERT_BEEP_DURATION_MS +
      (QR_ALERT_BEEP_COUNT - 1) * QR_ALERT_BEEP_PAUSE_MS +
      250;

    window.setTimeout(() => {
      context.close().catch(() => {});
      isQrAlertSoundPlaying = false;
    }, totalMs);
  } catch (error) {
    // Browsers may block audio until a user interaction. Visual/browser alerts still cover the workflow.
  }
}

export async function playQrPendingBeep() {
  if (isQrAlertSoundPlaying) return;

  isQrAlertSoundPlaying = true;

  try {
    if (typeof window === 'undefined' || typeof window.Audio !== 'function') {
      await playFallbackBeep();
      return;
    }

    const audio = new window.Audio(getPublicAssetUrl(QR_ALERT_SOUND_PATH));
    audio.preload = 'auto';
    audio.volume = QR_ALERT_SOUND_VOLUME;
    let didFinish = false;

    const releaseSoundLock = () => {
      if (didFinish) return;
      didFinish = true;
      isQrAlertSoundPlaying = false;
      audio.removeEventListener('ended', releaseSoundLock);
      audio.removeEventListener('error', handleAudioError);
    };

    const handleAudioError = () => {
      if (didFinish) return;
      didFinish = true;
      audio.removeEventListener('ended', releaseSoundLock);
      audio.removeEventListener('error', handleAudioError);

      void playFallbackBeep().finally(() => {
        isQrAlertSoundPlaying = false;
      });
    };

    audio.addEventListener('ended', releaseSoundLock, { once: true });
    audio.addEventListener('error', handleAudioError, { once: true });

    try {
      await audio.play();
    } catch (error) {
      releaseSoundLock();
      isQrAlertSoundPlaying = true;
      await playFallbackBeep();
      isQrAlertSoundPlaying = false;
    }
  } catch (error) {
    isQrAlertSoundPlaying = false;
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
    body: `${getTableDisplayName(toast?.table_no, toast?.table_name || toast?.table_no || '')} มีรายการใหม่ ${formatNumber(toast?.pending_item_count)} รายการ`,
  };
}

export function showQrPendingBrowserNotification(toast, onClick) {
  if (!canUseBrowserNotifications() || window.Notification.permission !== 'granted') {
    return null;
  }

  const { title, body } = getQrPendingNotificationText(toast);
  const notification = new window.Notification(title, getNotificationOptions({
    body,
  }));

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

export function showQrPendingTestNotification(onClick) {
  if (!canUseBrowserNotifications() || window.Notification.permission !== 'granted') {
    return null;
  }

  const notification = new window.Notification(
    'ทดสอบแจ้งเตือน QR',
    getNotificationOptions({
      body: 'ถ้าเห็นข้อความนี้ แสดงว่า Desktop Notification ใช้งานได้',
      tag: 'qr-pending-test',
    }),
  );

  notification.onclick = () => {
    try {
      window.focus();
      onClick?.();
      notification.close();
    } catch (error) {
      // Ignore notification click failures.
    }
  };

  return notification;
}
