var TABLE_STATUS_AVAILABLE = 'AVAILABLE';
var TABLE_STATUS_OCCUPIED = 'OCCUPIED';
var TABLE_STATUS_READY_TO_PAY = 'READY_TO_PAY';
var TEST_TABLE_NO_PROPERTY = 'TEST_TABLE_NO';
var TEST_TABLE_ORDER_ID_PROPERTY = 'TEST_TABLE_ORDER_ID';
var TEST_TABLE_DEFAULT_NO = 'T01';

function handleTableAction_(action, request) {
  switch (action) {
    case 'GET_TABLES':
      return getTables_(request || {});

    case 'OPEN_TABLE':
      return openTable_(request || {});

    case 'GET_TABLE_ORDER':
      return getTableOrder_(request || {});

    case 'ADD_ITEMS_TO_TABLE_ORDER':
      return addItemsToTableOrder_(request || {});

    case 'UPDATE_TABLE_ORDER_ITEM':
      return updateTableOrderItem_(request || {});

    case 'CONFIRM_TABLE_PENDING_ITEMS':
      return confirmTablePendingItems_(request || {});

    case 'REJECT_TABLE_PENDING_ITEMS':
      return rejectTablePendingItems_(request || {});

    case 'CLEAR_TABLE_ORDER':
      return clearTableOrder_(request || {});

    case 'PAY_TABLE_ORDER':
      return payTableOrder_(request || {});

    case 'GET_TABLE_QR_LINKS':
      return getTableQrLinks_(request || {});

    case 'REGENERATE_TABLE_QR_TOKENS':
      return regenerateTableQrTokens_(request || {});

    case 'SUBMIT_QR_TABLE_ORDER':
      return submitQrTableOrder_(request || {});

    default:
      return {
        success: false,
        message: action + ' is not implemented yet'
      };
  }
}

function ensureDefaultTables_() {
  var table = getSheetTable_('tables');
  var timestamp = nowIso_();
  var existingByKey = {};
  var usedTokens = {};
  var tokenCounts = {};
  var recordsToAppend = [];

  table.records.forEach(function (record) {
    var tableId = stringValue_(getValueByAliases_(record, ['table_id'], ''));
    var tableNo = stringValue_(getValueByAliases_(record, ['table_no'], ''));
    var token = stringValue_(getValueByAliases_(record, ['qr_token'], ''));

    if (tableId) {
      existingByKey[tableId] = record;
    }

    if (tableNo) {
      existingByKey[tableNo] = record;
    }

    if (token) {
      usedTokens[token] = true;
      tokenCounts[token] = (tokenCounts[token] || 0) + 1;
    }
  });

  for (var index = 1; index <= 10; index++) {
    var tableNo = 'T' + ('0' + index).slice(-2);
    var tableName = 'โต๊ะ ' + index;
    var existing = existingByKey[tableNo];

    if (!existing) {
      recordsToAppend.push({
        table_id: tableNo,
        table_no: tableNo,
        table_name: tableName,
        status: TABLE_STATUS_AVAILABLE,
        current_order_id: '',
        qr_token: makeUniqueTableQrToken_(usedTokens),
        sort_order: index,
        is_active: true,
        created_at: timestamp,
        updated_at: timestamp
      });
      continue;
    }

    var updates = {};
    var existingName = stringValue_(getValueByAliases_(existing, ['table_name'], ''));

    if (!stringValue_(getValueByAliases_(existing, ['table_id'], ''))) {
      updates.table_id = tableNo;
    }

    if (!stringValue_(getValueByAliases_(existing, ['table_no'], ''))) {
      updates.table_no = tableNo;
    }

    if (!existingName || existingName === tableNo) {
      updates.table_name = tableName;
    }

    if (!stringValue_(getValueByAliases_(existing, ['status'], ''))) {
      updates.status = TABLE_STATUS_AVAILABLE;
    }

    var existingToken = stringValue_(getValueByAliases_(existing, ['qr_token'], ''));

    if (!existingToken || tokenCounts[existingToken] > 1) {
      updates.qr_token = makeUniqueTableQrToken_(usedTokens);
    }

    if (!numberValue_(getValueByAliases_(existing, ['sort_order'], 0))) {
      updates.sort_order = index;
    }

    if (getValueByAliases_(existing, ['is_active'], '') === '') {
      updates.is_active = true;
    }

    if (!stringValue_(getValueByAliases_(existing, ['created_at'], ''))) {
      updates.created_at = timestamp;
    }

    updateTableRecordFields_(table, existing, updates, timestamp);
  }

  if (recordsToAppend.length) {
    appendRowsToTable_(table, recordsToAppend);
  }
}

function makeTableQrToken_() {
  return Utilities.getUuid().replace(/-/g, '').slice(0, 20);
}

function makeUniqueTableQrToken_(usedTokens) {
  var token = makeTableQrToken_();

  while (usedTokens[token]) {
    token = makeTableQrToken_();
  }

  usedTokens[token] = true;
  return token;
}

function ensureTableDatabaseReady_() {
  var result = initializeDatabaseSheets_();

  if (!result.skipped) {
    ensureDefaultTables_();
  }

  return result;
}

function getTables_(request) {
  var totalStart = perfStart_();
  var stepStart = perfStart_();

  ensureTableDatabaseReady_();
  perfLog_('GET_TABLES ensure database', stepStart);

  stepStart = perfStart_();
  var tablesTable = getSheetTable_('tables');
  var tables = getActiveTableRecordsSortedFromRecords_(tablesTable.records);
  var currentOrderIds = {};
  perfLog_('GET_TABLES read tables', stepStart);

  tables.forEach(function (table) {
    var orderId = stringValue_(getValueByAliases_(table, ['current_order_id'], ''));

    if (orderId) {
      currentOrderIds[orderId] = true;
    }
  });

  var hasCurrentOrders = Object.keys(currentOrderIds).length > 0;
  var orders = [];
  var orderItems = [];

  if (hasCurrentOrders) {
    stepStart = perfStart_();
    orders = getSheetTable_('orders').records;
    perfLog_('GET_TABLES read orders', stepStart);

    stepStart = perfStart_();
    orderItems = getSheetTable_('order_items').records;
    perfLog_('GET_TABLES read order_items', stepStart);
  }

  stepStart = perfStart_();
  var orderById = indexRecordsByValue_(orders, ['order_id']);
  var orderItemSummaryByOrderId = buildOrderItemSummaryByOrderId_(orderItems, currentOrderIds);
  var response = {
    success: true,
    tables: tables.map(function (table) {
      var normalized = normalizeTableRecord_(table);
      var orderId = normalized.current_order_id;
      var order = orderId ? orderById[orderId] : null;
      var orderItemSummary = orderItemSummaryByOrderId[orderId] || {
        totals: {
          total: 0,
          item_count: 0
        },
        pending_totals: {
          total: 0,
          item_count: 0
        }
      };

      if (order) {
        normalized.order = {
          order_no: stringValue_(getValueByAliases_(order, ['order_no'], '')),
          total: orderItemSummary.totals.total,
          item_count: orderItemSummary.totals.item_count,
          pending_item_count: orderItemSummary.pending_totals.item_count,
          pending_total: orderItemSummary.pending_totals.total,
          has_pending_items: orderItemSummary.pending_totals.item_count > 0,
          created_at: getValueByAliases_(order, ['created_at'], '')
        };
      }

      return normalized;
    })
  };

  perfLog_('GET_TABLES build response', stepStart);
  perfLog_('GET_TABLES total', totalStart);

  return response;
}

function openTable_(request) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    ensureTableDatabaseReady_();

    var timestamp = nowIso_();
    var tablesTable = getSheetTable_('tables');
    var table = findTableFromRequest_(tablesTable.records, request);

    if (!table || !isTruthy_(getValueByAliases_(table, ['is_active'], false))) {
      return {
        success: false,
        error: 'TABLE_NOT_FOUND',
        message: 'Table not found'
      };
    }

    var currentOrderId = stringValue_(getValueByAliases_(table, ['current_order_id'], ''));
    var status = normalizeTableStatus_(getValueByAliases_(table, ['status'], TABLE_STATUS_AVAILABLE));

    if (currentOrderId && status !== TABLE_STATUS_AVAILABLE) {
      return buildTableOrderResponse_(table, currentOrderId, 'Table already open');
    }

    var ordersTable = getSheetTable_('orders');
    var createdBy = stringValue_(request.created_by || request.user_id || request.userId || 'STAFF');
    var order = createEmptyTableOrder_(ordersTable, table, request, createdBy, timestamp);

    updateTableRecordFields_(tablesTable, table, {
      status: TABLE_STATUS_OCCUPIED,
      current_order_id: order.order_id
    }, timestamp);
    table.status = TABLE_STATUS_OCCUPIED;
    table.current_order_id = order.order_id;

    return {
      success: true,
      message: 'Table opened',
      table: normalizeTableRecord_(table),
      order: normalizeOrderRecord_(order)
    };
  } catch (err) {
    return {
      success: false,
      message: err && err.message ? err.message : String(err)
    };
  } finally {
    lock.releaseLock();
  }
}

