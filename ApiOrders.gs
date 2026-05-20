var ORDER_STATUS_NEW = 'NEW';
var ORDER_STATUS_PAID = 'PAID';
var PAYMENT_STATUS_UNPAID = 'UNPAID';
var PAYMENT_STATUS_PAID = 'PAID';
var CUSTOM_COUNTER_MENU_ID = 'CUSTOM_COUNTER';
var CUSTOM_TABLE_MENU_ID = 'CUSTOM';
var CUSTOM_COUNTER_ITEM_TYPE = 'CUSTOM_COUNTER';
var TEST_DIRECT_STOCK_MENU_ID = 'MN066';
var TEST_DIRECT_STOCK_MENU_NAME = 'น้ำเปล่า (เล็ก)';
var TEST_DIRECT_STOCK_QTY = 30;

function handleOrderAction_(action, request) {
  switch (action) {
    case 'CREATE_ORDER':
      return createOrder_(request || {});

    case 'CHECKOUT_ORDER':
      return checkoutOrder_(request || {});

    case 'PAY_ORDER':
      return payOrder_(request || {});

    case 'GET_RECENT_ORDERS':
      return getRecentOrders_(request || {});

    case 'GET_ORDER_DETAIL':
      return getOrderDetail_(request || {});

    default:
      return {
        success: false,
        message: action + ' is not implemented yet'
      };
  }
}

function createOrder_(request) {
  var items = Array.isArray(request.items) ? request.items : [];

  if (!items.length) {
    return {
      success: false,
      error: 'EMPTY_ORDER',
      message: 'Order must include at least one item'
    };
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    initializeDatabaseSheets_();

    var timestamp = nowIso_();
    var menuTable = getSheetRecordsWithRowNumbers_('menus');
    var menuById = indexRecordsByValue_(menuTable.records, ['menu_id']);
    var orderId = makeId_('ORD');
    var orderNo = generateNextOrderNo_();
    var createdBy = stringValue_(request.created_by || request.user_id || request.userId || '');
    var subtotal = 0;
    var itemDiscountTotal = 0;
    var orderItemRecords = [];

    items.forEach(function (item) {
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
      var itemDiscount = numberValue_(item.discount || 0);
      var lineSubtotal = quantity * unitPrice;
      var lineTotal = Math.max(0, lineSubtotal - itemDiscount);

      subtotal += lineSubtotal;
      itemDiscountTotal += itemDiscount;

      orderItemRecords.push({
        item_id: makeId_('ITEM'),
        order_id: orderId,
        menu_id: menuId,
        menu_name_snapshot: menuNameSnapshot,
        menu_name: menuNameSnapshot,
        quantity: quantity,
        unit_price: unitPrice,
        option_text: stringValue_(item.option_text || item.optionText || ''),
        discount: itemDiscount,
        total: lineTotal,
        note: stringValue_(item.note || ''),
        status: ORDER_ITEM_STATUS_NEW,
        created_at: timestamp,
        updated_at: timestamp
      });
    });

    var orderDiscount = numberValue_(request.discount || 0);
    var discount = itemDiscountTotal + orderDiscount;
    var total = Math.max(0, subtotal - discount);
    var orderRecord = {
      order_id: orderId,
      order_no: orderNo,
      order_type: stringValue_(request.order_type || request.orderType || 'DINE_IN'),
      table_no: stringValue_(request.table_no || request.tableNo || ''),
      table_id: stringValue_(request.table_no || request.tableNo || request.table_id || request.tableId || ''),
      status: ORDER_STATUS_NEW,
      payment_status: PAYMENT_STATUS_UNPAID,
      subtotal: subtotal,
      discount: discount,
      service_charge: 0,
      tax: 0,
      total: total,
      note: stringValue_(request.note || ''),
      created_by: createdBy,
      created_at: timestamp,
      updated_at: timestamp,
      closed_at: ''
    };

    appendRecordsByHeaders_('orders', [orderRecord]);
    appendRecordsByHeaders_('order_items', orderItemRecords);

    return {
      success: true,
      message: 'Order created',
      order: normalizeOrderRecord_(orderRecord),
      order_items: orderItemRecords.map(normalizeOrderItemRecord_)
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

function checkoutOrder_(request) {
  var totalStart = perfStart_();
  var items = Array.isArray(request.items) ? request.items : [];

  if (!items.length) {
    var emptyResponse = {
      success: false,
      error: 'EMPTY_ORDER',
      message: 'Order must include at least one item'
    };

    perfLog_('CHECKOUT_ORDER total', totalStart);

    return emptyResponse;
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    var stepStart = perfStart_();

    initializeDatabaseSheets_();
    perfLog_('CHECKOUT_ORDER ensure database', stepStart);

    var timestamp = nowIso_();
    var tables = {};

    stepStart = perfStart_();
    tables.orders = getSheetTable_('orders');
    perfLog_('CHECKOUT_ORDER read orders', stepStart);

    stepStart = perfStart_();
    tables.order_items = getSheetTable_('order_items');
    perfLog_('CHECKOUT_ORDER read order_items', stepStart);

    stepStart = perfStart_();
    tables.payments = getSheetTable_('payments');
    perfLog_('CHECKOUT_ORDER read payments', stepStart);

    stepStart = perfStart_();
    tables.menus = getSheetTable_('menus');
    perfLog_('CHECKOUT_ORDER read menus', stepStart);

    stepStart = perfStart_();
    tables.stock_logs = getSheetTable_('stock_logs');
    perfLog_('CHECKOUT_ORDER read stock_logs', stepStart);

    stepStart = perfStart_();
    var settingsMap = getSettingsMapFromDisplayValues_();
    perfLog_('CHECKOUT_ORDER read settings', stepStart);

    stepStart = perfStart_();
    var menuById = indexRecordsByValue_(tables.menus.records, ['menu_id']);
    var createdBy = stringValue_(request.created_by || request.user_id || request.userId || '');
    var paymentRequest = request.payment || {};
    var orderId = makeId_('ORD');
    var orderNo = generateNextOrderNoFromRecords_(tables.orders.records);
    var orderBuild = buildPaidOrderRecordsForCheckout_(
      request,
      items,
      menuById,
      orderId,
      orderNo,
      createdBy,
      timestamp
    );
    var paymentRecord = buildCheckoutPaymentRecord_(
      orderId,
      orderBuild.order.total,
      paymentRequest,
      createdBy,
      timestamp
    );
    var directStockPlan = buildDirectStockPlan_(orderBuild.order_items, tables.menus.records);
    perfLog_('CHECKOUT_ORDER build records', stepStart);

    stepStart = perfStart_();
    var allowNegativeStock = isTruthy_(settingsMap.allow_negative_stock || false);
    var insufficientStock = findInsufficientDirectStock_(directStockPlan, allowNegativeStock);

    if (insufficientStock) {
      var stockResponse = {
        success: false,
        error: 'INSUFFICIENT_STOCK',
        message: 'Not enough stock for ' + insufficientStock.menu_name
      };

      perfLog_('CHECKOUT_ORDER validate stock', stepStart);
      perfLog_('CHECKOUT_ORDER total', totalStart);

      return stockResponse;
    }

    validateDirectStockTablesForCheckout_(directStockPlan, tables.menus, tables.stock_logs);
    perfLog_('CHECKOUT_ORDER validate stock', stepStart);

    stepStart = perfStart_();
    appendRowsToTable_(tables.orders, [orderBuild.order]);
    perfLog_('CHECKOUT_ORDER append order', stepStart);

    stepStart = perfStart_();
    appendRowsToTable_(tables.order_items, orderBuild.order_items);
    perfLog_('CHECKOUT_ORDER append order_items', stepStart);

    stepStart = perfStart_();
    appendRowsToTable_(tables.payments, [paymentRecord]);
    perfLog_('CHECKOUT_ORDER create payment', stepStart);

    var deductedStock = applyDirectStockPlanForCheckout_(
      orderId,
      directStockPlan,
      tables.menus,
      tables.stock_logs,
      createdBy,
      timestamp,
      'CHECKOUT_ORDER'
    );

    stepStart = perfStart_();
    var normalizedOrder = normalizeOrderRecord_(orderBuild.order);
    var normalizedItems = orderBuild.order_items.map(normalizeOrderItemRecord_);
    var normalizedPayment = normalizePaymentRecord_(paymentRecord);
    var receipt = buildReceiptSummaryFromSettings_(
      normalizedOrder,
      normalizedPayment,
      settingsMap
    );
    perfLog_('CHECKOUT_ORDER build receipt', stepStart);

    var response = {
      success: true,
      message: 'Checkout completed',
      order: normalizedOrder,
      items: normalizedItems,
      payment: normalizedPayment,
      receipt: receipt,
      deductedStock: deductedStock
    };

    perfLog_('CHECKOUT_ORDER total', totalStart);

    return response;
  } catch (err) {
    var errorResponse = {
      success: false,
      message: err && err.message ? err.message : String(err)
    };

    perfLog_('CHECKOUT_ORDER total', totalStart);

    return errorResponse;
  } finally {
    lock.releaseLock();
  }
}

function payOrder_(request) {
  var orderId = stringValue_(request.order_id || request.orderId);

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
    initializeDatabaseSheets_();

    var timestamp = nowIso_();
    var ordersTable = getSheetRecordsWithRowNumbers_('orders');
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
        message: 'Order is already PAID'
      };
    }

    var orderItems = getOrderItemsForOrder_(orderId);
    var menuTable = getSheetRecordsWithRowNumbers_('menus');
    var directStockPlan = buildDirectStockPlan_(orderItems, menuTable.records);
    var allowNegativeStock = isTruthy_(getSettingValue_('allow_negative_stock', false));
    var insufficientStock = findInsufficientDirectStock_(directStockPlan, allowNegativeStock);

    if (insufficientStock) {
      return {
        success: false,
        error: 'INSUFFICIENT_STOCK',
        message: 'Not enough stock for ' + insufficientStock.menu_name
      };
    }

    var orderTotal = numberValue_(getValueByAliases_(order, ['total'], 0));
    var amount = numberValue_(request.amount || orderTotal);
    var received = numberValue_(request.received || request.received_amount || amount);
    var createdBy = stringValue_(request.created_by || request.user_id || request.userId || '');
    var paymentRecord = {
      payment_id: makeId_('PAY'),
      order_id: orderId,
      method: stringValue_(request.method || 'CASH'),
      amount: amount,
      received: received,
      received_amount: received,
      change_amount: Math.max(0, received - amount),
      reference: stringValue_(request.reference || ''),
      paid_at: timestamp,
      created_at: timestamp,
      created_by: createdBy
    };

    appendRecordsByHeaders_('payments', [paymentRecord]);
    applyDirectStockPlan_(orderId, directStockPlan, menuTable, createdBy, timestamp);
    updatePaidOrder_(ordersTable, order, timestamp);

    return {
      success: true,
      message: 'Order paid',
      order_id: orderId,
      payment: normalizePaymentRecord_(paymentRecord),
      stockDeducted: directStockPlan.length > 0
    };
  } catch (err) {
    return {
      success: false,
      message: err && err.message ? err.message : String(err),
      order_id: orderId
    };
  } finally {
    lock.releaseLock();
  }
}

