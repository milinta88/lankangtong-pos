var DEV_TRANSACTION_SHEETS = [
  'orders',
  'order_items',
  'payments',
  'stock_logs',
  'daily_close'
];

function handleDevUtilityAction_(action, request) {
  switch (action) {
    case 'RESET_TRANSACTION_DATA_FOR_DEV':
      return resetTransactionDataForDev_(request || {});

    case 'DISABLE_TEST_MENU':
      return disableTestMenu_();

    default:
      return {
        success: false,
        message: action + ' is not implemented yet'
      };
  }
}

function resetTransactionDataForDev_(request) {
  var authResult = requireAdminToken_(request);

  if (!authResult.success) {
    return authResult;
  }

  initializeDatabaseSheets_();

  var clearedSheets = [];

  DEV_TRANSACTION_SHEETS.forEach(function (sheetName) {
    var sheet = getSheetOrThrow_(sheetName);
    var lastRow = sheet.getLastRow();
    var lastColumn = sheet.getLastColumn();

    if (lastRow > 1 && lastColumn > 0) {
      sheet.getRange(2, 1, lastRow - 1, lastColumn).clearContent();
      clearedSheets.push(sheetName);
    }
  });

  return {
    success: true,
    message: 'Transaction data reset',
    clearedSheets: clearedSheets
  };
}

function disableTestMenu_() {
  initializeDatabaseSheets_();

  var table = getSheetRecordsWithRowNumbers_('menus');
  var menu = findRecordByValue_(table.records, ['menu_id'], 'MN900');

  if (!menu) {
    return {
      success: false,
      error: 'MENU_NOT_FOUND',
      message: 'Menu not found: MN900'
    };
  }

  var updates = {
    is_available: false,
    track_stock: false,
    stock_mode: 'NONE',
    updated_at: nowIso_()
  };

  Object.keys(updates).forEach(function (field) {
    var column = getHeaderColumn_(table.headers, [field]);

    if (!column) {
      throw new Error('menus sheet is missing ' + field + ' header');
    }

    table.sheet.getRange(menu._rowNumber, column).setValue(updates[field]);
    menu[field] = updates[field];
  });

  return {
    success: true,
    message: 'Test menu disabled',
    menu: normalizeAdminMenuRecord_(menu)
  };
}

function requireAdminToken_(request) {
  var expectedToken = getAdminToken_();
  var providedToken = stringValue_(request.admin_token || request.adminToken || '');

  if (!expectedToken) {
    return {
      success: false,
      error: 'ADMIN_TOKEN_NOT_CONFIGURED',
      message: 'admin_token is not configured in Script Properties'
    };
  }

  if (!providedToken || providedToken !== expectedToken) {
    return {
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Invalid admin_token'
    };
  }

  return {
    success: true
  };
}

function getAdminToken_() {
  var properties = PropertiesService.getScriptProperties();
  var token = properties.getProperty(SCRIPT_PROPERTY_KEYS.ADMIN_TOKEN);

  if (!token) {
    token = properties.getProperty('ADMIN_TOKEN');
  }

  return stringValue_(token);
}

function testResetTransactionDataForDev() {
  var adminToken = getAdminToken_();
  var result = resetTransactionDataForDev_({
    admin_token: adminToken
  });

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function testDisableTestMenu() {
  var result = disableTestMenu_();

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}