function getTableOrder_(request) {
  var totalStart = perfStart_();
  var stepStart = perfStart_();

  ensureTableDatabaseReady_();
  perfLog_('GET_TABLE_ORDER ensure database', stepStart);

  stepStart = perfStart_();
  var tables = getSheetTable_('tables').records;
  var orderId = stringValue_(request.order_id || request.orderId);
  var table = null;

  if (orderId) {
    table = findTableByOrderId_(tables, orderId);
  } else {
    table = findTableFromRequest_(tables, request);
    orderId = table ? stringValue_(getValueByAliases_(table, ['current_order_id'], '')) : '';
  }
  perfLog_('GET_TABLE_ORDER read table', stepStart);

  if (!orderId && table) {
    stepStart = perfStart_();
    var emptyResponse = buildEmptyTableOrderResponse_(table);

    perfLog_('GET_TABLE_ORDER build totals', stepStart);
    perfLog_('GET_TABLE_ORDER total', totalStart);

    return emptyResponse;
  }

  if (!orderId) {
    var missingResponse = {
      success: false,
      error: 'MISSING_ORDER_ID',
      message: 'Missing table or order_id'
    };

    perfLog_('GET_TABLE_ORDER total', totalStart);

    return missingResponse;
  }

  stepStart = perfStart_();
  var orders = getSheetTable_('orders').records;
  var order = findRecordByValue_(orders, ['order_id'], orderId);
  perfLog_('GET_TABLE_ORDER read order', stepStart);

  if (!order) {
    var notFoundResponse = {
      success: false,
      error: 'ORDER_NOT_FOUND',
      message: 'Order not found'
    };

    perfLog_('GET_TABLE_ORDER total', totalStart);

    return notFoundResponse;
  }

  if (!table) {
    table = findTableByOrder_(tables, order);
  }

  stepStart = perfStart_();
  var orderItems = getOrderItemsFromRecords_(getSheetTable_('order_items').records, orderId);
  perfLog_('GET_TABLE_ORDER read items', stepStart);

  stepStart = perfStart_();
  var payments = [];

  if (isOrderPaid_(order)) {
    payments = getSheetTable_('payments').records.filter(function (payment) {
      return stringValue_(getValueByAliases_(payment, ['order_id'], '')) === orderId;
    });
    perfLog_('GET_TABLE_ORDER read payments', stepStart);
  } else {
    perfLog_('GET_TABLE_ORDER skipped payments read for unpaid order', stepStart);
  }

  stepStart = perfStart_();
  var response = buildTableOrderResponse_(table, orderId, 'Table order loaded', {
    order: order,
    items: orderItems,
    payments: payments
  });

  perfLog_('GET_TABLE_ORDER build totals', stepStart);
  perfLog_('GET_TABLE_ORDER total', totalStart);

  return response;
}

function addItemsToTableOrder_(request) {
  var orderId = stringValue_(request.order_id || request.orderId);
  var items = Array.isArray(request.items) ? request.items : [];

  if (!orderId) {
    return {
      success: false,
      error: 'MISSING_ORDER_ID',
      message: 'Missing order_id'
    };
  }

  if (!items.length) {
    return {
      success: false,
      error: 'EMPTY_ITEMS',
      message: 'No items to add'
    };
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    ensureTableDatabaseReady_();

    var timestamp = nowIso_();
    var ordersTable = getSheetTable_('orders');
    var order = findRecordByValue_(ordersTable.records, ['order_id'], orderId);

    if (!order) {
      return {
        success: false,
        error: 'ORDER_NOT_FOUND',
        message: 'Order not found'
      };
    }

    if (isOrderPaid_(order)) {
      return {
        success: false,
        error: 'ORDER_ALREADY_PAID',
        message: 'Order is already paid'
      };
    }

    var createdBy = stringValue_(request.created_by || request.user_id || request.userId || 'STAFF');
    var addResult = addItemsToTableOrderInternal_(ordersTable, order, items, createdBy, timestamp);
    var tablesTable = getSheetTable_('tables');
    var table = findTableByOrderId_(tablesTable.records, orderId) || findTableByOrder_(tablesTable.records, order);
    var payments = getSheetTable_('payments').records.filter(function (payment) {
      return stringValue_(getValueByAliases_(payment, ['order_id'], '')) === orderId;
    });

    return buildTableOrderResponse_(table, orderId, 'Table order loaded', {
      order: order,
      items: addResult.allItems,
      payments: payments
    });
  } catch (err) {
    return {
      success: false,
      message: err && err.message ? err.message : String(err)
    };
  } finally {
    lock.releaseLock();
  }
}

function updateTableOrderItem_(request) {
  var orderId = stringValue_(request.order_id || request.orderId);
  var itemId = stringValue_(request.item_id || request.itemId);
  var rawQuantity = typeof request.quantity !== 'undefined' ? request.quantity : request.qty;
  var quantity = numberValue_(rawQuantity);

  if (!orderId) {
    return {
      success: false,
      error: 'MISSING_ORDER_ID',
      message: 'Missing order_id'
    };
  }

  if (!itemId) {
    return {
      success: false,
      error: 'MISSING_ITEM_ID',
      message: 'Missing item_id'
    };
  }

  if (typeof rawQuantity === 'undefined' || rawQuantity === '' || quantity < 0) {
    return {
      success: false,
      error: 'INVALID_QUANTITY',
      message: 'Quantity must be zero or greater'
    };
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    ensureTableDatabaseReady_();

    var timestamp = nowIso_();
    var ordersTable = getSheetTable_('orders');
    var order = findRecordByValue_(ordersTable.records, ['order_id'], orderId);

    if (!order) {
      return {
        success: false,
        error: 'ORDER_NOT_FOUND',
        message: 'Order not found'
      };
    }

    if (isOrderPaid_(order)) {
      return {
        success: false,
        error: 'ORDER_ALREADY_PAID',
        message: 'Paid orders cannot be edited'
      };
    }

    var paymentStatus = stringValue_(getValueByAliases_(order, ['payment_status'], '')).toUpperCase();

    if (paymentStatus !== PAYMENT_STATUS_UNPAID) {
      return {
        success: false,
        error: 'ORDER_NOT_UNPAID',
        message: 'Only unpaid orders can be edited'
      };
    }

    var orderItemsTable = getSheetTable_('order_items');
    var allOrderItems = getOrderItemsFromRecords_(orderItemsTable.records, orderId);
    var item = allOrderItems.filter(function (record) {
      return stringValue_(getValueByAliases_(record, ['item_id'], '')) === itemId;
    })[0] || null;

    if (!item) {
      return {
        success: false,
        error: 'ITEM_NOT_FOUND',
        message: 'Order item not found'
      };
    }

    if (!getConfirmedBillOrderItems_([item]).length) {
      return {
        success: false,
        error: 'ITEM_NOT_EDITABLE',
        message: 'Only confirmed bill items can be edited'
      };
    }

    if (quantity <= 0) {
      updateOrderItemRecordFields_(orderItemsTable, item, {
        status: ORDER_ITEM_STATUS_CANCELLED
      }, timestamp);
    } else {
      var unitPrice = numberValue_(getValueByAliases_(item, ['unit_price'], 0));
      var discount = numberValue_(getValueByAliases_(item, ['discount'], 0));
      var total = Math.max(0, quantity * unitPrice - discount);

      updateOrderItemRecordFields_(orderItemsTable, item, {
        quantity: quantity,
        total: total,
        status: ORDER_ITEM_STATUS_NEW
      }, timestamp);
    }

    var totals = calculateConfirmedOrderItemTotals_(allOrderItems);
    updateOrderTotals_(ordersTable, order, totals, timestamp);

    var tablesTable = getSheetTable_('tables');
    var table = findTableByOrderId_(tablesTable.records, orderId) || findTableByOrder_(tablesTable.records, order);

    return buildTableOrderResponse_(table, orderId, 'Table order item updated', {
      order: order,
      items: allOrderItems,
      payments: []
    });
  } catch (err) {
    return {
      success: false,
      message: err && err.message ? err.message : String(err)
    };
  } finally {
    lock.releaseLock();
  }
}

function confirmTablePendingItems_(request) {
  return updateTablePendingItemStatuses_(request, ORDER_ITEM_STATUS_NEW, 'Pending QR items confirmed');
}

function rejectTablePendingItems_(request) {
  return updateTablePendingItemStatuses_(request, ORDER_ITEM_STATUS_REJECTED, 'Pending QR items rejected');
}

