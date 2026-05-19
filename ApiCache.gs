var CACHE_KEY_GET_MENU = 'GET_MENU_V1';
var CACHE_KEY_GET_SETTINGS = 'GET_SETTINGS_V1';
var CACHE_KEY_GET_SETTINGS_MAP = 'GET_SETTINGS_MAP_V1';
var CACHE_TTL_GET_MENU_SECONDS = 300;
var CACHE_TTL_GET_SETTINGS_SECONDS = 600;

function getCachedJson_(key) {
  try {
    var cached = CacheService.getScriptCache().get(key);

    return cached ? JSON.parse(cached) : null;
  } catch (err) {
    return null;
  }
}

function putCachedJson_(key, value, ttlSeconds) {
  try {
    CacheService.getScriptCache().put(key, JSON.stringify(value), ttlSeconds);
  } catch (err) {
    // Large payloads can exceed CacheService limits. Treat cache as best effort.
  }
}

function removeCachedJson_(key) {
  try {
    CacheService.getScriptCache().remove(key);
  } catch (err) {
    // Cache invalidation should never block the POS flow.
  }
}

function clearMenuCache_() {
  removeCachedJson_(CACHE_KEY_GET_MENU);
}

function clearSettingsCache_() {
  removeCachedJson_(CACHE_KEY_GET_SETTINGS);
  removeCachedJson_(CACHE_KEY_GET_SETTINGS_MAP);
}
