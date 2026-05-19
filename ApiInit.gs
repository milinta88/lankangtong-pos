function initDatabase_(request) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    var result = initializeDatabaseSheets_({
      force: true
    });
    ensureDefaultTables_();
    clearMenuCache_();
    clearSettingsCache_();
    return stripDatabaseInitResult_(result);
  } finally {
    lock.releaseLock();
  }
}

function seedDatabase_(request) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    initializeDatabaseSheets_({
      force: true
    });

    var insertedCounts = {
      settings: seedSheetIfEmpty_('settings', getSettingsSeedRecords_()),
      users: seedSheetIfEmpty_('users', getUsersSeedRecords_()),
      tables: seedSheetIfEmpty_('tables', getTablesSeedRecords_()),
      menu_categories: seedSheetIfEmpty_('menu_categories', getMenuCategorySeedRecords_())
    };

    ensureDefaultTables_();

    var updatedCounts = {
      settings: 0
    };

    if (isForceUpdateRequest_(request)) {
      updatedCounts.settings = updateSettingIfExists_(
        'receipt_width',
        '58mm',
        'Thermal receipt printer paper width'
      );
    }

    clearMenuCache_();
    clearSettingsCache_();

    return {
      success: true,
      message: 'Database seeded',
      insertedCounts: insertedCounts,
      updatedCounts: updatedCounts
    };
  } finally {
    lock.releaseLock();
  }
}

function testSeedDatabase() {
  var result = seedDatabase_();
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function testSeedDatabase58mm() {
  var result = seedDatabase_({
    force_update: true
  });
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function resetStockLogsHeaderForDev() {
  var spreadsheet = getDatabase_();
  var sheet = spreadsheet.getSheetByName('stock_logs');

  if (!sheet) {
    sheet = spreadsheet.insertSheet('stock_logs');
  }

  var headers = getHeaders_('stock_logs');
  sheet.clear();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);

  return {
    success: true,
    message: 'stock_logs header reset for development',
    headers: headers
  };
}

function initializeDatabaseSheets_(options) {
  options = options || {};
  var properties = PropertiesService.getScriptProperties();
  var schemaVersion = properties.getProperty(SCRIPT_PROPERTY_KEYS.DATABASE_SCHEMA_VERSION);
  var force = options.force === true;

  if (!force && schemaVersion === DATABASE_SCHEMA_VERSION) {
    return {
      success: true,
      message: 'Database schema current',
      createdSheets: [],
      updatedSheets: [],
      skipped: true
    };
  }

  var spreadsheet = getDatabase_();
  var createdSheets = [];
  var updatedSheets = [];
  var wroteSchema = false;

  REQUIRED_SHEETS.forEach(function (sheetName) {
    var sheet = spreadsheet.getSheetByName(sheetName);

    if (!sheet) {
      sheet = spreadsheet.insertSheet(sheetName);
      createdSheets.push(sheetName);
      wroteSchema = true;
    }

    if (sheet.getLastRow() === 0) {
      var headers = getHeaders_(sheetName);
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
      updatedSheets.push(sheetName);
      wroteSchema = true;
    } else {
      var addedHeaders = appendMissingHeaders_(sheet, sheetName);

      if (addedHeaders.length > 0) {
        updatedSheets.push(sheetName);
        wroteSchema = true;
      }
    }
  });

  if (wroteSchema) {
    SpreadsheetApp.flush();
  }

  properties.setProperty(SCRIPT_PROPERTY_KEYS.DATABASE_SCHEMA_VERSION, DATABASE_SCHEMA_VERSION);

  return {
    success: true,
    message: 'Database initialized',
    createdSheets: createdSheets,
    updatedSheets: updatedSheets,
    skipped: false
  };
}

function appendMissingHeaders_(sheet, sheetName) {
  var expectedHeaders = getHeaders_(sheetName);

  if (!expectedHeaders.length) {
    return [];
  }

  var lastColumn = sheet.getLastColumn();

  if (lastColumn < 1) {
    sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
    sheet.setFrozenRows(1);
    return expectedHeaders;
  }

  var currentHeaders = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  var currentHeaderMap = {};

  currentHeaders.forEach(function (header) {
    var normalized = normalizeSchemaHeader_(header);

    if (normalized) {
      currentHeaderMap[normalized] = true;
    }
  });

  var missingHeaders = expectedHeaders.filter(function (header) {
    return !currentHeaderMap[normalizeSchemaHeader_(header)];
  });

  if (missingHeaders.length === 0) {
    return [];
  }

  sheet.getRange(1, lastColumn + 1, 1, missingHeaders.length).setValues([missingHeaders]);
  sheet.setFrozenRows(1);

  return missingHeaders;
}

function stripDatabaseInitResult_(result) {
  return {
    success: result.success,
    message: 'Database initialized',
    createdSheets: result.createdSheets || [],
    updatedSheets: result.updatedSheets || []
  };
}

function normalizeSchemaHeader_(header) {
  return String(header || '').trim().toLowerCase();
}

function seedSheetIfEmpty_(sheetName, records) {
  var sheet = getSheetOrThrow_(sheetName);

  if (sheet.getLastRow() > 1) {
    return 0;
  }

  if (!records.length) {
    return 0;
  }

  var rows = recordsToRows_(sheetName, records);
  sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);

  return rows.length;
}