function getRecentOrders_(request) {
  initializeDatabaseSheets_();

  var requestedLimit = Math.floor(numberValue_(request.limit || 20));
  var limit = requestedLimit > 0 ? requestedLimit : 20;
  var includeCancelled = isTruthy_(request.include_cancelled || request.includeCancelled || false);

  limit = Math.min(limit, 100);

  var orders = readSheetRecordsByHeaders_('orders');
  var orderItemsByOrderId = groupBillRecordsByOrderId_(readSheetRecordsByHeaders_('order_items'));
  var paymentsByOrderId = groupBillRecordsByOrderId_(readSheetRecordsByHeaders_('payments'));
  var recentOrders = [];

  orders.forEach(function (order) {
    var normalizedOrder = normalizeOrderRecord_(order);
    var orderId = normalizedOrder.order_id;
    var status = stringValue_(normalizedOrder.status).toUpperCase();
    var paymentStatus = stringValue_(normalizedOrder.payment_status).toUpperCase();

    if (!orderId) {
      return;
    }

    if (!includeCancelled && isCancelledOrderStatus_(status, paymentStatus)) {
      return;
    }

    var payments = (paymentsByOrderId[orderId] || []).map(normalizePaymentRecord_);
    var latestPayment = getLatestPaymentByTime_(payments);
    var sortAt = getOrderRecentSortValue_(normalizedOrder, latestPayment);

    recentOrders.push({
      order_id: orderId,
      order_no: normalizedOrder.order_no,
      order_type: normalizedOrder.order_type,
      table_no: normalizedOrder.table_no,
      status: normalizedOrder.status,
      payment_status: normalizedOrder.payment_status,
      total: normalizedOrder.total,
      payment_method: latestPayment ? latestPayment.method : '',
      created_at: normalizedOrder.created_at,
      closed_at: normalizedOrder.closed_at,
      item_count: calculateRecentOrderItemCount_(orderItemsByOrderId[orderId] || [], includeCancelled),
      _sort_at: sortAt
    });
  });

  recentOrders = recentOrders
    .sort(function (a, b) {
      return getBillTimeValue_(b._sort_at) - getBillTimeValue_(a._sort_at);
    })
    .slice(0, limit)
    .map(function (order) {
      delete order._sort_at;
      return order;
    });

  return {
    success: true,
    orders: recentOrders
  };
}