function updateTablePendingItemStatuses_(request, nextStatus, message) {
  var orderId = stringValue_(request.order_id || request.orderId);
  var requestedItemIds = Array.isArray(request.item_ids || request.itemIds)
    ? (request.item_ids || request.itemIds).map(stringValue_)
    : [];
  var shouldUpdateAllPending = requestedItemIds.length === 0;

  if (!orderId) {
    return {
      success: false,
      error: 'MISSING_ORDER_ID',
      message: 'Missing order_id'
    };
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    ensureTableDatabaseReady_();

    var timestamp = nowIso_();
    var ordersTable = getSheetTable_('orders');
    var order = findRecordByValue_(ordersTable.records, ['order_id'], orderId);

    if (!order) {
      return {
        success: false,
        error: 'ORDER_NOT_FOUND',
        message: 'Order not found'
      };
    }

    if (isOrderPaid_(order)) {
      return {
        success: false,
        error: 'ORDER_ALREADY_PAID',
        message: 'Order is already paid'
      };
    }

    var orderItemsTable = getSheetTable_('order_items');
    var allOrderItems = getOrderItemsFromRecords_(orderItemsTable.records, orderId);
    var requestedById = {};
    requestedItemIds.forEach(function (itemId) {
      if (itemId) {
        requestedById[itemId] = true;
      }
    });
    var itemsToUpdate = allOrderItems.filter(function (item) {
      var itemId = stringValue_(getValueByAliases_(item, ['item_id'], ''));

      return isPendingConfirmOrderItem_(item) && (shouldUpdateAllPending || requestedById[itemId]);
    });

    if (!itemsToUpdate.length) {
      var tablesTable = getSheetTable_('tables');
      var table = findTableByOrderId_(tablesTable.records, orderId) || findTableByOrder_(tablesTable.records, order);

      return buildTableOrderResponse_(table, orderId, 'No pending QR items to update', {
        order: order,
        items: allOrderItems,
        payments: []
      });
    }

    updateOrderItemStatusRows_(orderItemsTable, itemsToUpdate, nextStatus, timestamp);

    var totals = calculateConfirmedOrderItemTotals_(allOrderItems);
    updateOrderTotals_(ordersTable, order, totals, timestamp);

    var diningTablesTable = getSheetTable_('tables');
    var diningTable = findTableByOrderId_(diningTablesTable.records, orderId) || findTableByOrder_(diningTablesTable.records, order);

    return buildTableOrderResponse_(diningTable, orderId, message, {
      order: order,
      items: allOrderItems,
      payments: []
    });
  } catch (err) {
    return {
      success: false,
      message: err && err.message ? err.message : String(err)
    };
  } finally {
    lock.releaseLock();
  }
}

function clearTableOrder_(request) {
  var tableNo = stringValue_(request.table_no || request.tableNo || request.table);
  var requestedOrderId = stringValue_(request.order_id || request.orderId);

  if (!tableNo && !requestedOrderId) {
    return {
      success: false,
      error: 'MISSING_TABLE_OR_ORDER',
      message: 'Missing table_no or order_id'
    };
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    ensureTableDatabaseReady_();

    var timestamp = nowIso_();
    var tablesTable = getSheetTable_('tables');
    var table = tableNo
      ? findTableFromRequest_(tablesTable.records, { table_no: tableNo })
      : findTableByOrderId_(tablesTable.records, requestedOrderId);

    if (!table || !isTruthy_(getValueByAliases_(table, ['is_active'], false))) {
      return {
        success: false,
        error: 'TABLE_NOT_FOUND',
        message: 'Table not found'
      };
    }

    var currentOrderId = stringValue_(getValueByAliases_(table, ['current_order_id'], ''));

    if (!currentOrderId) {
      return {
        success: false,
        error: 'NO_ACTIVE_TABLE_ORDER',
        message: 'Table has no active order'
      };
    }

    if (requestedOrderId && requestedOrderId !== currentOrderId) {
      return {
        success: false,
        error: 'TABLE_ORDER_MISMATCH',
        message: 'table_no and order_id do not match'
      };
    }

    var orderId = requestedOrderId || currentOrderId;
    var ordersTable = getSheetTable_('orders');
    var order = findRecordByValue_(ordersTable.records, ['order_id'], orderId);

    if (!order) {
      return {
        success: false,
        error: 'ORDER_NOT_FOUND',
        message: 'Order not found'
      };
    }

    if (isOrderPaid_(order)) {
      return {
        success: false,
        error: 'ORDER_ALREADY_PAID',
        message: 'Paid orders cannot be cleared'
      };
    }

    var paymentStatus = stringValue_(getValueByAliases_(order, ['payment_status'], '')).toUpperCase();

    if (paymentStatus !== PAYMENT_STATUS_UNPAID) {
      return {
        success: false,
        error: 'ORDER_NOT_UNPAID',
        message: 'Only unpaid orders can be cleared'
      };
    }

    var reason = stringValue_(request.reason || '');
    var existingNote = stringValue_(getValueByAliases_(order, ['note'], ''));
    var note = existingNote;

    if (reason) {
      note = existingNote
        ? existingNote + '\nClear reason: ' + reason
        : 'Clear reason: ' + reason;
    }

    updateOrderRecordFields_(ordersTable, order, {
      status: ORDER_STATUS_CANCELLED,
      payment_status: PAYMENT_STATUS_CANCELLED,
      note: note,
      closed_at: timestamp,
      updated_at: timestamp
    });

    var orderItemsTable = getSheetTable_('order_items');
    var orderItems = orderItemsTable.records.filter(function (item) {
      return stringValue_(getValueByAliases_(item, ['order_id'], '')) === orderId;
    });
    updateOrderItemStatusRows_(orderItemsTable, orderItems, ORDER_ITEM_STATUS_CANCELLED, timestamp);

    updateTableRecordFields_(tablesTable, table, {
      status: TABLE_STATUS_AVAILABLE,
      current_order_id: ''
    }, timestamp);
    table.status = TABLE_STATUS_AVAILABLE;
    table.current_order_id = '';

    return {
      success: true,
      message: 'Table cleared',
      table: normalizeTableRecord_(table),
      order: normalizeOrderRecord_(order),
      cancelled_item_count: orderItems.length
    };
  } catch (err) {
    return {
      success: false,
      message: err && err.message ? err.message : String(err)
    };
  } finally {
    lock.releaseLock();
  }
}

