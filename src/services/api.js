import {
  clearClientCache,
  clearClientCacheByPrefix,
  getClientCache,
  setClientCache,
} from './clientCache.js';

const API_URL = import.meta.env.VITE_API_URL;
const MENU_CACHE_KEY = 'GET_MENU';
const SETTINGS_CACHE_KEY = 'GET_SETTINGS';
const TABLES_CACHE_KEY = 'GET_TABLES';
const STOCK_CACHE_KEY = 'GET_STOCK';
const ADMIN_MENUS_CACHE_KEY = 'GET_ADMIN_MENUS';
const REPORT_CACHE_PREFIX = 'GET_DAILY_REPORT';
const MENU_CACHE_TTL_MS = 5 * 60 * 1000;
const SETTINGS_CACHE_TTL_MS = 10 * 60 * 1000;
const TABLES_CACHE_TTL_MS = 60 * 1000;
const STOCK_CACHE_TTL_MS = 30 * 1000;
const REPORT_CACHE_TTL_MS = 60 * 1000;
const ADMIN_MENUS_CACHE_TTL_MS = 5 * 60 * 1000;
const READ_ONLY_DEDUPE_ACTIONS = new Set([
  'GET_MENU',
  'GET_SETTINGS',
  'GET_TABLES',
  'GET_STOCK',
  'GET_DAILY_REPORT',
  'GET_ADMIN_MENUS',
]);
const NETWORK_SKIP_LOG_ACTIONS = new Set(['GET_MENU', 'GET_SETTINGS', 'GET_TABLES', 'GET_ADMIN_MENUS']);
const MIN_NETWORK_INTERVAL_MS = {
  GET_TABLES: 15000,
};
const SENSITIVE_REQUEST_KEY_FIELDS = new Set(['admin_token', 'promptpay_id', 'qr_token']);
const inFlightReadRequests = new Map();
const lastNetworkFetchAtByAction = new Map();
let tablesCacheGeneration = 0;

function nowMs() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }

  return Date.now();
}

function logApiTiming(action, startedAt) {
  if (!import.meta.env.DEV) {
    return;
  }

  const durationMs = Math.round(nowMs() - startedAt);
  console.log(`[API] ${action} took ${durationMs}ms`);
}

function logApiDeduped(action) {
  if (!import.meta.env.DEV) {
    return;
  }

  console.log(`[API] ${action} deduped`);
}

function logCacheStatus(action, didHit, options = {}) {
  if (!import.meta.env.DEV) {
    return;
  }

  if (didHit && options.networkSkipped) {
    console.log(`[Cache] ${action} hit - network skipped`);
    return;
  }

  console.log(`[Cache] ${action} ${didHit ? 'hit' : 'miss'}`);
}

function sanitizeRequestKeyValue(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizeRequestKeyValue);
  }

  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((sanitized, key) => {
        if (SENSITIVE_REQUEST_KEY_FIELDS.has(key)) {
          return sanitized;
        }

        sanitized[key] = sanitizeRequestKeyValue(value[key]);
        return sanitized;
      }, {});
  }

  if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol') {
    return null;
  }

  return value;
}

function makeRequestKey(action, payload = {}) {
  return `${action}:${JSON.stringify(sanitizeRequestKeyValue(payload || {}))}`;
}

async function executePostAction(action, payload = {}) {
  const startedAt = nowMs();

  try {
    if (!API_URL) {
      throw new Error('Missing VITE_API_URL');
    }

    const response = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify({
        action,
        ...payload,
      }),
    });
    const text = await response.text();

    if (!text) {
      return {};
    }

    try {
      return JSON.parse(text);
    } catch (error) {
      throw new Error('Invalid API response');
    }
  } finally {
    logApiTiming(action, startedAt);
  }
}

function postAction(action, payload = {}) {
  if (!READ_ONLY_DEDUPE_ACTIONS.has(action)) {
    return executePostAction(action, payload);
  }

  const requestKey = makeRequestKey(action, payload);
  const existingRequest = inFlightReadRequests.get(requestKey);

  if (existingRequest) {
    logApiDeduped(action);
    return existingRequest;
  }

  const request = executePostAction(action, payload).finally(() => {
    if (inFlightReadRequests.get(requestKey) === request) {
      inFlightReadRequests.delete(requestKey);
    }
  });

  inFlightReadRequests.set(requestKey, request);
  return request;
}

function reportCacheKey(businessDate) {
  return `${REPORT_CACHE_PREFIX}:${businessDate || 'default'}`;
}

async function postCachedAction(action, payload, cacheKey, ttlMs, options = {}) {
  const cached = getClientCache(cacheKey, { allowStale: Boolean(options.allowStale) });
  const forceRefresh = Boolean(options.force || options.forceRefresh);
  const shouldSkipNetwork = Boolean(cached) && !forceRefresh;

  if (shouldSkipNetwork) {
    logCacheStatus(action, true, {
      networkSkipped: NETWORK_SKIP_LOG_ACTIONS.has(action),
    });
    return cached;
  }

  const requestKey = makeRequestKey(action, payload);

  if (READ_ONLY_DEDUPE_ACTIONS.has(action) && inFlightReadRequests.has(requestKey)) {
    return postAction(action, payload);
  }

  logCacheStatus(action, Boolean(cached));

  const minNetworkIntervalMs = MIN_NETWORK_INTERVAL_MS[action] || 0;

  if (!forceRefresh && minNetworkIntervalMs > 0) {
    const lastNetworkFetchAt = lastNetworkFetchAtByAction.get(action) || 0;
    const recentlyFetched = nowMs() - lastNetworkFetchAt < minNetworkIntervalMs;
    const staleCached = recentlyFetched ? getClientCache(cacheKey, { allowStale: true }) : null;

    if (staleCached) {
      logCacheStatus(action, true, { networkSkipped: NETWORK_SKIP_LOG_ACTIONS.has(action) });
      return staleCached;
    }
  }

  const cacheGenerationAtStart = action === 'GET_TABLES' ? tablesCacheGeneration : 0;
  const result = await postAction(action, payload);

  if (result && result.success) {
    lastNetworkFetchAtByAction.set(action, nowMs());

    if (action === 'GET_TABLES' && cacheGenerationAtStart !== tablesCacheGeneration) {
      return result;
    }

    setClientCache(cacheKey, result, ttlMs);
  }

  return result;
}

