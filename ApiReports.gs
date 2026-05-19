function handleReportAction_(action, request) {
  switch (action) {
    case 'GET_DAILY_REPORT':
      return getDailyReport_(request || {});

    case 'CLOSE_DAY':
      return {
        success: false,
        message: action + ' is not implemented yet'
      };

    default:
      return {
        success: false,
        message: action + ' is not implemented yet'
      };
  }
}

function getDailyReport_(request) {
  var businessDate = normalizeBusinessDateRequest_(request.business_date);

  if (request.business_date && !businessDate) {
    return {
      success: false,
      error: 'INVALID_BUSINESS_DATE',
      message: 'business_date must be YYYY-MM-DD'
    };
  }

  businessDate = businessDate || getTodayBusinessDate_();

  var orders = readSheetRows_('orders');
  var orderItems = readSheetRows_('order_items');
  var payments = readSheetRows_('payments');
  var paymentsByOrderId = groupRecordsByOrderId_(payments);
  var itemsByOrderId = groupRecordsByOrderId_(orderItems);
  var summary = {
    total_sales: 0,
    order_count: 0,
    item_count: 0,
    cash_sales: 0,
    transfer_sales: 0,
    qr_sales: 0,
    card_sales: 0
  };
  var topItemsByKey = {};
  var paymentSummaryByMethod = {};
  var recentOrders = [];

  orders.forEach(function (order) {
    var orderId = stringValue_(getValueByAliases_(order, ['order_id'], ''));

    if (!orderId || !isReportPaidOrder_(order)) {
      return;
    }

    var orderPayments = paymentsByOrderId[orderId] || [];
    var normalizedPayments = orderPayments.map(normalizeReportPaymentRecord_);
    var latestPayment = getLatestReportPayment_(normalizedPayments);
    var reportDateSource = getOrderReportDateSource_(order, normalizedPayments);

    if (reportDateSource.business_date !== businessDate) {
      return;
    }

    var orderTotal = numberValue_(getValueByAliases_(order, ['total'], 0));

    summary.order_count += 1;
    summary.total_sales += orderTotal;

    (itemsByOrderId[orderId] || []).forEach(function (item) {
      var menuId = stringValue_(getValueByAliases_(item, ['menu_id'], ''));
      var menuName = stringValue_(getValueByAliases_(item, ['menu_name_snapshot', 'menu_name'], menuId));
      var quantity = numberValue_(getValueByAliases_(item, ['quantity', 'qty'], 0));
      var itemTotal = numberValue_(getValueByAliases_(item, ['total'], 0));
      var itemType = stringValue_(getValueByAliases_(item, ['item_type', 'itemType'], '')).toUpperCase();
      var itemKey = menuId || menuName;

      if (!itemKey || quantity <= 0) {
        return;
      }

      if (itemType === 'CUSTOM_COUNTER' || menuId === 'CUSTOM_COUNTER') {
        menuId = 'CUSTOM_COUNTER';
        menuName = '\u0e02\u0e32\u0e22\u0e2b\u0e19\u0e49\u0e32\u0e23\u0e49\u0e32\u0e19';
        itemKey = 'CUSTOM_COUNTER';
      }

      summary.item_count += quantity;

      if (!topItemsByKey[itemKey]) {
        topItemsByKey[itemKey] = {
          menu_id: menuId,
          menu_name: menuName,
          quantity: 0,
          total: 0
        };
      }

      topItemsByKey[itemKey].quantity += quantity;
      topItemsByKey[itemKey].total += itemTotal;
    });

    if (normalizedPayments.length) {
      normalizedPayments.forEach(function (payment) {
        addPaymentToReportSummary_(paymentSummaryByMethod, summary, payment, orderId);
      });
    }

    recentOrders.push({
      order_id: orderId,
      order_no: stringValue_(getValueByAliases_(order, ['order_no'], '')),
      created_at: getValueByAliases_(order, ['created_at'], ''),
      paid_at: latestPayment && latestPayment.paid_at ? latestPayment.paid_at : getValueByAliases_(order, ['closed_at'], ''),
      payment_method: latestPayment ? latestPayment.method : '',
      total: orderTotal,
      _sort_at: reportDateSource.value
    });
  });

  var topItems = Object.keys(topItemsByKey)
    .map(function (key) {
      return topItemsByKey[key];
    })
    .sort(function (a, b) {
      if (b.quantity !== a.quantity) {
        return b.quantity - a.quantity;
      }

      if (b.total !== a.total) {
        return b.total - a.total;
      }

      return stringValue_(a.menu_name).localeCompare(stringValue_(b.menu_name));
    });

  recentOrders = recentOrders
    .sort(function (a, b) {
      return getReportTimeValue_(b._sort_at) - getReportTimeValue_(a._sort_at);
    })
    .slice(0, 20)
    .map(function (order) {
      delete order._sort_at;
      return order;
    });

  var paymentSummary = Object.keys(paymentSummaryByMethod)
    .map(function (method) {
      var payment = paymentSummaryByMethod[method];

      return {
        method: method,
        amount: payment.amount,
        order_count: Object.keys(payment.orderIds).length
      };
    })
    .sort(sortPaymentSummary_);

  return {
    success: true,
    business_date: businessDate,
    summary: summary,
    top_items: topItems,
    recent_orders: recentOrders,
    payment_summary: paymentSummary
  };
}