function updateSettingIfExists_(key, value, description) {
  var sheet = getSheetOrThrow_('settings');
  var lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return 0;
  }

  var headers = getHeaders_('settings');
  var keyColumn = headers.indexOf('key') + 1;
  var valueColumn = headers.indexOf('value') + 1;
  var descriptionColumn = headers.indexOf('description') + 1;
  var updatedAtColumn = headers.indexOf('updated_at') + 1;
  var keys = sheet.getRange(2, keyColumn, lastRow - 1, 1).getValues();

  for (var index = 0; index < keys.length; index++) {
    if (keys[index][0] === key) {
      var rowNumber = index + 2;
      var currentValue = sheet.getRange(rowNumber, valueColumn).getValue();
      var currentDescription = sheet.getRange(rowNumber, descriptionColumn).getValue();

      if (currentValue === value && currentDescription === description) {
        return 0;
      }

      sheet.getRange(rowNumber, valueColumn).setValue(value);
      sheet.getRange(rowNumber, descriptionColumn).setValue(description);
      sheet.getRange(rowNumber, updatedAtColumn).setValue(nowIso_());

      return 1;
    }
  }

  return 0;
}

function isForceUpdateRequest_(request) {
  if (!request) {
    return false;
  }

  var forceUpdate = request.force_update;

  if (forceUpdate === undefined) {
    forceUpdate = request.forceUpdate;
  }

  return forceUpdate === true || String(forceUpdate).toLowerCase() === 'true';
}

function recordsToRows_(sheetName, records) {
  var headers = getHeaders_(sheetName);

  return records.map(function (record) {
    return headers.map(function (header) {
      return record[header] === undefined ? '' : record[header];
    });
  });
}

function getSettingsSeedRecords_() {
  var timestamp = nowIso_();

  return [
    {
      key: 'shop_name',
      value: APP_NAME,
      description: 'Shop display name',
      updated_at: timestamp
    },
    {
      key: 'receipt_width',
      value: '58mm',
      description: 'Thermal receipt printer paper width',
      updated_at: timestamp
    },
    {
      key: 'currency',
      value: 'THB',
      description: 'Default currency',
      updated_at: timestamp
    },
    {
      key: 'service_charge_enabled',
      value: false,
      description: 'Enable service charge',
      updated_at: timestamp
    },
    {
      key: 'vat_enabled',
      value: false,
      description: 'Enable VAT',
      updated_at: timestamp
    },
    {
      key: 'promptpay_enabled',
      value: true,
      description: 'Enable PromptPay QR payment',
      updated_at: timestamp
    },
    {
      key: 'promptpay_id',
      value: '0812345678',
      description: 'PromptPay phone or national ID; keep phone leading zero and format cell as Plain text',
      updated_at: timestamp
    },
    {
      key: 'promptpay_name',
      value: APP_NAME,
      description: 'PromptPay account display name',
      updated_at: timestamp
    },
    {
      key: 'receipt_qr_enabled',
      value: true,
      description: 'Show PromptPay QR on QR/TRANSFER receipts',
      updated_at: timestamp
    },
    {
      key: 'receipt_qr_size_mm',
      value: 30,
      description: 'Receipt QR image size in mm; 28-32mm is recommended for 58mm receipt paper',
      updated_at: timestamp
    }
  ];
}

function getUsersSeedRecords_() {
  var timestamp = nowIso_();

  return [
    {
      user_id: 'U001',
      name: 'Owner',
      role: 'OWNER',
      pin: '1234',
      is_active: true,
      created_at: timestamp,
      updated_at: timestamp
    },
    {
      user_id: 'U002',
      name: 'Cashier',
      role: 'CASHIER',
      pin: '1111',
      is_active: true,
      created_at: timestamp,
      updated_at: timestamp
    },
    {
      user_id: 'U003',
      name: 'Kitchen',
      role: 'KITCHEN',
      pin: '2222',
      is_active: true,
      created_at: timestamp,
      updated_at: timestamp
    }
  ];
}

function getTablesSeedRecords_() {
  var timestamp = nowIso_();
  var tables = [];

  for (var index = 1; index <= 10; index++) {
    var tableId = 'T' + ('0' + index).slice(-2);

    tables.push({
      table_id: tableId,
      table_no: tableId,
      table_name: 'โต๊ะ ' + index,
      status: 'AVAILABLE',
      current_order_id: '',
      qr_token: makeTableQrToken_(),
      sort_order: index,
      is_active: true,
      created_at: timestamp,
      updated_at: timestamp
    });
  }

  return tables;
}

function getMenuCategorySeedRecords_() {
  var timestamp = nowIso_();
  var categories = [
    ['C001', 'กาแฟ', 1],
    ['C002', 'ชา', 2],
    ['C003', 'นม / โกโก้', 3],
    ['C004', 'อิตาเลียนโซดา', 4],
    ['C005', 'อาหารจานเดียว', 5],
    ['C006', 'ของทานเล่น', 6],
    ['C007', 'ของหวาน', 7]
  ];

  return categories.map(function (category) {
    return {
      category_id: category[0],
      name: category[1],
      sort_order: category[2],
      is_active: true,
      created_at: timestamp,
      updated_at: timestamp
    };
  });
}