function payTableOrder_(request) {
  var totalStart = perfStart_();
  var orderId = stringValue_(request.order_id || request.orderId);

  if (!orderId) {
    var missingResponse = {
      success: false,
      error: 'MISSING_ORDER_ID',
      message: 'Missing order_id'
    };

    perfLog_('PAY_TABLE_ORDER total', totalStart);

    return missingResponse;
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    var stepStart = perfStart_();

    ensureTableDatabaseReady_();
    perfLog_('PAY_TABLE_ORDER ensure database', stepStart);

    var timestamp = nowIso_();
    var tables = {};

    stepStart = perfStart_();
    tables.orders = getSheetTable_('orders');
    var order = findRecordByValue_(tables.orders.records, ['order_id'], orderId);
    perfLog_('PAY_TABLE_ORDER read orders', stepStart);

    if (!order) {
      var notFoundResponse = {
        success: false,
        error: 'ORDER_NOT_FOUND',
        message: 'Order not found'
      };

      perfLog_('PAY_TABLE_ORDER total', totalStart);

      return notFoundResponse;
    }

    if (isOrderPaid_(order)) {
      var paidResponse = {
        success: false,
        error: 'ORDER_ALREADY_PAID',
        message: 'Order is already PAID'
      };

      perfLog_('PAY_TABLE_ORDER total', totalStart);

      return paidResponse;
    }

    stepStart = perfStart_();
    tables.order_items = getSheetTable_('order_items');
    var orderItems = getOrderItemsFromRecords_(tables.order_items.records, orderId);
    perfLog_('PAY_TABLE_ORDER read order_items', stepStart);

    var pendingItems = getPendingConfirmOrderItems_(orderItems);

    if (pendingItems.length) {
      var pendingResponse = {
        success: false,
        error: 'PENDING_ITEMS_EXIST',
        message: 'Please confirm or reject pending QR items before payment.'
      };

      perfLog_('PAY_TABLE_ORDER total', totalStart);

      return pendingResponse;
    }

    var confirmedOrderItems = getConfirmedBillOrderItems_(orderItems);

    stepStart = perfStart_();
    tables.menus = getSheetTable_('menus');
    perfLog_('PAY_TABLE_ORDER read menus', stepStart);

    stepStart = perfStart_();
    tables.dining_tables = getSheetTable_('tables');
    perfLog_('PAY_TABLE_ORDER read tables', stepStart);

    stepStart = perfStart_();
    var settingsResult = getSettingsMapCachedResult_();
    var settingsMap = settingsResult.settingsMap;
    perfLog_('PAY_TABLE_ORDER ' + (settingsResult.fromCache ? 'cached settings' : 'read settings'), stepStart);

    stepStart = perfStart_();
    var directStockPlan = buildDirectStockPlan_(confirmedOrderItems, tables.menus.records);
    var allowNegativeStock = isTruthy_(settingsMap.allow_negative_stock || false);
    var insufficientStock = findInsufficientDirectStock_(directStockPlan, allowNegativeStock);
    var stockLogsTable = directStockPlan.length ? getSheetTableHeadersOnly_('stock_logs') : null;

    if (insufficientStock) {
      var stockResponse = {
        success: false,
        error: 'INSUFFICIENT_STOCK',
        message: 'Not enough stock for ' + insufficientStock.menu_name
      };

      perfLog_('PAY_TABLE_ORDER validate stock', stepStart);
      perfLog_('PAY_TABLE_ORDER total', totalStart);

      return stockResponse;
    }

    validateDirectStockTablesForCheckout_(directStockPlan, tables.menus, stockLogsTable);
    perfLog_('PAY_TABLE_ORDER validate stock', stepStart);

    stepStart = perfStart_();
    var paymentSource = request.payment || request;
    var orderTotal = numberValue_(getValueByAliases_(order, ['total'], 0));
    var createdBy = stringValue_(request.created_by || paymentSource.created_by || request.user_id || 'STAFF');
    var paymentRecord = buildCheckoutPaymentRecord_(
      orderId,
      orderTotal,
      paymentSource,
      createdBy,
      timestamp
    );

    appendRowsToTable_(getSheetTableHeadersOnly_('payments'), [paymentRecord]);
    perfLog_('PAY_TABLE_ORDER create payment', stepStart);

    var deductedStock = applyDirectStockPlanForCheckout_(
      orderId,
      directStockPlan,
      tables.menus,
      stockLogsTable,
      createdBy,
      timestamp,
      'PAY_TABLE_ORDER'
    );

    stepStart = perfStart_();
    updatePaidOrder_(tables.orders, order, timestamp);
    order.status = ORDER_STATUS_PAID;
    order.payment_status = PAYMENT_STATUS_PAID;
    order.updated_at = timestamp;
    order.closed_at = timestamp;
    perfLog_('PAY_TABLE_ORDER update order', stepStart);

    stepStart = perfStart_();
    var table = findTableByOrderId_(tables.dining_tables.records, orderId) || findTableByOrder_(tables.dining_tables.records, order);

    if (table) {
      updateTableRecordFields_(tables.dining_tables, table, {
        status: TABLE_STATUS_AVAILABLE,
        current_order_id: ''
      }, timestamp);
      table.status = TABLE_STATUS_AVAILABLE;
      table.current_order_id = '';
    }
    perfLog_('PAY_TABLE_ORDER release table', stepStart);

    stepStart = perfStart_();
    var normalizedOrder = normalizeOrderRecord_(order);
    var normalizedItems = confirmedOrderItems.map(normalizeOrderItemRecord_);
    var normalizedPayment = normalizePaymentRecord_(paymentRecord);
    var receipt = buildReceiptSummaryFromSettings_(normalizedOrder, normalizedPayment, settingsMap);
    perfLog_('PAY_TABLE_ORDER build receipt', stepStart);

    var response = {
      success: true,
      message: 'Table order paid',
      order: normalizedOrder,
      items: normalizedItems,
      payment: normalizedPayment,
      receipt: receipt,
      deductedStock: deductedStock
    };

    perfLog_('PAY_TABLE_ORDER total', totalStart);

    return response;
  } catch (err) {
    var errorResponse = {
      success: false,
      message: err && err.message ? err.message : String(err)
    };

    perfLog_('PAY_TABLE_ORDER total', totalStart);

    return errorResponse;
  } finally {
    lock.releaseLock();
  }
}

function getTableQrLinks_(request) {
  ensureTableDatabaseReady_();

  var baseUrl = stringValue_(request.base_url || request.baseUrl);

  if (!baseUrl) {
    return {
      success: false,
      error: 'MISSING_BASE_URL',
      message: 'base_url is required'
    };
  }

  var separator = baseUrl.indexOf('?') >= 0 ? '&' : '?';
  var qrLinks = getActiveTableRecordsSorted_().map(function (table) {
    var tableNo = stringValue_(getValueByAliases_(table, ['table_no', 'table_id'], ''));
    var token = stringValue_(getValueByAliases_(table, ['qr_token'], ''));

    return {
      table_no: tableNo,
      table_name: stringValue_(getValueByAliases_(table, ['table_name'], tableNo)),
      qr_token: token,
      qr_url: baseUrl + separator + 'table=' + encodeURIComponent(tableNo) + '&token=' + encodeURIComponent(token)
    };
  });

  return {
    success: true,
    base_url: baseUrl,
    qr_links: qrLinks
  };
}

function regenerateTableQrTokens_(request) {
  var authResult = requireAdminToken_(request);

  if (!authResult.success) {
    return authResult;
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    ensureTableDatabaseReady_();

    var table = getSheetTable_('tables');
    var activeTables = getActiveTableRecordsSortedFromRecords_(table.records);
    var unavailableTable = activeTables.filter(function (record) {
      var status = normalizeTableStatus_(getValueByAliases_(record, ['status'], TABLE_STATUS_AVAILABLE));
      var currentOrderId = stringValue_(getValueByAliases_(record, ['current_order_id'], ''));

      return status !== TABLE_STATUS_AVAILABLE || currentOrderId;
    })[0];

    if (unavailableTable) {
      return {
        success: false,
        error: 'TABLES_NOT_AVAILABLE',
        message: 'All tables must be available before regenerating QR tokens.'
      };
    }

    var tokenColumn = getHeaderColumn_(table.headers, ['qr_token']);
    var updatedAtColumn = getHeaderColumn_(table.headers, ['updated_at']);

    if (!tokenColumn) {
      throw new Error('tables sheet is missing qr_token header');
    }

    var usedTokens = {};
    var timestamp = nowIso_();
    var responseTables = [];

    activeTables.forEach(function (record) {
      var token = makeUniqueTableQrToken_(usedTokens);

      table.sheet.getRange(record._rowNumber, tokenColumn).setValue(token);
      record.qr_token = token;

      if (updatedAtColumn) {
        table.sheet.getRange(record._rowNumber, updatedAtColumn).setValue(timestamp);
        record.updated_at = timestamp;
      }

      responseTables.push({
        table_no: stringValue_(getValueByAliases_(record, ['table_no', 'table_id'], '')),
        table_name: stringValue_(getValueByAliases_(record, ['table_name', 'table_no', 'table_id'], '')),
        qr_token: token
      });
    });

    return {
      success: true,
      message: 'Table QR tokens regenerated',
      tables: responseTables
    };
  } catch (err) {
    return {
      success: false,
      message: err && err.message ? err.message : String(err)
    };
  } finally {
    lock.releaseLock();
  }
}

function submitQrTableOrder_(request) {
  var tableNo = stringValue_(request.table_no || request.tableNo || request.table);
  var qrToken = stringValue_(request.qr_token || request.qrToken || request.token);
  var items = Array.isArray(request.items) ? request.items : [];

  if (!tableNo || !qrToken) {
    return {
      success: false,
      error: 'INVALID_TABLE_QR',
      message: 'Invalid table QR'
    };
  }

  if (!items.length) {
    return {
      success: false,
      error: 'EMPTY_ITEMS',
      message: 'No items to submit'
    };
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    ensureTableDatabaseReady_();

    var timestamp = nowIso_();
    var tablesTable = getSheetTable_('tables');
    var table = findTableFromRequest_(tablesTable.records, {
      table_no: tableNo
    });

    if (!table || !isTruthy_(getValueByAliases_(table, ['is_active'], false))) {
      return {
        success: false,
        error: 'INVALID_TABLE_QR',
        message: 'Invalid table QR'
      };
    }

    var expectedToken = stringValue_(getValueByAliases_(table, ['qr_token'], ''));

    if (!expectedToken || expectedToken !== qrToken) {
      return {
        success: false,
        error: 'INVALID_TABLE_QR',
        message: 'Invalid table QR'
      };
    }

    var ordersTable = getSheetTable_('orders');
    var orderId = stringValue_(getValueByAliases_(table, ['current_order_id'], ''));
    var order = orderId ? findRecordByValue_(ordersTable.records, ['order_id'], orderId) : null;

    if (!order || isOrderPaid_(order)) {
      var note = buildQrOrderNote_(request);
      order = createEmptyTableOrder_(ordersTable, table, {
        note: note,
        created_by: 'QR',
        order_type: 'DINE_IN'
      }, 'QR', timestamp);
      orderId = order.order_id;

      updateTableRecordFields_(tablesTable, table, {
        status: TABLE_STATUS_OCCUPIED,
        current_order_id: orderId
      }, timestamp);
      table.status = TABLE_STATUS_OCCUPIED;
      table.current_order_id = orderId;
    } else if (stringValue_(request.note || request.customer_name || request.customerName)) {
      appendOrderNote_(ordersTable, order, buildQrOrderNote_(request), timestamp);
    }

    var addResult = addItemsToTableOrderInternal_(ordersTable, order, items, 'QR', timestamp, {
      status: ORDER_ITEM_STATUS_PENDING_CONFIRM
    });
    var submittedTotals = calculateOrderItemTotals_(addResult.newItems);

    return {
      success: true,
      message: 'Order submitted',
      table_no: tableNo,
      order_no: stringValue_(getValueByAliases_(order, ['order_no'], '')),
      items: addResult.newItems.map(normalizeOrderItemRecord_),
      total: submittedTotals.total,
      pending_total: addResult.pending_totals.total,
      pending_item_count: addResult.pending_totals.item_count
    };
  } catch (err) {
    return {
      success: false,
      message: err && err.message ? err.message : String(err)
    };
  } finally {
    lock.releaseLock();
  }
}