function getOrderDetail_(request) {
  var orderId = stringValue_(request.order_id || request.orderId);
  var orderNo = stringValue_(request.order_no || request.orderNo);

  if (!orderId && !orderNo) {
    return {
      success: false,
      error: 'MISSING_ORDER_ID',
      message: 'Missing order_id or order_no'
    };
  }

  initializeDatabaseSheets_();

  var orders = readSheetRecordsByHeaders_('orders');
  var order = orderId
    ? findRecordByValue_(orders, ['order_id'], orderId)
    : findRecordByValue_(orders, ['order_no'], orderNo);

  if (!order) {
    return {
      success: false,
      error: 'ORDER_NOT_FOUND',
      message: 'Order not found'
    };
  }

  var normalizedOrder = normalizeOrderRecord_(order);
  orderId = normalizedOrder.order_id;

  var sourceItems = readSheetRecordsByHeaders_('order_items').filter(function (item) {
    return stringValue_(getValueByAliases_(item, ['order_id'], '')) === orderId;
  });
  var isCancelledOrder = isCancelledOrderStatus_(normalizedOrder.status, normalizedOrder.payment_status);
  var items = sourceItems
    .filter(function (item) {
      return shouldIncludeOrderDetailItem_(item, isCancelledOrder);
    })
    .map(normalizeOrderItemRecord_);
  var payments = readSheetRecordsByHeaders_('payments')
    .filter(function (payment) {
      return stringValue_(getValueByAliases_(payment, ['order_id'], '')) === orderId;
    })
    .map(normalizePaymentRecord_);
  var latestPayment = getLatestPaymentForReceipt_(payments);

  return {
    success: true,
    order: normalizedOrder,
    items: items,
    payments: payments,
    totals: buildOrderDetailTotals_(normalizedOrder, sourceItems, isCancelledOrder),
    receipt: buildReceiptSummary_(normalizedOrder, latestPayment)
  };
}

function groupBillRecordsByOrderId_(records) {
  var grouped = {};

  records.forEach(function (record) {
    var orderId = stringValue_(getValueByAliases_(record, ['order_id'], ''));

    if (!orderId) {
      return;
    }

    if (!grouped[orderId]) {
      grouped[orderId] = [];
    }

    grouped[orderId].push(record);
  });

  return grouped;
}

function isCancelledOrderStatus_(status, paymentStatus) {
  return stringValue_(status).toUpperCase() === ORDER_STATUS_CANCELLED ||
    stringValue_(paymentStatus).toUpperCase() === PAYMENT_STATUS_CANCELLED;
}

function shouldIncludeOrderDetailItem_(item, isCancelledOrder) {
  var status = stringValue_(getValueByAliases_(item, ['status'], '')).toUpperCase();

  if (isCancelledOrder && status === ORDER_ITEM_STATUS_CANCELLED) {
    return true;
  }

  return !isSkippedOrderItem_(item);
}

function calculateRecentOrderItemCount_(items, includeCancelled) {
  var itemCount = 0;

  (items || []).forEach(function (item) {
    var status = stringValue_(getValueByAliases_(item, ['status'], '')).toUpperCase();

    if (status === ORDER_ITEM_STATUS_PENDING_CONFIRM || status === ORDER_ITEM_STATUS_REJECTED) {
      return;
    }

    if (!includeCancelled && status === ORDER_ITEM_STATUS_CANCELLED) {
      return;
    }

    if (!includeCancelled && isSkippedOrderItem_(item)) {
      return;
    }

    itemCount += numberValue_(getValueByAliases_(item, ['quantity', 'qty'], 0));
  });

  return itemCount;
}

function buildOrderDetailTotals_(order, sourceItems, isCancelledOrder) {
  return {
    subtotal: numberValue_(order.subtotal),
    discount: numberValue_(order.discount),
    total: numberValue_(order.total),
    item_count: calculateRecentOrderItemCount_(sourceItems, isCancelledOrder)
  };
}

function getOrderRecentSortValue_(order, latestPayment) {
  return order.closed_at ||
    (latestPayment && latestPayment.paid_at ? latestPayment.paid_at : '') ||
    order.created_at ||
    '';
}

function getLatestPaymentByTime_(payments) {
  if (!payments.length) {
    return null;
  }

  return payments.slice().sort(function (a, b) {
    return getBillTimeValue_(b.paid_at || b.created_at) - getBillTimeValue_(a.paid_at || a.created_at);
  })[0];
}

function getBillTimeValue_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return value.getTime();
  }

  var text = stringValue_(value);
  var parsed = new Date(text);

  return isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function generateNextOrderNo_() {
  var dateKey = getOrderDateKey_();
  var prefix = 'LGT-' + dateKey + '-';
  var orders = readSheetRecordsByHeaders_('orders');
  var maxSequence = 0;

  orders.forEach(function (order) {
    var orderNo = stringValue_(getValueByAliases_(order, ['order_no'], ''));

    if (orderNo.indexOf(prefix) !== 0) {
      return;
    }

    var sequence = Number(orderNo.slice(prefix.length));

    if (!isNaN(sequence) && sequence > maxSequence) {
      maxSequence = sequence;
    }
  });

  return prefix + padOrderSequence_(maxSequence + 1);
}

function generateNextOrderNoFromRecords_(orders) {
  var dateKey = getOrderDateKey_();
  var prefix = 'LGT-' + dateKey + '-';
  var maxSequence = 0;

  orders.forEach(function (order) {
    var orderNo = stringValue_(getValueByAliases_(order, ['order_no'], ''));

    if (orderNo.indexOf(prefix) !== 0) {
      return;
    }

    var sequence = Number(orderNo.slice(prefix.length));

    if (!isNaN(sequence) && sequence > maxSequence) {
      maxSequence = sequence;
    }
  });

  return prefix + padOrderSequence_(maxSequence + 1);
}

function getOrderDateKey_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd');
}

function padOrderSequence_(sequence) {
  return ('0000' + sequence).slice(-4);
}