export function getCachedMenuResponse() {
  return getClientCache(MENU_CACHE_KEY, { allowStale: true });
}

export function getCachedSettingsResponse() {
  return getClientCache(SETTINGS_CACHE_KEY, { allowStale: true });
}

export function getCachedTablesResponse() {
  return getClientCache(TABLES_CACHE_KEY, { allowStale: true });
}

export function hasFreshTablesClientCache() {
  return Boolean(getClientCache(TABLES_CACHE_KEY));
}

export function getCachedStockResponse() {
  return getClientCache(STOCK_CACHE_KEY, { allowStale: true });
}

export function getCachedDailyReportResponse(businessDate) {
  return getClientCache(reportCacheKey(businessDate), { allowStale: true });
}

export function getCachedAdminMenusResponse() {
  return getClientCache(ADMIN_MENUS_CACHE_KEY, { allowStale: true });
}

export async function getMenu(options = {}) {
  return postCachedAction('GET_MENU', {}, MENU_CACHE_KEY, MENU_CACHE_TTL_MS, options);
}

export async function getSettings(options = {}) {
  return postCachedAction('GET_SETTINGS', {}, SETTINGS_CACHE_KEY, SETTINGS_CACHE_TTL_MS, options);
}

export function clearMenuClientCache() {
  clearClientCache(MENU_CACHE_KEY);
}

export function clearSettingsClientCache() {
  clearClientCache(SETTINGS_CACHE_KEY);
}

export function clearTablesClientCache() {
  tablesCacheGeneration += 1;
  clearClientCache(TABLES_CACHE_KEY);
}

export function updateTablesClientCache(tables) {
  tablesCacheGeneration += 1;
  return setClientCache(
    TABLES_CACHE_KEY,
    {
      success: true,
      tables: Array.isArray(tables) ? tables : [],
    },
    TABLES_CACHE_TTL_MS,
  );
}

export function clearStockClientCache() {
  clearClientCache(STOCK_CACHE_KEY);
}

export function clearReportClientCache(date) {
  if (date) {
    clearClientCache(reportCacheKey(date));
    return;
  }

  clearClientCacheByPrefix(REPORT_CACHE_PREFIX);
}

export function clearAdminMenusClientCache() {
  clearClientCache(ADMIN_MENUS_CACHE_KEY);
}

export function clearAllClientCache() {
  clearClientCacheByPrefix('');
}

export function getStock(options = {}) {
  return postCachedAction('GET_STOCK', {}, STOCK_CACHE_KEY, STOCK_CACHE_TTL_MS, options);
}

export function getDailyReport(business_date, options = {}) {
  return postCachedAction(
    'GET_DAILY_REPORT',
    business_date ? { business_date } : {},
    reportCacheKey(business_date),
    REPORT_CACHE_TTL_MS,
    options,
  );
}

export function getAdminMenus(options = {}) {
  return postCachedAction('GET_ADMIN_MENUS', {}, ADMIN_MENUS_CACHE_KEY, ADMIN_MENUS_CACHE_TTL_MS, options);
}

export async function updateMenuBasic(menu_id, fields) {
  const result = await postAction('UPDATE_MENU_BASIC', { menu_id, fields });

  if (result && result.success) {
    clearAdminMenusClientCache();
    clearMenuClientCache();
  }

  return result;
}

export function createOrder(payload) {
  return postAction('CREATE_ORDER', payload);
}

export function payOrder(payload) {
  return postAction('PAY_ORDER', payload);
}

export function checkoutOrder(payload) {
  return postAction('CHECKOUT_ORDER', payload);
}

export function getOrderDetail(order_id) {
  return postAction('GET_ORDER_DETAIL', { order_id });
}

export function getTables(options = {}) {
  return postCachedAction('GET_TABLES', {}, TABLES_CACHE_KEY, TABLES_CACHE_TTL_MS, options);
}

export function openTable(payload) {
  return postAction('OPEN_TABLE', payload);
}

export function getTableOrder(payload) {
  return postAction('GET_TABLE_ORDER', payload);
}

export function addItemsToTableOrder(payload) {
  return postAction('ADD_ITEMS_TO_TABLE_ORDER', payload);
}

export function confirmTablePendingItems(payload) {
  return postAction('CONFIRM_TABLE_PENDING_ITEMS', payload);
}

export function rejectTablePendingItems(payload) {
  return postAction('REJECT_TABLE_PENDING_ITEMS', payload);
}

export function payTableOrder(payload) {
  return postAction('PAY_TABLE_ORDER', payload);
}

export function clearTableOrder(payload) {
  return postAction('CLEAR_TABLE_ORDER', payload);
}

export function getTableQrLinks(base_url) {
  return postAction('GET_TABLE_QR_LINKS', { base_url });
}

export function regenerateTableQrTokens(admin_token) {
  return postAction('REGENERATE_TABLE_QR_TOKENS', { admin_token });
}

export function submitQrTableOrder(payload) {
  return postAction('SUBMIT_QR_TABLE_ORDER', payload);
}
