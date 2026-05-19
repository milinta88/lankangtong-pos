function handleMenuAction_(action, request) {
  switch (action) {
    case 'GET_MENU':
    case 'LIST_MENUS':
      return getMenu_();

    case 'GET_ADMIN_MENUS':
      return getAdminMenus_();

    case 'UPDATE_MENU_BASIC':
      return updateMenuBasic_(request || {});

    default:
      return {
        success: false,
        message: action + ' is not implemented yet'
      };
  }
}

function getMenu_() {
  var cached = getCachedJson_(CACHE_KEY_GET_MENU);

  if (cached) {
    return cached;
  }

  var response = buildMenuResponse_();

  putCachedJson_(CACHE_KEY_GET_MENU, response, CACHE_TTL_GET_MENU_SECONDS);
  return response;
}

function buildMenuResponse_() {
  var categoryRows = readSheetRecordsByHeaders_('menu_categories');
  var menuRows = readSheetRecordsByHeaders_('menus');
  var categoryByKey = {};

  var categories = categoryRows
    .filter(function (row) {
      return isTruthy_(getValueByAliases_(row, ['is_active'], false));
    })
    .map(function (row) {
      var category = {
        category_id: stringValue_(getValueByAliases_(row, ['category_id'], '')),
        category_name: stringValue_(getValueByAliases_(row, ['category_name', 'name'], '')),
        sort_order: numberValue_(getValueByAliases_(row, ['sort_order'], 0))
      };

      addCategoryLookup_(categoryByKey, category.category_id, category);
      addCategoryLookup_(categoryByKey, category.category_name, category);

      return category;
    })
    .filter(function (category) {
      return category.category_id !== '';
    })
    .sort(function (a, b) {
      return sortByNumberThenText_(a.sort_order, b.sort_order, a.category_id, b.category_id);
    });

  var menus = menuRows
    .filter(function (row) {
      return isTruthy_(getValueByAliases_(row, ['is_available'], false));
    })
    .map(function (row) {
      var rawCategoryId = stringValue_(getValueByAliases_(row, ['category_id'], ''));
      var category = categoryByKey[normalizeLookupKey_(rawCategoryId)];
      var stockMode = normalizeStockMode_(getValueByAliases_(row, ['stock_mode'], 'NONE'));
      var menu = {
        menu_id: stringValue_(getValueByAliases_(row, ['menu_id'], '')),
        category_id: category ? category.category_id : rawCategoryId,
        category_name: category ? category.category_name : '',
        menu_name: stringValue_(getValueByAliases_(row, ['name_th'], '')),
        menu_name_en: stringValue_(getValueByAliases_(row, ['name_en'], '')),
        description: stringValue_(getValueByAliases_(row, ['description'], '')),
        base_price: numberValue_(getValueByAliases_(row, ['price'], 0)),
        cost: numberValue_(getValueByAliases_(row, ['cost'], 0)),
        image_url: stringValue_(getValueByAliases_(row, ['image_url', 'image url', 'imageUrl', 'image', 'image_link', 'photo_url'], '')),
        is_active: isTruthy_(getValueByAliases_(row, ['is_available'], false)),
        is_recommended: isTruthy_(getValueByAliases_(row, ['is_recommended'], false)),
        recommended_sort: numberValue_(getValueByAliases_(row, ['recommended_sort'], 0)),
        track_stock: isTruthy_(getValueByAliases_(row, ['track_stock'], false)),
        stock_mode: stockMode,
        stock_qty: numberValue_(getValueByAliases_(row, ['stock_qty'], 0)),
        low_stock_level: numberValue_(getValueByAliases_(row, ['low_stock_level'], 0)),
        sort_order: numberValue_(getValueByAliases_(row, ['sort_order'], 0)),
        options: [],
        _category_sort_order: category ? category.sort_order : 999999
      };

      return menu;
    })
    .filter(function (menu) {
      return menu.menu_id !== '';
    })
    .sort(function (a, b) {
      if (a._category_sort_order !== b._category_sort_order) {
        return a._category_sort_order - b._category_sort_order;
      }

      if (a.sort_order !== b.sort_order) {
        return a.sort_order - b.sort_order;
      }

      return stringValue_(a.menu_id).localeCompare(stringValue_(b.menu_id));
    })
    .map(function (menu) {
      delete menu._category_sort_order;
      return menu;
    });

  return {
    success: true,
    categories: categories,
    menus: menus
  };
}

function getAdminMenus_() {
  var menuRows = readSheetRecordsByHeaders_('menus');
  var menus = menuRows
    .map(normalizeAdminMenuRecord_)
    .filter(function (menu) {
      return menu.menu_id !== '';
    })
    .sort(function (a, b) {
      var categoryCompare = stringValue_(a.category_id).localeCompare(stringValue_(b.category_id));

      if (categoryCompare !== 0) {
        return categoryCompare;
      }

      if (a.sort_order !== b.sort_order) {
        return a.sort_order - b.sort_order;
      }

      return stringValue_(a.menu_id).localeCompare(stringValue_(b.menu_id));
    });

  return {
    success: true,
    menus: menus
  };
}

