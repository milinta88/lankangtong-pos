/**
 * PromptPay settings notes:
 * - Set settings.promptpay_id cell format to Plain text before entering phone numbers.
 * - Keep the leading zero for phone numbers, for example 0812345678.
 * - receipt_qr_size_mm is the QR image size; 28-32mm is recommended for 58mm receipts.
 */
function handleSettingsAction_(action, request) {
  switch (action) {
    case 'GET_SETTINGS':
      return getSettings_();

    default:
      return {
        success: false,
        message: action + ' is not implemented yet'
      };
  }
}

function getSettings_() {
  var cached = getCachedJson_(CACHE_KEY_GET_SETTINGS);

  if (cached) {
    getSettingsMapCachedResult_();
    return cached;
  }

  initializeDatabaseSheets_();

  var settingsMap = getSettingsMapCached_();
  var settings = normalizePublicSettings_(settingsMap);
  var warnings = [];

  if (settings.promptpay_enabled && !settings.promptpay_id) {
    warnings.push('PromptPay ID is missing.');
  }

  if (/^\d{9}$/.test(settings.promptpay_id)) {
    warnings.push('PromptPay phone number may be missing leading zero.');
  }

  var response = {
    success: true,
    settings: settings,
    warnings: warnings
  };

  putCachedJson_(CACHE_KEY_GET_SETTINGS, response, CACHE_TTL_GET_SETTINGS_SECONDS);
  return response;
}

function getSettingsMapCached_() {
  return getSettingsMapCachedResult_().settingsMap;
}

function getSettingsMapCachedResult_() {
  var cached = getCachedJson_(CACHE_KEY_GET_SETTINGS_MAP);

  if (cached) {
    return {
      settingsMap: cached,
      fromCache: true
    };
  }

  var settingsMap = getSettingsMapFromDisplayValues_();

  putCachedJson_(CACHE_KEY_GET_SETTINGS_MAP, settingsMap, CACHE_TTL_GET_SETTINGS_SECONDS);

  return {
    settingsMap: settingsMap,
    fromCache: false
  };
}

function getSettingsMapFromDisplayValues_() {
  var sheet = getSheetOrThrow_('settings');
  var lastRow = sheet.getLastRow();
  var lastColumn = sheet.getLastColumn();
  var map = {};

  if (lastRow < 2 || lastColumn < 1) {
    return map;
  }

  var headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0].map(function (header) {
    return normalizeHeaderName_(header);
  });
  var keyColumn = headers.indexOf('key');
  var valueColumn = headers.indexOf('value');

  if (keyColumn < 0 || valueColumn < 0) {
    return map;
  }

  var values = sheet.getRange(2, 1, lastRow - 1, lastColumn).getDisplayValues();

  values.forEach(function (row) {
    var key = stringValue_(row[keyColumn]);

    if (key) {
      map[key] = stringValue_(row[valueColumn]);
    }
  });

  return map;
}

function normalizePublicSettings_(settingsMap) {
  settingsMap = settingsMap || {};

  var shopName = stringValue_(settingsMap.shop_name || APP_NAME);

  return {
    shop_name: shopName,
    receipt_width: stringValue_(settingsMap.receipt_width || '58mm'),
    promptpay_enabled: parseSettingBoolean_(settingsMap.promptpay_enabled, false),
    promptpay_id: stringValue_(settingsMap.promptpay_id || ''),
    promptpay_name: stringValue_(settingsMap.promptpay_name || shopName),
    receipt_qr_enabled: parseSettingBoolean_(settingsMap.receipt_qr_enabled, false),
    receipt_qr_size_mm: parseSettingNumber_(settingsMap.receipt_qr_size_mm, 30)
  };
}

function getPromptPayReceiptSettings_(settingsMap) {
  return normalizePublicSettings_(settingsMap || getSettingsMapFromDisplayValues_());
}

function parseSettingBoolean_(value, defaultValue) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  return isTruthy_(value);
}

function parseSettingNumber_(value, defaultValue) {
  var number = numberValue_(value);

  return number > 0 ? number : defaultValue;
}

function testGetSettings() {
  var result = getSettings_();
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}
