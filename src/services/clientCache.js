const memoryCache = new Map();
const STORAGE_PREFIX = 'LGT_CLIENT_CACHE:';

function now() {
  return Date.now();
}

function storageKey(key) {
  return `${STORAGE_PREFIX}${key}`;
}

function readSessionValue(key) {
  if (typeof window === 'undefined') return null;

  try {
    const rawValue = window.sessionStorage.getItem(storageKey(key));
    if (!rawValue) return null;
    return JSON.parse(rawValue);
  } catch (error) {
    return null;
  }
}

function writeSessionValue(key, entry) {
  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.setItem(storageKey(key), JSON.stringify(entry));
  } catch (error) {
    // Session storage can be unavailable in private modes; memory cache still works.
  }
}

function removeSessionValue(key) {
  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.removeItem(storageKey(key));
  } catch (error) {
    // Ignore storage cleanup failures.
  }
}

function isValidEntry(entry) {
  return entry && Number(entry.expires_at) > now();
}

export function getClientCacheEntry(key, options = {}) {
  const allowStale = Boolean(options.allowStale);
  const memoryEntry = memoryCache.get(key);

  if (memoryEntry) {
    if (isValidEntry(memoryEntry) || allowStale) {
      return {
        value: memoryEntry.value,
        expires_at: memoryEntry.expires_at,
        isStale: !isValidEntry(memoryEntry),
      };
    }

    memoryCache.delete(key);
    removeSessionValue(key);
  }


  const sessionEntry = readSessionValue(key);

  if (sessionEntry) {
    if (isValidEntry(sessionEntry) || allowStale) {
      memoryCache.set(key, sessionEntry);
      return {
        value: sessionEntry.value,
        expires_at: sessionEntry.expires_at,
        isStale: !isValidEntry(sessionEntry),
      };
    }

    removeSessionValue(key);
  }

  return null;
}

export function getClientCache(key, options = {}) {
  const entry = getClientCacheEntry(key, options);

  return entry ? entry.value : null;
}

export function hasFreshClientCache(key) {
  const entry = getClientCacheEntry(key);

  return Boolean(entry && !entry.isStale);
}

export function warmClientCacheFromSession(key) {
  const sessionEntry = readSessionValue(key);

  if (sessionEntry) {
    memoryCache.set(key, sessionEntry);
  }

  return sessionEntry;
}

export function setClientCache(key, value, ttlMs) {
  const entry = {
    value,
    expires_at: now() + ttlMs,
  };

  memoryCache.set(key, entry);
  writeSessionValue(key, entry);
  return value;
}

export function clearClientCache(key) {
  memoryCache.delete(key);
  removeSessionValue(key);
}

export function clearClientCacheByPrefix(prefix) {
  Array.from(memoryCache.keys()).forEach((key) => {
    if (key.startsWith(prefix)) {
      memoryCache.delete(key);
    }
  });

  if (typeof window === 'undefined') return;

  try {
    for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = window.sessionStorage.key(index);

      if (key && key.startsWith(`${STORAGE_PREFIX}${prefix}`)) {
        window.sessionStorage.removeItem(key);
      }
    }
  } catch (error) {
    // Ignore storage cleanup failures.
  }
}