function readSheetRows_(sheetName) {
  return readSheetRecordsByHeaders_(sheetName);
}

function normalizeBusinessDateRequest_(value) {
  var text = stringValue_(value);

  if (!text) {
    return '';
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function getTodayBusinessDate_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function getReportDateKey_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }

  var text = stringValue_(value);

  if (!text) {
    return '';
  }

  var parsed = new Date(text);

  if (!isNaN(parsed.getTime())) {
    return Utilities.formatDate(parsed, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    return text.slice(0, 10);
  }

  return '';
}

function getOrderReportDateSource_(order, payments) {
  var paidPayments = payments.filter(function (payment) {
    return !!payment.paid_at;
  });
  var latestPaidPayment = getLatestReportPayment_(paidPayments);
  var value = latestPaidPayment && latestPaidPayment.paid_at
    ? latestPaidPayment.paid_at
    : getValueByAliases_(order, ['closed_at'], '');

  if (!value) {
    value = getValueByAliases_(order, ['created_at'], '');
  }

  return {
    value: value,
    business_date: getReportDateKey_(value)
  };
}

function getReportTimeValue_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return value.getTime();
  }

  var text = stringValue_(value);
  var parsed = new Date(text);

  return isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function isReportPaidOrder_(order) {
  return stringValue_(getValueByAliases_(order, ['status'], '')).toUpperCase() === 'PAID' ||
    stringValue_(getValueByAliases_(order, ['payment_status'], '')).toUpperCase() === 'PAID';
}

function groupRecordsByOrderId_(records) {
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

function normalizeReportPaymentRecord_(payment) {
  return {
    order_id: stringValue_(getValueByAliases_(payment, ['order_id'], '')),
    method: normalizeReportPaymentMethod_(getValueByAliases_(payment, ['method'], '')),
    amount: numberValue_(getValueByAliases_(payment, ['amount'], 0)),
    paid_at: getValueByAliases_(payment, ['paid_at'], '')
  };
}

function normalizeReportPaymentMethod_(method) {
  var text = stringValue_(method).toUpperCase();

  if (!text) {
    return 'OTHER';
  }

  if (text.indexOf('CASH') !== -1) {
    return 'CASH';
  }

  if (text.indexOf('TRANSFER') !== -1 || text.indexOf('BANK') !== -1) {
    return 'TRANSFER';
  }

  if (text.indexOf('QR') !== -1 || text.indexOf('PROMPT') !== -1) {
    return 'QR';
  }

  if (text.indexOf('CARD') !== -1 || text.indexOf('CREDIT') !== -1 || text.indexOf('DEBIT') !== -1) {
    return 'CARD';
  }

  return 'OTHER';
}

function getLatestReportPayment_(payments) {
  if (!payments.length) {
    return null;
  }

  var paymentsWithPaidAt = payments.filter(function (payment) {
    return !!payment.paid_at;
  });

  if (!paymentsWithPaidAt.length) {
    return payments[payments.length - 1];
  }

  return paymentsWithPaidAt.slice().sort(function (a, b) {
    return getReportTimeValue_(b.paid_at) - getReportTimeValue_(a.paid_at);
  })[0];
}

function addPaymentToReportSummary_(paymentSummaryByMethod, summary, payment, orderId) {
  var method = payment.method || 'OTHER';
  var amount = numberValue_(payment.amount);

  if (!paymentSummaryByMethod[method]) {
    paymentSummaryByMethod[method] = {
      amount: 0,
      orderIds: {}
    };
  }

  paymentSummaryByMethod[method].amount += amount;
  paymentSummaryByMethod[method].orderIds[orderId] = true;

  if (method === 'CASH') {
    summary.cash_sales += amount;
  } else if (method === 'TRANSFER') {
    summary.transfer_sales += amount;
  } else if (method === 'QR') {
    summary.qr_sales += amount;
  } else if (method === 'CARD') {
    summary.card_sales += amount;
  }
}

function sortPaymentSummary_(a, b) {
  var order = {
    CASH: 1,
    TRANSFER: 2,
    QR: 3,
    CARD: 4,
    OTHER: 99
  };
  var left = order[a.method] || 50;
  var right = order[b.method] || 50;

  if (left !== right) {
    return left - right;
  }

  return stringValue_(a.method).localeCompare(stringValue_(b.method));
}

function testGetDailyReport() {
  var result = getDailyReport_({
    business_date: getTodayBusinessDate_()
  });
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function testGetDailyReportForDate() {
  var result = getDailyReport_({
    business_date: '2026-05-12'
  });
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}
