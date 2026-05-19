/**
 * Google Apps Script Web App API entrypoint for "ล้านก๋างโต้ง" POS.
 *
 * Deploy as a Web App and send all frontend writes through doPost(e).
 */
function doPost(e) {
  try {
    var request = parseRequest_(e);
    var action = normalizeAction_(request.action);

    if (!action) {
      return jsonResponse_({
        success: false,
        message: 'Missing action'
      });
    }

    switch (action) {
      case 'INIT_DATABASE':
        return jsonResponse_(initDatabase_(request));

      case 'SEED_DATABASE':
        return jsonResponse_(seedDatabase_(request));

      case 'GET_SETTINGS':
        return jsonResponse_(handleSettingsAction_(action, request));

      case 'RESET_TRANSACTION_DATA_FOR_DEV':
      case 'DISABLE_TEST_MENU':
        return jsonResponse_(handleDevUtilityAction_(action, request));

      case 'GET_MENU':
      case 'LIST_MENUS':
      case 'GET_ADMIN_MENUS':
      case 'CREATE_MENU':
      case 'UPDATE_MENU':
      case 'UPDATE_MENU_BASIC':
      case 'DELETE_MENU':
        return jsonResponse_(handleMenuAction_(action, request));

      case 'CREATE_ORDER':
      case 'CHECKOUT_ORDER':
      case 'CONFIRM_ORDER':
      case 'UPDATE_ORDER':
      case 'CANCEL_ORDER':
      case 'PAY_ORDER':
      case 'GET_ORDER_DETAIL':
        return jsonResponse_(handleOrderAction_(action, request));

      case 'GET_TABLES':
      case 'OPEN_TABLE':
      case 'GET_TABLE_ORDER':
      case 'ADD_ITEMS_TO_TABLE_ORDER':
      case 'PAY_TABLE_ORDER':
      case 'GET_TABLE_QR_LINKS':
      case 'REGENERATE_TABLE_QR_TOKENS':
      case 'SUBMIT_QR_TABLE_ORDER':
        return jsonResponse_(handleTableAction_(action, request));

      case 'GET_STOCK':
      case 'ADJUST_STOCK':
        return jsonResponse_(handleStockAction_(action, request));

      case 'GET_DAILY_REPORT':
      case 'CLOSE_DAY':
        return jsonResponse_(handleReportAction_(action, request));

      default:
        return jsonResponse_({
          success: false,
          message: 'Unsupported action: ' + action
        });
    }
  } catch (err) {
    return jsonResponse_({
      success: false,
      message: err && err.message ? err.message : String(err)
    });
  }
}

/**
 * Optional lightweight health check for browser/manual testing.
 * API writes should still use doPost(e).
 */
function doGet() {
  return jsonResponse_({
    success: true,
    message: APP_NAME + ' API is running'
  });
}

function parseRequest_(e) {
  var request = {};

  if (e && e.postData && e.postData.contents) {
    try {
      request = JSON.parse(e.postData.contents);
    } catch (err) {
      throw new Error('Invalid JSON body');
    }
  }

  if (e && e.parameter) {
    Object.keys(e.parameter).forEach(function (key) {
      if (request[key] === undefined) {
        request[key] = e.parameter[key];
      }
    });
  }

  return request;
}

function normalizeAction_(action) {
  return action ? String(action).trim().toUpperCase() : '';
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