function buildPaidOrderRecordsForCheckout_(
  request,
  items,
  menuById,
  orderId,
  orderNo,
  createdBy,
  timestamp
) {
  var subtotal = 0;
  var itemDiscountTotal = 0;
  var orderItemRecords = [];

  items.forEach(function (item) {
    var menuId = stringValue_(item.menu_id || item.menuId);
    var quantity = numberValue_(item.quantity || item.qty || 0);

    if (!menuId || quantity <= 0) {
      throw new Error('Invalid order item');
    }

    var isCustomCounterItem = isCustomCounterSaleItem_(item);
    var menu = menuById[menuId];
    var menuNameSnapshot = '';
    var unitPrice = 0;

    if (isCustomCounterItem) {
      menuId = CUSTOM_COUNTER_MENU_ID;
      menuNameSnapshot = getCustomCounterItemName_(item);
      unitPrice = numberValue_(item.unit_price || item.unitPrice || item.price || 0);

      if (!menuNameSnapshot) {
        throw new Error('Manual counter sale item name is required');
      }

      if (unitPrice <= 0) {
        throw new Error('Manual counter sale item price must be greater than 0');
      }
    } else {
      if (!menu) {
        throw new Error('Menu not found: ' + menuId);
      }

      menuNameSnapshot = stringValue_(getValueByAliases_(menu, ['name_th', 'menu_name'], menuId));
      unitPrice = numberValue_(getValueByAliases_(menu, ['price', 'base_price'], 0));
    }

    var itemDiscount = numberValue_(item.discount || 0);
    var lineSubtotal = quantity * unitPrice;
    var lineTotal = Math.max(0, lineSubtotal - itemDiscount);

    subtotal += lineSubtotal;
    itemDiscountTotal += itemDiscount;

    orderItemRecords.push({
      item_id: makeId_('ITEM'),
      order_id: orderId,
      menu_id: menuId,
      menu_name_snapshot: menuNameSnapshot,
      menu_name: menuNameSnapshot,
      quantity: quantity,
      unit_price: unitPrice,
      option_text: stringValue_(item.option_text || item.optionText || ''),
      discount: itemDiscount,
      total: lineTotal,
      note: stringValue_(item.note || ''),
      status: ORDER_ITEM_STATUS_PAID,
      created_at: timestamp,
      updated_at: timestamp
    });
  });

  var orderDiscount = numberValue_(request.discount || 0);
  var discount = itemDiscountTotal + orderDiscount;
  var total = Math.max(0, subtotal - discount);

  return {
    order: {
      order_id: orderId,
      order_no: orderNo,
      order_type: stringValue_(request.order_type || request.orderType || 'DINE_IN'),
      table_no: stringValue_(request.table_no || request.tableNo || ''),
      table_id: stringValue_(request.table_no || request.tableNo || request.table_id || request.tableId || ''),
      status: ORDER_STATUS_PAID,
      payment_status: PAYMENT_STATUS_PAID,
      subtotal: subtotal,
      discount: discount,
      service_charge: 0,
      tax: 0,
      total: total,
      note: stringValue_(request.note || ''),
      created_by: createdBy,
      created_at: timestamp,
      updated_at: timestamp,
      closed_at: timestamp
    },
    order_items: orderItemRecords
  };
}

function isCustomCounterSaleItem_(item) {
  var itemType = stringValue_(item.item_type || item.itemType).toUpperCase();
  var menuId = stringValue_(item.menu_id || item.menuId).toUpperCase();

  return itemType === CUSTOM_COUNTER_ITEM_TYPE ||
    menuId === CUSTOM_COUNTER_MENU_ID ||
    menuId === CUSTOM_TABLE_MENU_ID;
}

function getCustomCounterItemName_(item) {
  return stringValue_(
    item.menu_name_snapshot ||
    item.menuNameSnapshot ||
    item.menu_name ||
    item.menuName ||
    item.name ||
    ''
  );
}

function buildCheckoutPaymentRecord_(orderId, orderTotal, paymentRequest, createdBy, timestamp) {
  var amount = numberValue_(paymentRequest.amount || orderTotal);
  var received = numberValue_(paymentRequest.received || paymentRequest.received_amount || amount);

  return {
    payment_id: makeId_('PAY'),
    order_id: orderId,
    method: stringValue_(paymentRequest.method || 'CASH'),
    amount: amount,
    received: received,
    received_amount: received,
    change_amount: Math.max(0, received - amount),
    reference: stringValue_(paymentRequest.reference || ''),
    paid_at: timestamp,
    created_at: timestamp,
    created_by: createdBy
  };
}

function getOrderItemsForOrder_(orderId) {
  return readSheetRecordsByHeaders_('order_items').filter(function (item) {
    return stringValue_(getValueByAliases_(item, ['order_id'], '')) === orderId &&
      !isSkippedOrderItem_(item);
  });
}

function buildDirectStockPlan_(orderItems, menus) {
  var menuById = indexRecordsByValue_(menus, ['menu_id']);
  var plan = [];

  orderItems.forEach(function (item) {
    if (isCustomCounterSaleItem_(item)) {
      return;
    }

    var menuId = stringValue_(getValueByAliases_(item, ['menu_id'], ''));
    var quantity = numberValue_(getValueByAliases_(item, ['quantity', 'qty'], 0));
    var menu = menuById[menuId];

    if (!menu || quantity <= 0) {
      return;
    }

    var trackStock = isTruthy_(getValueByAliases_(menu, ['track_stock'], false));
    var stockMode = normalizeStockMode_(getValueByAliases_(menu, ['stock_mode'], 'NONE'));

    if (!trackStock || stockMode === 'NONE' || stockMode !== 'DIRECT') {
      return;
    }

    plan.push({
      menu_id: menuId,
      menu_name: stringValue_(
        getValueByAliases_(item, ['menu_name_snapshot', 'menu_name'], '') ||
        getValueByAliases_(menu, ['name_th', 'menu_name'], menuId)
      ),
      quantity: quantity,
      menu: menu
    });
  });

  return plan;
}

function findInsufficientDirectStock_(plan, allowNegativeStock) {
  if (allowNegativeStock) {
    return null;
  }

  var remainingByMenuId = {};

  for (var index = 0; index < plan.length; index++) {
    var item = plan[index];

    if (remainingByMenuId[item.menu_id] === undefined) {
      remainingByMenuId[item.menu_id] = numberValue_(getValueByAliases_(item.menu, ['stock_qty'], 0));
    }

    remainingByMenuId[item.menu_id] -= item.quantity;

    if (remainingByMenuId[item.menu_id] < 0) {
      return item;
    }
  }

  return null;
}

