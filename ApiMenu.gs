function handleMenuAction_(action, request) {
  switch (action) {
    case 'GET_MENU':
    case 'LIST_MENUS':
      return getMenu_();

    case 'GET_ADMIN_MENUS':
      return getAdminMenus_();

    case 'CREATE_MENU':
      return createMenu_(request || {});

    case 'UPDATE_MENU_BASIC':
      return updateMenuBasic_(request || {});

    case 'UPLOAD_MENU_IMAGE':
      return uploadMenuImage_(request || {});

    default:
      return {
        success: false,
        message: action + ' is not implemented yet'
      };
  }
}

var MENU_IMAGE_UPLOAD_MAX_BASE64_CHARS = 2000000;
var MENU_IMAGE_UPLOAD_MIME_EXTENSIONS = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp'
};

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

function createMenu_(request) {
  var source = request.fields && typeof request.fields === 'object' ? request.fields : request;
  var table = getSheetRecordsWithRowNumbers_('menus');
  var timestamp = nowIso_();
  var menuId = stringValue_(source.menu_id || source.menuId || '');
  var nameTh = stringValue_(source.name_th || source.name || source.menu_name || source.menuName || '');
  var categoryId = stringValue_(source.category_id || source.categoryId || '');
  var price = numberValue_(source.price || source.base_price || source.basePrice || 0);

  if (!nameTh) {
    return {
      success: false,
      error: 'MISSING_MENU_NAME',
      message: 'menu name is required'
    };
  }

  if (!categoryId) {
    return {
      success: false,
      error: 'MISSING_CATEGORY_ID',
      message: 'category_id is required'
    };
  }

  if (price <= 0) {
    return {
      success: false,
      error: 'INVALID_PRICE',
      message: 'price must be greater than 0'
    };
  }

  if (!menuId) {
    menuId = makeNextMenuId_(table.records);
  }

  if (findRecordByValue_(table.records, ['menu_id'], menuId)) {
    return {
      success: false,
      error: 'MENU_ID_EXISTS',
      message: 'Menu already exists: ' + menuId
    };
  }

  var record = {
    menu_id: menuId,
    category_id: categoryId,
    name_th: nameTh,
    name_en: stringValue_(source.name_en || source.nameEn || ''),
    description: stringValue_(source.description || source.note || ''),
    price: price,
    cost: numberValue_(source.cost || 0),
    image_url: stringValue_(source.image_url || source.imageUrl || ''),
    is_available: source.is_available === undefined ? true : isTruthy_(source.is_available),
    is_recommended: isTruthy_(source.is_recommended || source.isRecommended),
    recommended_sort: numberValue_(source.recommended_sort || source.recommendedSort || 0),
    track_stock: isTruthy_(source.track_stock || source.trackStock),
    stock_mode: normalizeStockMode_(source.stock_mode || source.stockMode || 'NONE'),
    stock_qty: numberValue_(source.stock_qty || source.stockQty || 0),
    low_stock_level: numberValue_(source.low_stock_level || source.lowStockLevel || 0),
    sort_order: source.sort_order === undefined ? getNextMenuSortOrder_(table.records, categoryId) : numberValue_(source.sort_order),
    created_at: timestamp,
    updated_at: timestamp
  };

  appendRowsToTable_(table, [record]);
  clearMenuCache_();

  return {
    success: true,
    message: 'Menu created',
    menu: normalizeAdminMenuRecord_(record)
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

function uploadMenuImage_(request) {
  var folderId = stringValue_(
    PropertiesService
      .getScriptProperties()
      .getProperty(SCRIPT_PROPERTY_KEYS.MENU_IMAGE_FOLDER_ID)
  );
  var menuId = stringValue_(request.menu_id || request.menuId);
  var mimeType = stringValue_(request.mime_type || request.mimeType).toLowerCase();
  var base64 = stringValue_(request.base64 || request.data || '');
  var shouldUpdateMenu = request.update_menu === undefined ? true : isTruthy_(request.update_menu);

  if (!folderId) {
    return {
      success: false,
      error: 'MISSING_MENU_IMAGE_FOLDER_ID',
      message: 'MENU_IMAGE_FOLDER_ID Script Property is missing'
    };
  }

  if (!menuId) {
    return {
      success: false,
      error: 'MISSING_MENU_ID',
      message: 'menu_id is required'
    };
  }

  if (!MENU_IMAGE_UPLOAD_MIME_EXTENSIONS[mimeType]) {
    return {
      success: false,
      error: 'UNSUPPORTED_IMAGE_TYPE',
      message: 'Only JPEG, PNG, or WebP images are supported'
    };
  }

  if (!base64) {
    return {
      success: false,
      error: 'MISSING_IMAGE_DATA',
      message: 'Image data is required'
    };
  }

  if (base64.indexOf(',') !== -1) {
    base64 = base64.split(',').pop();
  }

  base64 = base64.replace(/\s/g, '');

  if (base64.length > MENU_IMAGE_UPLOAD_MAX_BASE64_CHARS) {
    return {
      success: false,
      error: 'IMAGE_TOO_LARGE',
      message: 'Image payload is too large'
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

  try {
    var bytes = Utilities.base64Decode(base64);
    var extension = MENU_IMAGE_UPLOAD_MIME_EXTENSIONS[mimeType];
    var timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss');
    var safeFileName = sanitizeDriveFileName_(menuId + '-' + timestamp + extension);
    var folder = DriveApp.getFolderById(folderId);
    var blob = Utilities.newBlob(bytes, mimeType, safeFileName);
    var file = folder.createFile(blob);

    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    var fileId = file.getId();
    var imageUrl = 'https://lh3.googleusercontent.com/d/' + encodeURIComponent(fileId);
    var viewUrl = 'https://drive.google.com/file/d/' + encodeURIComponent(fileId) + '/view';
    var updatedMenu = null;

    if (shouldUpdateMenu) {
      updatedMenu = updateMenuImageUrl_(table, menu, imageUrl);
    }

    clearMenuCache_();

    return {
      success: true,
      menu_id: menuId,
      file_id: fileId,
      image_url: imageUrl,
      view_url: viewUrl,
      menu: updatedMenu ? normalizeAdminMenuRecord_(updatedMenu) : normalizeAdminMenuRecord_(menu)
    };
  } catch (err) {
    return {
      success: false,
      error: 'UPLOAD_FAILED',
      message: err && err.message ? err.message : String(err)
    };
  }
}

function updateMenuImageUrl_(table, menu, imageUrl) {
  var imageUrlColumn = getHeaderColumn_(table.headers, ['image_url']);

  if (!imageUrlColumn) {
    throw new Error('menus sheet is missing image_url header');
  }

  var timestamp = nowIso_();
  var updatedAtColumn = getHeaderColumn_(table.headers, ['updated_at']);

  table.sheet.getRange(menu._rowNumber, imageUrlColumn).setValue(imageUrl);
  menu.image_url = imageUrl;

  if (updatedAtColumn) {
    table.sheet.getRange(menu._rowNumber, updatedAtColumn).setValue(timestamp);
    menu.updated_at = timestamp;
  }

  return menu;
}

function sanitizeDriveFileName_(filename) {
  return stringValue_(filename)
    .replace(/[\\/:*?"<>|#%{}~&]/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 140);
}

function normalizeAdminMenuRecord_(row) {
  return {
    menu_id: stringValue_(getValueByAliases_(row, ['menu_id'], '')),
    category_id: stringValue_(getValueByAliases_(row, ['category_id'], '')),
    name_th: stringValue_(getValueByAliases_(row, ['name_th'], '')),
    name_en: stringValue_(getValueByAliases_(row, ['name_en'], '')),
    description: stringValue_(getValueByAliases_(row, ['description'], '')),
    price: numberValue_(getValueByAliases_(row, ['price'], 0)),
    cost: numberValue_(getValueByAliases_(row, ['cost'], 0)),
    image_url: stringValue_(getValueByAliases_(row, ['image_url', 'image url', 'imageUrl', 'image', 'image_link', 'photo_url'], '')),
    is_available: isTruthy_(getValueByAliases_(row, ['is_available'], false)),
    is_recommended: isTruthy_(getValueByAliases_(row, ['is_recommended'], false)),
    recommended_sort: numberValue_(getValueByAliases_(row, ['recommended_sort'], 0)),
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

function makeNextMenuId_(records) {
  var maxNumber = 0;

  records.forEach(function (record) {
    var menuId = stringValue_(getValueByAliases_(record, ['menu_id'], '')).toUpperCase();
    var match = menuId.match(/^MN(\d+)$/);

    if (match) {
      maxNumber = Math.max(maxNumber, numberValue_(match[1]));
    }
  });

  var nextNumber = maxNumber + 1;
  var suffix = String(nextNumber);

  while (suffix.length < 3) {
    suffix = '0' + suffix;
  }

  return 'MN' + suffix;
}

function getNextMenuSortOrder_(records, categoryId) {
  var maxSort = 0;
  var categoryKey = normalizeLookupKey_(categoryId);

  records.forEach(function (record) {
    if (normalizeLookupKey_(getValueByAliases_(record, ['category_id'], '')) !== categoryKey) {
      return;
    }

    maxSort = Math.max(maxSort, numberValue_(getValueByAliases_(record, ['sort_order'], 0)));
  });

  return maxSort + 1;
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

function testUploadMenuImage() {
  var result = uploadMenuImage_({
    menu_id: 'MN066',
    filename: 'tiny.png',
    mime_type: 'image/png',
    base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
    update_menu: false
  });

  result.verification = {
    has_file_id: result.success && !!result.file_id,
    has_image_url: result.success && result.image_url && result.image_url.indexOf('lh3.googleusercontent.com/d/') !== -1,
    menu_not_updated: result.success && result.menu && result.menu.image_url !== result.image_url,
    passed: result.success &&
      !!result.file_id &&
      result.image_url &&
      result.image_url.indexOf('lh3.googleusercontent.com/d/') !== -1
  };

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