function createEmptyTableOrder_(ordersTable, table, request, createdBy, timestamp) {
  var tableNo = stringValue_(getValueByAliases_(table, ['table_no', 'table_id'], ''));
  var orderId = makeId_('ORD');
  var orderNo = generateNextOrderNoFromRecords_(ordersTable.records);
  var order = {
    order_id: orderId,
    order_no: orderNo,
    order_type: 'DINE_IN',
    table_no: tableNo,
    table_id: stringValue_(getValueByAliases_(table, ['table_id', 'table_no'], tableNo)),
    status: ORDER_STATUS_NEW,
    payment_status: PAYMENT_STATUS_UNPAID,
    subtotal: 0,
    discount: 0,
    service_charge: 0,
    tax: 0,
    total: 0,
    note: stringValue_(request.note || ''),
    created_by: createdBy,
    created_at: timestamp,
    updated_at: timestamp,
    closed_at: ''
  };
  var rowNumber = ordersTable.sheet.getLastRow() + 1;

  appendRowsToTable_(ordersTable, [order]);
  order._rowNumber = rowNumber;
  ordersTable.records.push(order);

  return order;
}

function addItemsToTableOrderInternal_(ordersTable, order, items, createdBy, timestamp, options) {
  options = options || {};
  var menusTable = getSheetTable_('menus');
  var orderItemsTable = getSheetTable_('order_items');
  var menuById = indexRecordsByValue_(menusTable.records, ['menu_id']);
  var existingItems = getOrderItemsFromRecords_(orderItemsTable.records, order.order_id);
  var newItems = buildTableOrderItemRecords_(order.order_id, items, menuById, createdBy, timestamp, {
    status: options.status || ORDER_ITEM_STATUS_NEW
  });
  var allItems = existingItems.concat(newItems);
  var totals = calculateConfirmedOrderItemTotals_(allItems);
  var pendingTotals = calculatePendingOrderItemTotals_(allItems);

  appendRowsToTable_(orderItemsTable, newItems);
  updateOrderTotals_(ordersTable, order, totals, timestamp);

  return {
    newItems: newItems,
    allItems: allItems,
    totals: totals,
    pending_totals: pendingTotals
  };
}

function buildTableOrderItemRecords_(orderId, items, menuById, createdBy, timestamp, options) {
  options = options || {};
  var status = stringValue_(options.status || ORDER_ITEM_STATUS_NEW) || ORDER_ITEM_STATUS_NEW;

  return items.map(function (item) {
    var menuId = stringValue_(item.menu_id || item.menuId);
    var quantity = numberValue_(item.quantity || item.qty || 0);

    if (!menuId || quantity <= 0) {
      throw new Error('Invalid order item');
    }

    var menu = menuById[menuId];

    if (!menu) {
      throw new Error('Menu not found: ' + menuId);
    }

    var menuNameSnapshot = stringValue_(getValueByAliases_(menu, ['name_th', 'menu_name'], menuId));
    var unitPrice = numberValue_(getValueByAliases_(menu, ['price', 'base_price'], 0));
    var discount = numberValue_(item.discount || 0);
    var total = Math.max(0, quantity * unitPrice - discount);

    return {
      item_id: makeId_('ITEM'),
      order_id: orderId,
      menu_id: menuId,
      menu_name_snapshot: menuNameSnapshot,
      menu_name: menuNameSnapshot,
      quantity: quantity,
      unit_price: unitPrice,
      option_text: stringValue_(item.option_text || item.optionText || ''),
      discount: discount,
      total: total,
      note: stringValue_(item.note || ''),
      status: status,
      created_at: timestamp,
      updated_at: timestamp,
      created_by: createdBy
    };
  });
}

function updateOrderTotals_(ordersTable, order, totals, timestamp) {
  var updates = {
    subtotal: totals.subtotal,
    discount: totals.discount,
    total: totals.total,
    updated_at: timestamp
  };

  Object.keys(updates).forEach(function (field) {
    var column = getHeaderColumn_(ordersTable.headers, [field]);

    if (column) {
      ordersTable.sheet.getRange(order._rowNumber, column).setValue(updates[field]);
    }

    order[field] = updates[field];
  });
}

function updateOrderRecordFields_(ordersTable, order, updates) {
  Object.keys(updates || {}).forEach(function (field) {
    var column = getHeaderColumn_(ordersTable.headers, [field]);

    if (column) {
      ordersTable.sheet.getRange(order._rowNumber, column).setValue(updates[field]);
      order[field] = updates[field];
    }
  });
}

function appendOrderNote_(ordersTable, order, note, timestamp) {
  note = stringValue_(note);

  if (!note) {
    return;
  }

  var existingNote = stringValue_(getValueByAliases_(order, ['note'], ''));
  var nextNote = existingNote ? existingNote + '\n' + note : note;
  var noteColumn = getHeaderColumn_(ordersTable.headers, ['note']);
  var updatedAtColumn = getHeaderColumn_(ordersTable.headers, ['updated_at']);

  if (noteColumn) {
    ordersTable.sheet.getRange(order._rowNumber, noteColumn).setValue(nextNote);
    order.note = nextNote;
  }

  if (updatedAtColumn) {
    ordersTable.sheet.getRange(order._rowNumber, updatedAtColumn).setValue(timestamp);
    order.updated_at = timestamp;
  }
}

function updateTableRecordFields_(table, record, updates, timestamp) {
  var keys = Object.keys(updates || {});

  if (!record || !keys.length) {
    return;
  }

  keys.forEach(function (field) {
    var column = getHeaderColumn_(table.headers, [field]);

    if (column) {
      table.sheet.getRange(record._rowNumber, column).setValue(updates[field]);
      record[field] = updates[field];
    }
  });

  var updatedAtColumn = getHeaderColumn_(table.headers, ['updated_at']);

  if (updatedAtColumn) {
    table.sheet.getRange(record._rowNumber, updatedAtColumn).setValue(timestamp);
    record.updated_at = timestamp;
  }
}

function buildTableOrderResponse_(table, orderId, message, preloaded) {
  preloaded = preloaded || {};
  var order = preloaded.order || findRecordByValue_(readSheetRecordsByHeaders_('orders'), ['order_id'], orderId);

  if (!order) {
    return {
      success: false,
      error: 'ORDER_NOT_FOUND',
      message: 'Order not found'
    };
  }

  var sourceItems = preloaded.items || getOrderItemsForOrder_(orderId);
  var sourcePayments = preloaded.payments || readSheetRecordsByHeaders_('payments')
    .filter(function (payment) {
      return stringValue_(getValueByAliases_(payment, ['order_id'], '')) === orderId;
    });
  var confirmedSourceItems = getConfirmedBillOrderItems_(sourceItems);
  var pendingSourceItems = getPendingConfirmOrderItems_(sourceItems);
  var items = confirmedSourceItems.map(normalizeOrderItemRecord_);
  var pendingItems = pendingSourceItems.map(normalizeOrderItemRecord_);
  var payments = sourcePayments.map(normalizePaymentRecord_);
  var totals = calculateOrderItemTotals_(confirmedSourceItems);
  var pendingTotals = calculateOrderItemTotals_(pendingSourceItems);
  var normalizedOrder = normalizeOrderRecord_(order);

  return {
    success: true,
    message: message || 'Table order loaded',
    table: table ? normalizeTableRecord_(table) : {},
    order: normalizedOrder,
    items: items,
    pending_items: pendingItems,
    payments: payments,
    totals: totals,
    pending_totals: {
      subtotal: pendingTotals.subtotal,
      item_count: pendingTotals.item_count,
      total: pendingTotals.total
    }
  };
}

function buildEmptyTableOrderResponse_(table) {
  return {
    success: true,
    table: normalizeTableRecord_(table),
    order: null,
    items: [],
    pending_items: [],
    payments: [],
    totals: {
      subtotal: 0,
      discount: 0,
      total: 0,
      item_count: 0
    },
    pending_totals: {
      subtotal: 0,
      item_count: 0,
      total: 0
    }
  };
}

function getActiveTableRecordsSorted_() {
  return getActiveTableRecordsSortedFromRecords_(getSheetTable_('tables').records);
}