function applyDirectStockPlan_(orderId, plan, menuTable, createdBy, timestamp) {
  if (!plan.length) {
    return;
  }

  var stockColumn = getHeaderColumn_(menuTable.headers, ['stock_qty']);
  var updatedAtColumn = getHeaderColumn_(menuTable.headers, ['updated_at']);
  var currentStockByMenuId = {};
  var stockLogs = [];

  if (!stockColumn) {
    throw new Error('menus sheet is missing stock_qty header');
  }

  plan.forEach(function (item) {
    var menu = item.menu;

    if (currentStockByMenuId[item.menu_id] === undefined) {
      currentStockByMenuId[item.menu_id] = numberValue_(getValueByAliases_(menu, ['stock_qty'], 0));
    }

    var beforeStock = currentStockByMenuId[item.menu_id];
    var afterStock = beforeStock - item.quantity;
    currentStockByMenuId[item.menu_id] = afterStock;

    menuTable.sheet.getRange(menu._rowNumber, stockColumn).setValue(afterStock);

    if (updatedAtColumn) {
      menuTable.sheet.getRange(menu._rowNumber, updatedAtColumn).setValue(timestamp);
    }

    stockLogs.push({
      stock_log_id: makeId_('SL'),
      target_type: 'MENU',
      target_id: item.menu_id,
      type: 'OUT',
      qty: item.quantity,
      unit: 'pcs',
      before_stock: beforeStock,
      after_stock: afterStock,
      ref_type: 'ORDER',
      ref_id: orderId,
      note: item.menu_name,
      created_by: createdBy,
      created_at: timestamp
    });
  });

  appendRecordsByHeaders_('stock_logs', stockLogs);
  clearMenuCache_();
}

function applyDirectStockPlanForCheckout_(orderId, plan, menuTable, stockLogTable, createdBy, timestamp, perfPrefix) {
  if (!plan.length) {
    return [];
  }

  var stockColumn = getHeaderColumn_(menuTable.headers, ['stock_qty']);
  var updatedAtColumn = getHeaderColumn_(menuTable.headers, ['updated_at']);
  var currentStockByMenuId = {};
  var finalStockByMenuId = {};
  var stockLogs = [];
  var deductedStock = [];

  if (!stockColumn) {
    throw new Error('menus sheet is missing stock_qty header');
  }

  var stepStart = perfStart_();

  plan.forEach(function (item) {
    var menu = item.menu;

    if (currentStockByMenuId[item.menu_id] === undefined) {
      currentStockByMenuId[item.menu_id] = numberValue_(getValueByAliases_(menu, ['stock_qty'], 0));
    }

    var beforeStock = currentStockByMenuId[item.menu_id];
    var afterStock = beforeStock - item.quantity;
    currentStockByMenuId[item.menu_id] = afterStock;
    finalStockByMenuId[item.menu_id] = {
      rowNumber: menu._rowNumber,
      stockQty: afterStock
    };

    stockLogs.push({
      stock_log_id: makeId_('SL'),
      target_type: 'MENU',
      target_id: item.menu_id,
      type: 'OUT',
      qty: item.quantity,
      unit: 'pcs',
      before_stock: beforeStock,
      after_stock: afterStock,
      ref_type: 'ORDER',
      ref_id: orderId,
      note: item.menu_name,
      created_by: createdBy,
      created_at: timestamp
    });

    deductedStock.push({
      target_type: 'MENU',
      target_id: item.menu_id,
      menu_name: item.menu_name,
      qty: item.quantity,
      before_stock: beforeStock,
      after_stock: afterStock
    });
  });

  Object.keys(finalStockByMenuId).forEach(function (menuId) {
    var update = finalStockByMenuId[menuId];

    menuTable.sheet.getRange(update.rowNumber, stockColumn).setValue(update.stockQty);

    if (updatedAtColumn) {
      menuTable.sheet.getRange(update.rowNumber, updatedAtColumn).setValue(timestamp);
    }
  });
  if (perfPrefix) {
    perfLog_(perfPrefix + ' deduct stock', stepStart);
  }

  stepStart = perfStart_();
  appendRowsToTable_(stockLogTable, stockLogs);
  if (perfPrefix) {
    perfLog_(perfPrefix + ' append stock logs', stepStart);
  }

  clearMenuCache_();

  return deductedStock;
}

function validateDirectStockTablesForCheckout_(plan, menuTable, stockLogTable) {
  if (!plan.length) {
    return;
  }

  if (!getHeaderColumn_(menuTable.headers, ['stock_qty'])) {
    throw new Error('menus sheet is missing stock_qty header');
  }

  [
    'stock_log_id',
    'target_type',
    'target_id',
    'type',
    'qty',
    'unit',
    'before_stock',
    'after_stock',
    'ref_type',
    'ref_id',
    'note',
    'created_by',
    'created_at'
  ].forEach(function (header) {
    if (!getHeaderColumn_(stockLogTable.headers, [header])) {
      throw new Error('stock_logs sheet is missing ' + header + ' header');
    }
  });
}

function updatePaidOrder_(ordersTable, order, timestamp) {
  var statusColumn = getHeaderColumn_(ordersTable.headers, ['status']);
  var paymentStatusColumn = getHeaderColumn_(ordersTable.headers, ['payment_status']);
  var updatedAtColumn = getHeaderColumn_(ordersTable.headers, ['updated_at']);
  var closedAtColumn = getHeaderColumn_(ordersTable.headers, ['closed_at']);

  if (statusColumn) {
    ordersTable.sheet.getRange(order._rowNumber, statusColumn).setValue(PAYMENT_STATUS_PAID);
  }

  if (paymentStatusColumn) {
    ordersTable.sheet.getRange(order._rowNumber, paymentStatusColumn).setValue(PAYMENT_STATUS_PAID);
  }

  if (updatedAtColumn) {
    ordersTable.sheet.getRange(order._rowNumber, updatedAtColumn).setValue(timestamp);
  }

  if (closedAtColumn) {
    ordersTable.sheet.getRange(order._rowNumber, closedAtColumn).setValue(timestamp);
  }
}

function isOrderPaid_(order) {
  return stringValue_(getValueByAliases_(order, ['payment_status'], '')).toUpperCase() === PAYMENT_STATUS_PAID ||
    stringValue_(getValueByAliases_(order, ['status'], '')).toUpperCase() === ORDER_STATUS_PAID;
}

