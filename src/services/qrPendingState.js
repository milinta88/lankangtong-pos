export const QR_PENDING_FOCUS_TABLE_KEY = 'langangtong.tables.focusPendingTable';
export const QR_PENDING_SOUND_STORAGE_KEY = 'langangtong.tables.soundEnabled';

const QR_PENDING_SEEN_PREFIX = 'qrPendingSeen:';

function storageGet(storage, key) {
  try {
    return storage.getItem(key);
  } catch (error) {
    return null;
  }
}

function storageSet(storage, key, value) {
  try {
    storage.setItem(key, value);
  } catch (error) {
    // Storage can be unavailable in private modes. Alerts still work for the current render.
  }
}

function storageRemove(storage, key) {
  try {
    storage.removeItem(key);
  } catch (error) {
    // Ignore storage failures.
  }
}

function seenKey(tableNo) {
  return `${QR_PENDING_SEEN_PREFIX}${tableNo}`;
}

export function readSeenPendingCount(tableNo) {
  if (!tableNo || typeof sessionStorage === 'undefined') return 0;

  const value = Number(storageGet(sessionStorage, seenKey(tableNo)));
  return Number.isFinite(value) ? value : 0;
}

export function writeSeenPendingCount(tableNo, count) {
  if (!tableNo || typeof sessionStorage === 'undefined') return;

  storageSet(sessionStorage, seenKey(tableNo), String(Math.max(0, Number(count) || 0)));
}

export function readSeenPendingCounts(tableNos = []) {
  return tableNos.reduce((counts, tableNo) => {
    counts[tableNo] = readSeenPendingCount(tableNo);
    return counts;
  }, {});
}

export function writeSeenPendingCounts(counts) {
  Object.entries(counts || {}).forEach(([tableNo, count]) => {
    writeSeenPendingCount(tableNo, count);
  });
}

export function requestPendingTableFocus(tableNo) {
  if (!tableNo || typeof sessionStorage === 'undefined') return;

  storageSet(sessionStorage, QR_PENDING_FOCUS_TABLE_KEY, tableNo);
}

export function consumePendingTableFocus() {
  if (typeof sessionStorage === 'undefined') return '';

  const tableNo = storageGet(sessionStorage, QR_PENDING_FOCUS_TABLE_KEY) || '';
  storageRemove(sessionStorage, QR_PENDING_FOCUS_TABLE_KEY);
  return tableNo;
}

export function peekPendingTableFocus() {
  if (typeof sessionStorage === 'undefined') return '';

  return storageGet(sessionStorage, QR_PENDING_FOCUS_TABLE_KEY) || '';
}

export function readQrPendingSoundEnabled() {
  if (typeof localStorage === 'undefined') return false;

  return storageGet(localStorage, QR_PENDING_SOUND_STORAGE_KEY) === 'true';
}

export function writeQrPendingSoundEnabled(isEnabled) {
  if (typeof localStorage === 'undefined') return;

  storageSet(localStorage, QR_PENDING_SOUND_STORAGE_KEY, isEnabled ? 'true' : 'false');
}