function getActiveTableRecordsSortedFromRecords_(records) {
  return records
    .filter(function (table) {
      return isTruthy_(getValueByAliases_(table, ['is_active'], false));
    })
    .sort(function (a, b) {
      var leftSort = numberValue_(getValueByAliases_(a, ['sort_order'], 0));
      var rightSort = numberValue_(getValueByAliases_(b, ['sort_order'], 0));

      if (leftSort !== rightSort) {
        return leftSort - rightSort;
      }

      return stringValue_(getValueByAliases_(a, ['table_no', 'table_id'], ''))
        .localeCompare(stringValue_(getValueByAliases_(b, ['table_no', 'table_id'], '')));
    });
}

function findTableFromRequest_(tables, request) {
  var tableId = stringValue_(request.table_id || request.tableId);
  var tableNo = stringValue_(request.table_no || request.tableNo || request.table);
  var target = tableId || tableNo;

  if (!target) {
    return null;
  }

  return tables.filter(function (table) {
    return stringValue_(getValueByAliases_(table, ['table_id'], '')) === target ||
      stringValue_(getValueByAliases_(table, ['table_no'], '')) === target;
  })[0] || null;
}

function findTableByOrderId_(tables, orderId) {
  return tables.filter(function (table) {
    return stringValue_(getValueByAliases_(table, ['current_order_id'], '')) === orderId;
  })[0] || null;
}

function findTableByOrder_(tables, order) {
  var tableNo = stringValue_(getValueByAliases_(order, ['table_no', 'table_id'], ''));

  if (!tableNo) {
    return null;
  }

  return findTableFromRequest_(tables, {
    table_no: tableNo
  });
}

function normalizeTableRecord_(table) {
  return {
    table_id: stringValue_(getValueByAliases_(table, ['table_id'], '')),
    table_no: stringValue_(getValueByAliases_(table, ['table_no', 'table_id'], '')),
    table_name: stringValue_(getValueByAliases_(table, ['table_name', 'table_no', 'table_id'], '')),
    status: normalizeTableStatus_(getValueByAliases_(table, ['status'], TABLE_STATUS_AVAILABLE)),
    current_order_id: stringValue_(getValueByAliases_(table, ['current_order_id'], '')),
    qr_token: stringValue_(getValueByAliases_(table, ['qr_token'], '')),
    sort_order: numberValue_(getValueByAliases_(table, ['sort_order'], 0)),
    is_active: isTruthy_(getValueByAliases_(table, ['is_active'], false))
  };
}

function normalizeTableStatus_(status) {
  var normalized = stringValue_(status).toUpperCase();

  if (normalized === TABLE_STATUS_OCCUPIED || normalized === TABLE_STATUS_READY_TO_PAY) {
    return normalized;
  }

  return TABLE_STATUS_AVAILABLE;
}

function getOrderItemsFromRecords_(records, orderId) {
  return records.filter(function (item) {
    return stringValue_(getValueByAliases_(item, ['order_id'], '')) === orderId &&
      !isSkippedOrderItem_(item);
  });
}

function buildItemCountByOrderId_(orderItems, allowedOrderIds) {
  var counts = {};

  orderItems.forEach(function (item) {
    if (isSkippedOrderItem_(item)) {
      return;
    }

    var orderId = stringValue_(getValueByAliases_(item, ['order_id'], ''));

    if (!orderId) {
      return;
    }

    if (allowedOrderIds && !allowedOrderIds[orderId]) {
      return;
    }

    counts[orderId] = (counts[orderId] || 0) + numberValue_(getValueByAliases_(item, ['quantity', 'qty'], 0));
  });

  return counts;
}

function buildOrderItemSummaryByOrderId_(orderItems, allowedOrderIds) {
  var summaries = {};

  orderItems.forEach(function (item) {
    if (isSkippedOrderItem_(item)) {
      return;
    }

    var orderId = stringValue_(getValueByAliases_(item, ['order_id'], ''));

    if (!orderId) {
      return;
    }

    if (allowedOrderIds && !allowedOrderIds[orderId]) {
      return;
    }

    if (!summaries[orderId]) {
      summaries[orderId] = {
        confirmedItems: [],
        pendingItems: []
      };
    }

    if (isPendingConfirmOrderItem_(item)) {
      summaries[orderId].pendingItems.push(item);
    } else if (getConfirmedBillOrderItems_([item]).length) {
      summaries[orderId].confirmedItems.push(item);
    }
  });

  Object.keys(summaries).forEach(function (orderId) {
    summaries[orderId] = {
      totals: calculateOrderItemTotals_(summaries[orderId].confirmedItems),
      pending_totals: calculateOrderItemTotals_(summaries[orderId].pendingItems)
    };
  });

  return summaries;
}

function calculateOrderItemTotals_(items) {
  var totals = {
    subtotal: 0,
    discount: 0,
    total: 0,
    item_count: 0
  };

  items.forEach(function (item) {
    var quantity = numberValue_(getValueByAliases_(item, ['quantity', 'qty'], item.quantity || 0));
    var unitPrice = numberValue_(getValueByAliases_(item, ['unit_price'], item.unit_price || 0));
    var discount = numberValue_(getValueByAliases_(item, ['discount'], item.discount || 0));
    var total = numberValue_(getValueByAliases_(item, ['total'], item.total || 0));

    totals.subtotal += quantity * unitPrice;
    totals.discount += discount;
    totals.total += total || Math.max(0, quantity * unitPrice - discount);
    totals.item_count += quantity;
  });

  return totals;
}

function getOrderItemStatus_(item) {
  return stringValue_(getValueByAliases_(item, ['status'], '')).toUpperCase();
}

function isPendingConfirmOrderItem_(item) {
  return getOrderItemStatus_(item) === ORDER_ITEM_STATUS_PENDING_CONFIRM;
}

function isConfirmedOrderItemStatus_(status) {
  var normalized = stringValue_(status).toUpperCase();

  return normalized === ORDER_ITEM_STATUS_NEW || normalized === ORDER_ITEM_STATUS_PAID;
}

function getConfirmedBillOrderItems_(items) {
  return (items || []).filter(function (item) {
    var status = getOrderItemStatus_(item);

    return !isSkippedOrderItem_(item) &&
      !isPendingConfirmOrderItem_(item) &&
      (isConfirmedOrderItemStatus_(status) || status === '');
  });
}

function getPendingConfirmOrderItems_(items) {
  return (items || []).filter(function (item) {
    return !isSkippedOrderItem_(item) && isPendingConfirmOrderItem_(item);
  });
}

function calculateConfirmedOrderItemTotals_(items) {
  return calculateOrderItemTotals_(getConfirmedBillOrderItems_(items));
}

function calculatePendingOrderItemTotals_(items) {
  return calculateOrderItemTotals_(getPendingConfirmOrderItems_(items));
}

function updateOrderItemStatusRows_(orderItemsTable, items, nextStatus, timestamp) {
  if (!items.length) {
    return;
  }

  var statusColumn = getHeaderColumn_(orderItemsTable.headers, ['status']);
  var updatedAtColumn = getHeaderColumn_(orderItemsTable.headers, ['updated_at']);

  if (!statusColumn) {
    throw new Error('order_items sheet is missing status header');
  }

  items.forEach(function (item) {
    orderItemsTable.sheet.getRange(item._rowNumber, statusColumn).setValue(nextStatus);
    item.status = nextStatus;

    if (updatedAtColumn) {
      orderItemsTable.sheet.getRange(item._rowNumber, updatedAtColumn).setValue(timestamp);
      item.updated_at = timestamp;
    }
  });
}

function updateOrderItemRecordFields_(orderItemsTable, item, updates, timestamp) {
  Object.keys(updates || {}).forEach(function (field) {
    var column = getHeaderColumn_(orderItemsTable.headers, [field]);

    if (column) {
      orderItemsTable.sheet.getRange(item._rowNumber, column).setValue(updates[field]);
      item[field] = updates[field];
    }
  });

  var updatedAtColumn = getHeaderColumn_(orderItemsTable.headers, ['updated_at']);

  if (updatedAtColumn) {
    orderItemsTable.sheet.getRange(item._rowNumber, updatedAtColumn).setValue(timestamp);
    item.updated_at = timestamp;
  }
}

function buildQrOrderNote_(request) {
  var parts = [];
  var customerName = stringValue_(request.customer_name || request.customerName);
  var note = stringValue_(request.note);

  if (customerName) {
    parts.push('Customer: ' + customerName);
  }

  if (note) {
    parts.push(note);
  }

  return parts.join('\n');
}

function getStoredTestTableNo_() {
  var tableNo = PropertiesService.getScriptProperties().getProperty(TEST_TABLE_NO_PROPERTY);

  return stringValue_(tableNo || TEST_TABLE_DEFAULT_NO) || TEST_TABLE_DEFAULT_NO;
}

function storeTestTableOrder_(tableNo, orderId) {
  var properties = PropertiesService.getScriptProperties();

  properties.setProperty(TEST_TABLE_NO_PROPERTY, stringValue_(tableNo || TEST_TABLE_DEFAULT_NO));
  properties.setProperty(TEST_TABLE_ORDER_ID_PROPERTY, stringValue_(orderId || ''));
}

