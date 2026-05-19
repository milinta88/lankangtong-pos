function handleStockAction_(action, request) {
  switch (action) {
    case 'GET_STOCK':
      return getStockSummary_();

    default:
      return {
        success: false,
        message: action + ' is not implemented yet'
      };
  }
}

function getStockSummary_() {
  var ingredients = getActiveIngredientStock_();
  var directStockMenus = getDirectMenuStock_();
  var lowStockItems = [];

  ingredients.forEach(function (ingredient) {
    if (isLowStock_(ingredient.stock_qty, ingredient.low_stock_level)) {
      lowStockItems.push({
        target_type: 'INGREDIENT',
        target_id: ingredient.ingredient_id,
        item_name: ingredient.ingredient_name,
        unit: ingredient.unit,
        stock_qty: ingredient.stock_qty,
        low_stock_level: ingredient.low_stock_level,
        cost_per_unit: ingredient.cost_per_unit
      });
    }
  });

  directStockMenus.forEach(function (menu) {
    if (isLowStock_(menu.stock_qty, menu.low_stock_level)) {
      lowStockItems.push({
        target_type: 'MENU',
        target_id: menu.menu_id,
        item_name: menu.menu_name,
        stock_qty: menu.stock_qty,
        low_stock_level: menu.low_stock_level,
        stock_mode: menu.stock_mode,
        cost: menu.cost
      });
    }
  });

  return {
    success: true,
    ingredients: ingredients,
    directStockMenus: directStockMenus,
    lowStockItems: lowStockItems
  };
}

function getActiveIngredientStock_() {
  return readSheetRecordsByHeaders_('ingredients')
    .filter(function (row) {
      return isTruthy_(getValueByAliases_(row, ['is_active'], false));
    })
    .map(function (row) {
      return {
        ingredient_id: stringValue_(getValueByAliases_(row, ['ingredient_id'], '')),
        ingredient_name: stringValue_(getValueByAliases_(row, ['ingredient_name', 'name'], '')),
        unit: stringValue_(getValueByAliases_(row, ['unit'], '')),
        stock_qty: numberValue_(getValueByAliases_(row, ['stock_qty', 'current_stock'], 0)),
        low_stock_level: numberValue_(getValueByAliases_(row, ['low_stock_level', 'min_stock'], 0)),
        cost_per_unit: numberValue_(getValueByAliases_(row, ['cost_per_unit'], 0)),
        is_active: true
      };
    })
    .filter(function (ingredient) {
      return ingredient.ingredient_id !== '';
    })
    .sort(function (a, b) {
      return stringValue_(a.ingredient_name).localeCompare(stringValue_(b.ingredient_name)) ||
        stringValue_(a.ingredient_id).localeCompare(stringValue_(b.ingredient_id));
    });
}

function getDirectMenuStock_() {
  return readSheetRecordsByHeaders_('menus')
    .filter(function (row) {
      return isTruthy_(getValueByAliases_(row, ['track_stock'], false)) &&
        normalizeStockMode_(getValueByAliases_(row, ['stock_mode'], 'NONE')) === 'DIRECT';
    })
    .map(function (row) {
      return {
        menu_id: stringValue_(getValueByAliases_(row, ['menu_id'], '')),
        menu_name: stringValue_(getValueByAliases_(row, ['name_th', 'menu_name'], '')),
        stock_qty: numberValue_(getValueByAliases_(row, ['stock_qty'], 0)),
        low_stock_level: numberValue_(getValueByAliases_(row, ['low_stock_level'], 0)),
        stock_mode: 'DIRECT',
        cost: numberValue_(getValueByAliases_(row, ['cost'], 0))
      };
    })
    .filter(function (menu) {
      return menu.menu_id !== '';
    })
    .sort(function (a, b) {
      return stringValue_(a.menu_name).localeCompare(stringValue_(b.menu_name)) ||
        stringValue_(a.menu_id).localeCompare(stringValue_(b.menu_id));
    });
}

function isLowStock_(stockQty, lowStockLevel) {
  return stockQty <= lowStockLevel;
}

function testGetStockSummary() {
  var result = getStockSummary_();
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