function updateMenuBasic_(request) {
  var menuId = stringValue_(request.menu_id || request.menuId);

  if (!menuId) {
    return {
      success: false,
      error: 'MISSING_MENU_ID',
      message: 'menu_id is required'
    };
  }

  var source = request.fields && typeof request.fields === 'object' ? request.fields : request;
  var allowedFields = {
    price: normalizeAdminNumberUpdate_,
    image_url: stringValue_,
    is_available: isTruthy_,
    is_recommended: isTruthy_,
    track_stock: isTruthy_,
    stock_mode: normalizeStockMode_,
    stock_qty: normalizeAdminNumberUpdate_,
    low_stock_level: normalizeAdminNumberUpdate_,
    sort_order: normalizeAdminNumberUpdate_
  };
  var updates = {};

  Object.keys(allowedFields).forEach(function (field) {
    if (Object.prototype.hasOwnProperty.call(source, field)) {
      updates[field] = allowedFields[field](source[field]);
    }
  });

  if (!Object.keys(updates).length) {
    return {
      success: false,
      error: 'NO_ALLOWED_FIELDS',
      message: 'No allowed menu fields to update'
    };
  }

  var table = getSheetRecordsWithRowNumbers_('menus');
  var menu = findRecordByValue_(table.records, ['menu_id'], menuId);

  if (!menu) {
    return {
      success: false,
      error: 'MENU_NOT_FOUND',
      message: 'Menu not found: ' + menuId
    };
  }

  Object.keys(updates).forEach(function (field) {
    var column = getHeaderColumn_(table.headers, [field]);

    if (!column) {
      throw new Error('menus sheet is missing ' + field + ' header');
    }

    table.sheet.getRange(menu._rowNumber, column).setValue(updates[field]);
    menu[field] = updates[field];
  });

  var updatedAtColumn = getHeaderColumn_(table.headers, ['updated_at']);
  var timestamp = nowIso_();

  if (updatedAtColumn) {
    table.sheet.getRange(menu._rowNumber, updatedAtColumn).setValue(timestamp);
    menu.updated_at = timestamp;
  }

  clearMenuCache_();

  return {
    success: true,
    message: 'Menu updated',
    menu: normalizeAdminMenuRecord_(menu)
  };
}

function normalizeAdminMenuRecord_(row) {
  return {
    menu_id: stringValue_(getValueByAliases_(row, ['menu_id'], '')),
    category_id: stringValue_(getValueByAliases_(row, ['category_id'], '')),
    name_th: stringValue_(getValueByAliases_(row, ['name_th'], '')),
    price: numberValue_(getValueByAliases_(row, ['price'], 0)),
    image_url: stringValue_(getValueByAliases_(row, ['image_url', 'image url', 'imageUrl', 'image', 'image_link', 'photo_url'], '')),
    is_available: isTruthy_(getValueByAliases_(row, ['is_available'], false)),
    is_recommended: isTruthy_(getValueByAliases_(row, ['is_recommended'], false)),
    track_stock: isTruthy_(getValueByAliases_(row, ['track_stock'], false)),
    stock_mode: normalizeStockMode_(getValueByAliases_(row, ['stock_mode'], 'NONE')),
    stock_qty: numberValue_(getValueByAliases_(row, ['stock_qty'], 0)),
    low_stock_level: numberValue_(getValueByAliases_(row, ['low_stock_level'], 0)),
    sort_order: numberValue_(getValueByAliases_(row, ['sort_order'], 0))
  };
}

function normalizeAdminNumberUpdate_(value) {
  return numberValue_(value);
}

function addCategoryLookup_(categoryByKey, key, category) {
  var lookupKey = normalizeLookupKey_(key);

  if (lookupKey) {
    categoryByKey[lookupKey] = category;
  }
}

function normalizeLookupKey_(value) {
  return stringValue_(value).toUpperCase();
}

function testGetMenu() {
  var result = getMenu_();
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function readSheetRecordsByHeaders_(sheetName) {
  var sheet = getSheetOrThrow_(sheetName);
  var lastRow = sheet.getLastRow();
  var lastColumn = sheet.getLastColumn();

  if (lastRow < 2 || lastColumn < 1) {
    return [];
  }

  var headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function (header) {
    return normalizeHeaderName_(header);
  });
  var values = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();

  return values.map(function (row) {
    var record = {};

    headers.forEach(function (header, index) {
      if (header) {
        record[header] = row[index];
      }
    });

    return record;
  });
}

function normalizeHeaderName_(header) {
  return String(header || '').trim().toLowerCase();
}

function getValueByAliases_(record, aliases, defaultValue) {
  for (var index = 0; index < aliases.length; index++) {
    var key = normalizeHeaderName_(aliases[index]);

    if (Object.prototype.hasOwnProperty.call(record, key) && record[key] !== '') {
      return record[key];
    }
  }

  return defaultValue;
}

function stringValue_(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

function numberValue_(value) {
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  var number = Number(String(value).replace(/,/g, '').trim());

  return isNaN(number) ? 0 : number;
}

function isTruthy_(value) {
  if (value === true) {
    return true;
  }

  if (value === false || value === null || value === undefined) {
    return false;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  var normalized = String(value).trim().toUpperCase();

  return normalized === 'TRUE' || normalized === 'YES' || normalized === 'Y' || normalized === '1';
}

function normalizeStockMode_(value) {
  var stockMode = stringValue_(value).toUpperCase();

  if (stockMode === 'DIRECT' || stockMode === 'RECIPE') {
    return stockMode;
  }

  return 'NONE';
}

function sortByNumberThenText_(leftNumber, rightNumber, leftText, rightText) {
  if (leftNumber !== rightNumber) {
    return leftNumber - rightNumber;
  }

  return stringValue_(leftText).localeCompare(stringValue_(rightText));
}

function sortByTextThenNumber_(leftText, rightText, leftNumber, rightNumber) {
  var textCompare = stringValue_(leftText).localeCompare(stringValue_(rightText));

  if (textCompare !== 0) {
    return textCompare;
  }

  return leftNumber - rightNumber;
}