function getStoredUnpaidTestTableOrderDetail_() {
  var orderId = PropertiesService.getScriptProperties().getProperty(TEST_TABLE_ORDER_ID_PROPERTY);

  if (!orderId) {
    return null;
  }

  var detail = getTableOrder_({
    order_id: orderId
  });

  if (!detail.success || !detail.order || isOrderPaid_(detail.order)) {
    return null;
  }

  storeTestTableOrder_(
    detail.table ? detail.table.table_no : getStoredTestTableNo_(),
    detail.order.order_id
  );

  return detail;
}

function getOrCreateUnpaidTestTableOrderDetail_() {
  var storedDetail = getStoredUnpaidTestTableOrderDetail_();

  if (storedDetail) {
    return storedDetail;
  }

  var tableNo = getStoredTestTableNo_();
  var openResult = openTable_({
    table_no: tableNo,
    created_by: 'TEST'
  });

  if (!openResult.success || !openResult.order) {
    return {
      success: false,
      message: openResult.message || 'Unable to open test table order',
      table: openResult.table || null,
      order: openResult.order || null,
      items: [],
      payments: [],
      totals: {
        subtotal: 0,
        discount: 0,
        total: 0,
        item_count: 0
      }
    };
  }

  storeTestTableOrder_(openResult.table ? openResult.table.table_no : tableNo, openResult.order.order_id);

  var detail = getTableOrder_({
    order_id: openResult.order.order_id
  });

  if (!detail.success || !detail.order || isOrderPaid_(detail.order)) {
    return {
      success: false,
      message: detail.message || 'Unable to create an unpaid test table order',
      table: detail.table || openResult.table || null,
      order: detail.order || openResult.order || null,
      items: detail.items || [],
      payments: detail.payments || [],
      totals: detail.totals || {
        subtotal: 0,
        discount: 0,
        total: 0,
        item_count: 0
      }
    };
  }

  return detail;
}

function submitQrTableOrderForTest_(tableNo) {
  tableNo = stringValue_(tableNo || getStoredTestTableNo_());
  var tables = getTables_({}).tables;
  var table = tables.filter(function (row) {
    return row.table_no === tableNo;
  })[0] || tables[0];

  if (!table) {
    return {
      success: false,
      message: 'No active test table found'
    };
  }

  return submitQrTableOrder_({
    table_no: table.table_no,
    qr_token: table.qr_token,
    customer_name: 'Test Customer',
    note: 'QR pending order test',
    items: [
      {
        menu_id: TEST_DIRECT_STOCK_MENU_ID,
        quantity: 1
      }
    ]
  });
}