function normalizeOrderRecord_(order) {
  return {
    order_id: stringValue_(getValueByAliases_(order, ['order_id'], '')),
    order_no: stringValue_(getValueByAliases_(order, ['order_no'], '')),
    order_type: stringValue_(getValueByAliases_(order, ['order_type'], '')),
    table_no: stringValue_(getValueByAliases_(order, ['table_no', 'table_id'], '')),
    status: stringValue_(getValueByAliases_(order, ['status'], '')),
    payment_status: stringValue_(getValueByAliases_(order, ['payment_status'], '')),
    subtotal: numberValue_(getValueByAliases_(order, ['subtotal'], 0)),
    discount: numberValue_(getValueByAliases_(order, ['discount'], 0)),
    total: numberValue_(getValueByAliases_(order, ['total'], 0)),
    note: stringValue_(getValueByAliases_(order, ['note'], '')),
    created_by: stringValue_(getValueByAliases_(order, ['created_by'], '')),
    created_at: getValueByAliases_(order, ['created_at'], ''),
    updated_at: getValueByAliases_(order, ['updated_at'], ''),
    closed_at: getValueByAliases_(order, ['closed_at'], '')
  };
}

function normalizeOrderItemRecord_(item) {
  return {
    item_id: stringValue_(getValueByAliases_(item, ['item_id'], '')),
    order_id: stringValue_(getValueByAliases_(item, ['order_id'], '')),
    menu_id: stringValue_(getValueByAliases_(item, ['menu_id'], '')),
    menu_name_snapshot: stringValue_(getValueByAliases_(item, ['menu_name_snapshot', 'menu_name'], '')),
    quantity: numberValue_(getValueByAliases_(item, ['quantity', 'qty'], 0)),
    unit_price: numberValue_(getValueByAliases_(item, ['unit_price'], 0)),
    discount: numberValue_(getValueByAliases_(item, ['discount'], 0)),
    total: numberValue_(getValueByAliases_(item, ['total'], 0)),
    note: stringValue_(getValueByAliases_(item, ['note'], '')),
    status: stringValue_(getValueByAliases_(item, ['status'], ''))
  };
}

function normalizePaymentRecord_(payment) {
  return {
    payment_id: stringValue_(getValueByAliases_(payment, ['payment_id'], '')),
    order_id: stringValue_(getValueByAliases_(payment, ['order_id'], '')),
    method: stringValue_(getValueByAliases_(payment, ['method'], '')),
    amount: numberValue_(getValueByAliases_(payment, ['amount'], 0)),
    received: numberValue_(getValueByAliases_(payment, ['received', 'received_amount'], 0)),
    change_amount: numberValue_(getValueByAliases_(payment, ['change_amount'], 0)),
    reference: stringValue_(getValueByAliases_(payment, ['reference'], '')),
    paid_at: getValueByAliases_(payment, ['paid_at'], ''),
    created_at: getValueByAliases_(payment, ['created_at'], ''),
    created_by: stringValue_(getValueByAliases_(payment, ['created_by'], ''))
  };
}

function buildReceiptSummary_(order, payment) {
  payment = payment || {};

  return buildReceiptSummaryFromSettings_(order, payment, getSettingsMapFromDisplayValues_());
}

function buildReceiptSummaryFromSettings_(order, payment, settingsMap) {
  payment = payment || {};
  settingsMap = settingsMap || {};
  var promptPaySettings = getPromptPayReceiptSettings_(settingsMap);

  return {
    shop_name: promptPaySettings.shop_name,
    receipt_width: promptPaySettings.receipt_width,
    order_no: order.order_no,
    created_at: order.created_at,
    paid_at: payment.paid_at || '',
    payment_method: payment.method || '',
    subtotal: order.subtotal,
    discount: order.discount,
    total: order.total,
    received: numberValue_(payment.received || 0),
    change_amount: numberValue_(payment.change_amount || 0),
    promptpay_enabled: promptPaySettings.promptpay_enabled,
    promptpay_id: promptPaySettings.promptpay_id,
    promptpay_name: promptPaySettings.promptpay_name,
    receipt_qr_enabled: promptPaySettings.receipt_qr_enabled,
    receipt_qr_size_mm: promptPaySettings.receipt_qr_size_mm
  };
}

function getLatestPaymentForReceipt_(payments) {
  if (!payments.length) {
    return null;
  }

  return payments[payments.length - 1];
}

function getSettingValue_(key, defaultValue) {
  var settings = readSheetRecordsByHeaders_('settings');

  for (var index = 0; index < settings.length; index++) {
    if (stringValue_(getValueByAliases_(settings[index], ['key'], '')) === key) {
      return getValueByAliases_(settings[index], ['value'], defaultValue);
    }
  }

  return defaultValue;
}

function buildSettingsMap_(settings) {
  var map = {};

  settings.forEach(function (setting) {
    var key = stringValue_(getValueByAliases_(setting, ['key'], ''));

    if (key) {
      map[key] = getValueByAliases_(setting, ['value'], '');
    }
  });

  return map;
}

function getSheetRecordsWithRowNumbers_(sheetName) {
  var sheet = getSheetOrThrow_(sheetName);
  var lastRow = sheet.getLastRow();
  var lastColumn = sheet.getLastColumn();
  var headers = [];

  if (lastColumn > 0) {
    headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function (header) {
      return normalizeHeaderName_(header);
    });
  }

  if (lastRow < 2 || lastColumn < 1) {
    return {
      sheet: sheet,
      headers: headers,
      records: []
    };
  }

  var values = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();
  var records = values.map(function (row, rowIndex) {
    var record = {
      _rowNumber: rowIndex + 2
    };

    headers.forEach(function (header, columnIndex) {
      if (header) {
        record[header] = row[columnIndex];
      }
    });

    return record;
  });

  return {
    sheet: sheet,
    headers: headers,
    records: records
  };
}

function getSheetTable_(sheetName) {
  var sheet = getSheetOrThrow_(sheetName);
  var values = [];

  if (typeof sheet.getDataRange === 'function') {
    values = sheet.getDataRange().getValues();
  } else {
    var lastRow = sheet.getLastRow();
    var lastColumn = sheet.getLastColumn();

    if (lastRow > 0 && lastColumn > 0) {
      values = sheet.getRange(1, 1, lastRow, lastColumn).getValues();
    }
  }

  var headerRow = values.length ? values[0] : [];
  var headers = headerRow.map(function (header) {
    return normalizeHeaderName_(header);
  });
  var records = [];

  for (var rowIndex = 1; rowIndex < values.length; rowIndex++) {
    var row = values[rowIndex];
    var hasValue = row.some(function (cell) {
      return cell !== '';
    });

    if (!hasValue) {
      continue;
    }

    var record = {
      _rowNumber: rowIndex + 1
    };

    headers.forEach(function (header, columnIndex) {
      if (header) {
        record[header] = row[columnIndex];
      }
    });

    records.push(record);
  }

  return {
    sheet: sheet,
    headers: headers,
    records: records
  };
}