function testGetTables() {
  var result = getTables_({});
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function testGetTableOrder() {
  var detail = getOrCreateUnpaidTestTableOrderDetail_();
  Logger.log(JSON.stringify(detail, null, 2));
  return detail;
}

function testOpenTable() {
  var tableNo = getStoredTestTableNo_();
  var result = openTable_({
    table_no: tableNo,
    created_by: 'TEST'
  });

  if (result.success && result.order) {
    storeTestTableOrder_(result.table ? result.table.table_no : tableNo, result.order.order_id);
  }

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function testAddItemsToTableOrder() {
  ensureDirectStockTestMenu_();

  var detail = getOrCreateUnpaidTestTableOrderDetail_();

  if (!detail.success || !detail.order) {
    Logger.log(JSON.stringify(detail, null, 2));
    return detail;
  }

  var result = addItemsToTableOrder_({
    order_id: detail.order.order_id,
    created_by: 'TEST',
    items: [
      {
        menu_id: TEST_DIRECT_STOCK_MENU_ID,
        quantity: 1
      }
    ]
  });

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function testSubmitQrTableOrder() {
  ensureDirectStockTestMenu_();
  var tables = getTables_({}).tables;
  var table = tables.filter(function (row) {
    return row.table_no === 'T02';
  })[0] || tables[0];
  var result = submitQrTableOrder_({
    table_no: table.table_no,
    qr_token: table.qr_token,
    customer_name: 'Test Customer',
    note: 'QR order test',
    items: [
      {
        menu_id: TEST_DIRECT_STOCK_MENU_ID,
        quantity: 1
      }
    ]
  });
  var detail = getTableOrder_({
    table_no: table.table_no
  });

  result.verification = {
    pending_item_count: detail.pending_items ? detail.pending_items.length : 0,
    first_pending_status: detail.pending_items && detail.pending_items[0] ? detail.pending_items[0].status : '',
    confirmed_total: detail.totals ? detail.totals.total : 0,
    pending_total: detail.pending_totals ? detail.pending_totals.total : 0,
    passed: result.success &&
      detail.success &&
      detail.pending_items &&
      detail.pending_items.length > 0 &&
      detail.pending_items[detail.pending_items.length - 1].status === ORDER_ITEM_STATUS_PENDING_CONFIRM
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function testConfirmTablePendingItems() {
  ensureDirectStockTestMenu_();
  var submitResult = submitQrTableOrderForTest_(getStoredTestTableNo_());

  if (!submitResult.success) {
    Logger.log(JSON.stringify(submitResult, null, 2));
    return submitResult;
  }

  var detailBefore = getTableOrder_({
    table_no: submitResult.table_no
  });
  var pendingBefore = detailBefore.pending_items ? detailBefore.pending_items.length : 0;
  var result = confirmTablePendingItems_({
    order_id: detailBefore.order.order_id,
    confirmed_by: 'TEST'
  });
  var pendingAfter = result.pending_items ? result.pending_items.length : 0;

  result.verification = {
    pending_before: pendingBefore,
    pending_after: pendingAfter,
    confirmed_item_count: result.totals ? result.totals.item_count : 0,
    passed: result.success && pendingBefore > 0 && pendingAfter === 0 &&
      result.items &&
      result.items.length > 0
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function testClearTableOrder() {
  ensureDirectStockTestMenu_();

  var tableNo = getStoredTestTableNo_();
  var openResult = openTable_({
    table_no: tableNo,
    created_by: 'TEST'
  });

  if (!openResult.success || !openResult.order) {
    Logger.log(JSON.stringify(openResult, null, 2));
    return openResult;
  }

  storeTestTableOrder_(openResult.table ? openResult.table.table_no : tableNo, openResult.order.order_id);

  var orderId = openResult.order.order_id;
  var staffAddResult = addItemsToTableOrder_({
    order_id: orderId,
    created_by: 'TEST',
    items: [
      {
        menu_id: TEST_DIRECT_STOCK_MENU_ID,
        quantity: 1
      }
    ]
  });

  if (!staffAddResult.success) {
    Logger.log(JSON.stringify(staffAddResult, null, 2));
    return staffAddResult;
  }

  var qrSubmitResult = submitQrTableOrderForTest_(openResult.table ? openResult.table.table_no : tableNo);
  var stockBefore = getMenuStockQtyForTest_(TEST_DIRECT_STOCK_MENU_ID);
  var result = clearTableOrder_({
    table_no: openResult.table ? openResult.table.table_no : tableNo,
    order_id: orderId,
    reason: 'Automated clear table test',
    cleared_by: 'TEST'
  });
  var stockAfter = getMenuStockQtyForTest_(TEST_DIRECT_STOCK_MENU_ID);
  var clearedOrder = findRecordByValue_(readSheetRecordsByHeaders_('orders'), ['order_id'], orderId) || {};
  var clearedItems = readSheetRecordsByHeaders_('order_items').filter(function (item) {
    return stringValue_(getValueByAliases_(item, ['order_id'], '')) === orderId;
  });
  var payments = readSheetRecordsByHeaders_('payments').filter(function (payment) {
    return stringValue_(getValueByAliases_(payment, ['order_id'], '')) === orderId;
  });
  var stockLogs = getStockLogsForOrderTest_(orderId);
  var tableAfter = findTableFromRequest_(getSheetTable_('tables').records, {
    table_no: openResult.table ? openResult.table.table_no : tableNo
  });
  var allItemsCancelled = clearedItems.length > 0 && clearedItems.every(function (item) {
    return stringValue_(getValueByAliases_(item, ['status'], '')).toUpperCase() === ORDER_ITEM_STATUS_CANCELLED;
  });

  result.verification = {
    table_no: openResult.table ? openResult.table.table_no : tableNo,
    order_id: orderId,
    qr_submit_success: qrSubmitResult.success,
    table_status: tableAfter ? normalizeTableStatus_(getValueByAliases_(tableAfter, ['status'], '')) : '',
    current_order_id: tableAfter ? stringValue_(getValueByAliases_(tableAfter, ['current_order_id'], '')) : '',
    order_status: stringValue_(getValueByAliases_(clearedOrder, ['status'], '')),
    payment_status: stringValue_(getValueByAliases_(clearedOrder, ['payment_status'], '')),
    cancelled_item_count: result.cancelled_item_count || 0,
    all_items_cancelled: allItemsCancelled,
    payment_count: payments.length,
    stock_log_count: stockLogs.length,
    stock_before: stockBefore,
    stock_after: stockAfter,
    stock_unchanged: stockBefore === stockAfter,
    passed: result.success &&
      tableAfter &&
      normalizeTableStatus_(getValueByAliases_(tableAfter, ['status'], '')) === TABLE_STATUS_AVAILABLE &&
      !stringValue_(getValueByAliases_(tableAfter, ['current_order_id'], '')) &&
      stringValue_(getValueByAliases_(clearedOrder, ['status'], '')).toUpperCase() === ORDER_STATUS_CANCELLED &&
      stringValue_(getValueByAliases_(clearedOrder, ['payment_status'], '')).toUpperCase() === PAYMENT_STATUS_CANCELLED &&
      allItemsCancelled &&
      payments.length === 0 &&
      stockLogs.length === 0 &&
      stockBefore === stockAfter
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function testPayTableOrder() {
  ensureDirectStockTestMenu_();

  var detail = getOrCreateUnpaidTestTableOrderDetail_();

  if (!detail.success || !detail.order) {
    var detailFailure = {
      success: false,
      message: detail.message || 'Unable to prepare table order for payment test',
      order: detail.order || null,
      payment: null,
      deductedStock: [],
      verification: {
        table_no: detail.table ? detail.table.table_no : getStoredTestTableNo_(),
        order_id: detail.order ? detail.order.order_id : '',
        current_order_id: detail.table ? detail.table.current_order_id : '',
        stock_before: 0,
        stock_after: 0,
        total_deducted_qty: 0,
        stock_qty_decreased: false,
        table_released: false,
        passed: false
      }
    };

    Logger.log(JSON.stringify(detailFailure, null, 2));
    return detailFailure;
  }

  var orderId = detail.order.order_id;
  var tableNo = detail.table ? detail.table.table_no : getStoredTestTableNo_();
  var pendingRejectPassed = false;

  if (!detail.totals || numberValue_(detail.totals.item_count) <= 0 || numberValue_(detail.totals.total) <= 0) {
    detail = addItemsToTableOrder_({
      order_id: orderId,
      created_by: 'TEST',
      items: [
        {
          menu_id: TEST_DIRECT_STOCK_MENU_ID,
          quantity: 1
        }
      ]
    });

    if (!detail.success) {
      var addFailure = {
        success: false,
        message: detail.message || 'Unable to add test item to table order',
        order: detail.order || null,
        payment: null,
        deductedStock: [],
        verification: {
          table_no: tableNo,
          order_id: orderId,
          current_order_id: detail.table ? detail.table.current_order_id : '',
          stock_before: 0,
          stock_after: 0,
          total_deducted_qty: 0,
          stock_qty_decreased: false,
          table_released: false,
          passed: false
        }
      };

      Logger.log(JSON.stringify(addFailure, null, 2));
      return addFailure;
    }
  }

  var qrSubmitResult = submitQrTableOrderForTest_(tableNo);

  if (qrSubmitResult.success) {
    detail = getTableOrder_({
      order_id: orderId
    });

    var rejectResult = payTableOrder_({
      order_id: orderId,
      method: 'CASH',
      amount: detail.totals ? detail.totals.total : 0,
      received: detail.totals ? detail.totals.total : 0,
      created_by: 'TEST'
    });

    pendingRejectPassed = !rejectResult.success && rejectResult.error === 'PENDING_ITEMS_EXIST';

    detail = confirmTablePendingItems_({
      order_id: orderId,
      confirmed_by: 'TEST'
    });

    if (!detail.success) {
      var confirmFailure = {
        success: false,
        message: detail.message || 'Unable to confirm pending QR items before payment',
        order: detail.order || null,
        payment: null,
        deductedStock: [],
        verification: {
          table_no: tableNo,
          order_id: orderId,
          current_order_id: detail.table ? detail.table.current_order_id : '',
          total_deducted_qty: 0,
          pending_payment_rejected: pendingRejectPassed,
          passed: false
        }
      };

      Logger.log(JSON.stringify(confirmFailure, null, 2));
      return confirmFailure;
    }
  }

  var amount = detail.totals.total;
  var stockBefore = getMenuStockQtyForTest_(TEST_DIRECT_STOCK_MENU_ID);
  var result = payTableOrder_({
    order_id: orderId,
    method: 'CASH',
    amount: amount,
    received: amount,
    created_by: 'TEST'
  });
  var stockAfter = getMenuStockQtyForTest_(TEST_DIRECT_STOCK_MENU_ID);
  var totalDeductedQty = (result.deductedStock || []).reduce(function (sum, item) {
    return sum + numberValue_(getValueByAliases_(item, ['qty'], item.qty || 0));
  }, 0);
  var releasedDetail = getTableOrder_({
    order_id: orderId
  });
  var currentOrderId = releasedDetail.success && releasedDetail.table
    ? stringValue_(releasedDetail.table.current_order_id)
    : '';
  var tableReleased = result.success &&
    releasedDetail.success &&
    releasedDetail.table &&
    currentOrderId === '';
  var stockQtyDecreased = stockAfter === stockBefore - totalDeductedQty;

  result.verification = {
    table_no: tableNo,
    order_id: orderId,
    current_order_id: currentOrderId,
    stock_before: stockBefore,
    stock_after: stockAfter,
    total_deducted_qty: totalDeductedQty,
    stock_qty_decreased: stockQtyDecreased,
    table_released: tableReleased,
    pending_payment_rejected: pendingRejectPassed,
    passed: result.success &&
      tableReleased &&
      totalDeductedQty > 0 &&
      stockQtyDecreased &&
      pendingRejectPassed
  };

  var finalResult = {
    success: result.success,
    message: result.message,
    order: result.order || null,
    payment: result.payment || null,
    deductedStock: result.deductedStock || [],
    verification: result.verification
  };

  Logger.log(JSON.stringify(finalResult, null, 2));
  return finalResult;
}

function testPaySpecificTableOrderT01() {
  return testPaySpecificTableOrderForDev_(TEST_TABLE_DEFAULT_NO);
}

function testPaySpecificTableOrderForDev_(tableNo) {
  tableNo = stringValue_(tableNo || TEST_TABLE_DEFAULT_NO);
  ensureDirectStockTestMenu_();

  var detail = getTableOrder_({
    table_no: tableNo
  });

  if (!detail.success || !detail.order) {
    var missingResult = {
      success: false,
      message: 'No active order found for ' + tableNo,
      order: null,
      payment: null,
      deductedStock: [],
      verification: {
        table_no: tableNo,
        order_id: '',
        current_order_id: detail.table ? detail.table.current_order_id : '',
        total_deducted_qty: 0,
        passed: false
      }
    };

    Logger.log(JSON.stringify(missingResult, null, 2));
    return missingResult;
  }

  if (isOrderPaid_(detail.order)) {
    var paidResult = {
      success: false,
      message: 'Order is already paid for ' + tableNo,
      order: detail.order,
      payment: null,
      deductedStock: [],
      verification: {
        table_no: tableNo,
        order_id: detail.order.order_id,
        current_order_id: detail.table ? detail.table.current_order_id : '',
        total_deducted_qty: 0,
        passed: false
      }
    };

    Logger.log(JSON.stringify(paidResult, null, 2));
    return paidResult;
  }

  if (!detail.totals || numberValue_(detail.totals.item_count) <= 0 || numberValue_(detail.totals.total) <= 0) {
    detail = addItemsToTableOrder_({
      order_id: detail.order.order_id,
      created_by: 'TEST',
      items: [
        {
          menu_id: TEST_DIRECT_STOCK_MENU_ID,
          quantity: 1
        }
      ]
    });
  }

  var orderId = detail.order.order_id;
  var amount = detail.totals.total;
  var result = payTableOrder_({
    order_id: orderId,
    method: 'CASH',
    amount: amount,
    received: amount,
    created_by: 'TEST'
  });
  var releasedDetail = getTableOrder_({
    order_id: orderId
  });
  var totalDeductedQty = (result.deductedStock || []).reduce(function (sum, item) {
    return sum + numberValue_(getValueByAliases_(item, ['qty'], item.qty || 0));
  }, 0);
  var currentOrderId = releasedDetail.success && releasedDetail.table
    ? stringValue_(releasedDetail.table.current_order_id)
    : '';
  var tableReleased = result.success && currentOrderId === '';

  result.verification = {
    table_no: tableNo,
    order_id: orderId,
    current_order_id: currentOrderId,
    total_deducted_qty: totalDeductedQty,
    table_released: tableReleased,
    passed: result.success && tableReleased
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function testGetTableQrLinks() {
  var result = getTableQrLinks_({
    base_url: 'http://localhost:5174/order'
  });

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function testRegenerateTableQrTokens() {
  var adminToken = getAdminToken_();
  var result = regenerateTableQrTokens_({
    admin_token: adminToken
  });

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}