function getSheetTableHeadersOnly_(sheetName) {
  var sheet = getSheetOrThrow_(sheetName);
  var lastColumn = sheet.getLastColumn();
  var headers = [];

  if (lastColumn > 0) {
    headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function (header) {
      return normalizeHeaderName_(header);
    });
  }

  return {
    sheet: sheet,
    headers: headers,
    records: []
  };
}

function appendRecordsByHeaders_(sheetName, records) {
  if (!records.length) {
    return;
  }

  var sheet = getSheetOrThrow_(sheetName);
  var lastColumn = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function (header) {
    return normalizeHeaderName_(header);
  });
  var rows = records.map(function (record) {
    return headers.map(function (header) {
      return record[header] === undefined ? '' : record[header];
    });
  });

  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
}

function appendRowsToTable_(table, records) {
  if (!records.length) {
    return;
  }

  var rows = records.map(function (record) {
    return table.headers.map(function (header) {
      return record[header] === undefined ? '' : record[header];
    });
  });

  table.sheet.getRange(table.sheet.getLastRow() + 1, 1, rows.length, table.headers.length).setValues(rows);
}

function getHeaderColumn_(headers, aliases) {
  for (var index = 0; index < aliases.length; index++) {
    var header = normalizeHeaderName_(aliases[index]);
    var headerIndex = headers.indexOf(header);

    if (headerIndex >= 0) {
      return headerIndex + 1;
    }
  }

  return 0;
}

function indexRecordsByValue_(records, aliases) {
  var index = {};

  records.forEach(function (record) {
    var key = stringValue_(getValueByAliases_(record, aliases, ''));

    if (key) {
      index[key] = record;
    }
  });

  return index;
}

function findRecordByValue_(records, aliases, value) {
  var target = stringValue_(value);

  for (var index = 0; index < records.length; index++) {
    if (stringValue_(getValueByAliases_(records[index], aliases, '')) === target) {
      return records[index];
    }
  }

  return null;
}

function isSkippedOrderItem_(item) {
  var status = stringValue_(getValueByAliases_(item, ['status'], '')).toUpperCase();

  return status === ORDER_ITEM_STATUS_CANCELLED ||
    status === 'CANCELED' ||
    status === 'VOID' ||
    status === ORDER_ITEM_STATUS_REJECTED;
}

function testCheckoutOrderDirectStock() {
  var menuId = TEST_DIRECT_STOCK_MENU_ID;
  ensureDirectStockTestMenu_();

  var stockBefore = getMenuStockQtyForTest_(menuId);
  var amount = getMenuPriceForTest_(menuId);
  var result = checkoutOrder_({
    order_type: 'TAKEAWAY',
    table_no: 'TEST',
    items: [
      {
        menu_id: menuId,
        quantity: 1
      }
    ],
    note: 'DIRECT stock checkout test: ' + TEST_DIRECT_STOCK_MENU_NAME,
    created_by: 'TEST',
    payment: {
      method: 'CASH',
      amount: amount,
      received: amount,
      reference: 'TEST-CHECKOUT'
    }
  });
  var stockAfter = getMenuStockQtyForTest_(menuId);

  if (result.success) {
    PropertiesService.getScriptProperties().setProperty('TEST_CHECKOUT_ORDER_ID', result.order.order_id);
  }

  result.verification = {
    stock_before: stockBefore,
    stock_after: stockAfter,
    stock_qty_decreased: stockAfter === stockBefore - 1,
    deducted_stock_count: result.deductedStock ? result.deductedStock.length : 0,
    first_deducted_target_type: result.deductedStock && result.deductedStock[0] ? result.deductedStock[0].target_type : '',
    first_deducted_qty: result.deductedStock && result.deductedStock[0] ? result.deductedStock[0].qty : 0,
    receipt_has_promptpay_settings: result.receipt &&
      result.receipt.promptpay_id !== undefined &&
      result.receipt.receipt_qr_size_mm !== undefined,
    passed: result.success &&
      stockAfter === stockBefore - 1 &&
      result.deductedStock &&
      result.deductedStock.length === 1 &&
      result.deductedStock[0].target_type === 'MENU' &&
      result.deductedStock[0].qty > 0 &&
      result.receipt &&
      result.receipt.promptpay_id !== undefined &&
      result.receipt.receipt_qr_size_mm !== undefined
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function testCheckoutOrderCustomCounterSale() {
  var amount = 10;
  var result = checkoutOrder_({
    order_type: 'TAKEAWAY',
    items: [
      {
        menu_id: CUSTOM_COUNTER_MENU_ID,
        item_type: CUSTOM_COUNTER_ITEM_TYPE,
        menu_name: '\u0e44\u0e1f\u0e41\u0e0a\u0e47\u0e01',
        menu_name_snapshot: '\u0e44\u0e1f\u0e41\u0e0a\u0e47\u0e01',
        quantity: 1,
        unit_price: amount,
        note: 'CUSTOM_COUNTER checkout test'
      }
    ],
    note: 'CUSTOM_COUNTER checkout test',
    created_by: 'TEST',
    payment: {
      method: 'CASH',
      amount: amount,
      received: amount,
      reference: 'TEST-CUSTOM-COUNTER'
    }
  });
  var stockLogs = result.success ? getStockLogsForOrderTest_(result.order.order_id) : [];

  result.verification = {
    item_menu_id: result.items && result.items[0] ? result.items[0].menu_id : '',
    item_name: result.items && result.items[0] ? result.items[0].menu_name_snapshot : '',
    item_total: result.items && result.items[0] ? result.items[0].total : 0,
    deducted_stock_count: result.deductedStock ? result.deductedStock.length : 0,
    stock_log_count_for_order: stockLogs.length,
    passed: result.success &&
      result.items &&
      result.items.length === 1 &&
      result.items[0].menu_id === CUSTOM_COUNTER_MENU_ID &&
      result.items[0].total === amount &&
      result.deductedStock &&
      result.deductedStock.length === 0 &&
      stockLogs.length === 0
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function testCreateOrderDirectStock() {
  var menuId = TEST_DIRECT_STOCK_MENU_ID;
  ensureDirectStockTestMenu_();

  var result = createOrder_({
    order_type: 'TAKEAWAY',
    table_no: 'TEST',
    items: [
      {
        menu_id: menuId,
        quantity: 1
      }
    ],
    note: 'DIRECT stock test order: ' + TEST_DIRECT_STOCK_MENU_NAME,
    created_by: 'TEST'
  });

  if (result.success) {
    PropertiesService.getScriptProperties().setProperty('TEST_DIRECT_ORDER_ID', result.order.order_id);
  }

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function testPayOrderDirectStock() {
  var orderId = PropertiesService.getScriptProperties().getProperty('TEST_DIRECT_ORDER_ID');
  var menuId = TEST_DIRECT_STOCK_MENU_ID;

  if (!orderId) {
    var createResult = testCreateOrderDirectStock();
    orderId = createResult.order.order_id;
  }

  var detail = getOrderDetail_({
    order_id: orderId
  });

  if (!detail.success || detail.order.payment_status === PAYMENT_STATUS_PAID || detail.order.status === ORDER_STATUS_PAID) {
    var freshCreateResult = testCreateOrderDirectStock();
    orderId = freshCreateResult.order.order_id;
    detail = getOrderDetail_({
      order_id: orderId
    });
  }

  var stockBefore = getMenuStockQtyForTest_(menuId);
  var amount = detail.success ? detail.order.total : 0;
  var result = payOrder_({
    order_id: orderId,
    method: 'CASH',
    amount: amount,
    received: amount,
    created_by: 'TEST'
  });
  var stockAfter = getMenuStockQtyForTest_(menuId);
  var stockLogs = getStockLogsForOrderTest_(orderId);
  var menuLogs = stockLogs.filter(function (log) {
    return stringValue_(getValueByAliases_(log, ['target_type'], '')).toUpperCase() === 'MENU' &&
      stringValue_(getValueByAliases_(log, ['target_id'], '')) === menuId;
  });
  var firstMenuLog = menuLogs[0] || {};
  var verification = {
    stock_before: stockBefore,
    stock_after: stockAfter,
    stock_qty_decreased: stockAfter === stockBefore - 1,
    stock_log_count_for_order: stockLogs.length,
    menu_stock_log_count_for_order: menuLogs.length,
    stock_log_target_type: stringValue_(getValueByAliases_(firstMenuLog, ['target_type'], '')),
    stock_log_qty: numberValue_(getValueByAliases_(firstMenuLog, ['qty'], 0)),
    stock_log_qty_positive: numberValue_(getValueByAliases_(firstMenuLog, ['qty'], 0)) > 0,
    passed: result.success && stockAfter === stockBefore - 1 &&
      stockLogs.length === 1 &&
      menuLogs.length === 1 &&
      numberValue_(getValueByAliases_(firstMenuLog, ['qty'], 0)) > 0
  };

  result.verification = verification;

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function testGetRecentOrders() {
  var result = getRecentOrders_({
    limit: 20,
    include_cancelled: false
  });

  result.verification = {
    has_orders_array: Array.isArray(result.orders),
    excludes_cancelled_by_default: result.success && result.orders.every(function (order) {
      return stringValue_(order.status).toUpperCase() !== ORDER_STATUS_CANCELLED &&
        stringValue_(order.payment_status).toUpperCase() !== PAYMENT_STATUS_CANCELLED;
    }),
    passed: result.success && Array.isArray(result.orders)
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function testGetOrderDetail() {
  var recent = getRecentOrders_({
    limit: 1,
    include_cancelled: true
  });
  var orderId = recent.success && recent.orders && recent.orders[0] ? recent.orders[0].order_id : '';

  if (!orderId) {
    var checkout = testCheckoutOrderCustomCounterSale();
    orderId = checkout.success && checkout.order ? checkout.order.order_id : '';
  }

  var result = getOrderDetail_({
    order_id: orderId
  });

  result.verification = {
    has_items_array: result.success && Array.isArray(result.items),
    has_payments_array: result.success && Array.isArray(result.payments),
    has_totals: result.success && result.totals && result.totals.total !== undefined,
    receipt_has_promptpay_settings: result.success &&
      result.receipt &&
      result.receipt.promptpay_id !== undefined &&
      result.receipt.receipt_qr_size_mm !== undefined,
    passed: result.success &&
      Array.isArray(result.items) &&
      Array.isArray(result.payments) &&
      result.totals &&
      result.totals.total !== undefined
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function ensureDirectStockTestMenu_() {
  initializeDatabaseSheets_();

  var menuTable = getSheetRecordsWithRowNumbers_('menus');
  var existing = findRecordByValue_(menuTable.records, ['menu_id'], TEST_DIRECT_STOCK_MENU_ID);
  var timestamp = nowIso_();

  if (!existing) {
    throw new Error('Test direct stock menu not found: ' + TEST_DIRECT_STOCK_MENU_ID + ' ' + TEST_DIRECT_STOCK_MENU_NAME);
  }

  var stockColumn = getHeaderColumn_(menuTable.headers, ['stock_qty']);
  var availableColumn = getHeaderColumn_(menuTable.headers, ['is_available']);
  var trackStockColumn = getHeaderColumn_(menuTable.headers, ['track_stock']);
  var stockModeColumn = getHeaderColumn_(menuTable.headers, ['stock_mode']);
  var updatedAtColumn = getHeaderColumn_(menuTable.headers, ['updated_at']);

  if (stockColumn) {
    menuTable.sheet.getRange(existing._rowNumber, stockColumn).setValue(TEST_DIRECT_STOCK_QTY);
  }

  if (availableColumn) {
    menuTable.sheet.getRange(existing._rowNumber, availableColumn).setValue(true);
  }

  if (trackStockColumn) {
    menuTable.sheet.getRange(existing._rowNumber, trackStockColumn).setValue(true);
  }

  if (stockModeColumn) {
    menuTable.sheet.getRange(existing._rowNumber, stockModeColumn).setValue('DIRECT');
  }

  if (updatedAtColumn) {
    menuTable.sheet.getRange(existing._rowNumber, updatedAtColumn).setValue(timestamp);
  }

  clearMenuCache_();
}

function getMenuStockQtyForTest_(menuId) {
  var menu = findRecordByValue_(readSheetRecordsByHeaders_('menus'), ['menu_id'], menuId);

  if (!menu) {
    return 0;
  }

  return numberValue_(getValueByAliases_(menu, ['stock_qty'], 0));
}

function getMenuPriceForTest_(menuId) {
  var menu = findRecordByValue_(readSheetRecordsByHeaders_('menus'), ['menu_id'], menuId);

  if (!menu) {
    return 0;
  }

  return numberValue_(getValueByAliases_(menu, ['price', 'base_price'], 0));
}

function getStockLogsForOrderTest_(orderId) {
  return readSheetRecordsByHeaders_('stock_logs').filter(function (log) {
    return stringValue_(getValueByAliases_(log, ['ref_type'], '')).toUpperCase() === 'ORDER' &&
      stringValue_(getValueByAliases_(log, ['ref_id'], '')) === orderId;
  });
}
