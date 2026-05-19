var APP_NAME = 'ล้านก๋างโต้ง';

var ORDER_ITEM_STATUS_PENDING_CONFIRM = 'PENDING_CONFIRM';
var ORDER_ITEM_STATUS_NEW = 'NEW';
var ORDER_ITEM_STATUS_REJECTED = 'REJECTED';
var ORDER_ITEM_STATUS_CANCELLED = 'CANCELLED';
var ORDER_ITEM_STATUS_PAID = 'PAID';
var ORDER_STATUS_CANCELLED = 'CANCELLED';
var PAYMENT_STATUS_CANCELLED = 'CANCELLED';

var SCRIPT_PROPERTY_KEYS = {
  SPREADSHEET_ID: 'SPREADSHEET_ID',
  ADMIN_TOKEN: 'admin_token',
  MENU_IMAGE_FOLDER_ID: 'MENU_IMAGE_FOLDER_ID',
  DATABASE_SCHEMA_VERSION: 'DATABASE_SCHEMA_VERSION',
  ENABLE_BACKEND_PERFORMANCE_LOGS: 'ENABLE_BACKEND_PERFORMANCE_LOGS'
};

// Used only to bootstrap Script Properties the first time INIT_DATABASE runs.
var DEFAULT_SPREADSHEET_ID = '1WF59gHhdUse6XzphjNSV1Pd58KXrNQ3qkKoS6uwckFI';
var DATABASE_SCHEMA_VERSION = '2026-05-13-tables-qr-v1';

var SHEET_SCHEMAS = {
  settings: [
    'key',
    'value',
    'description',
    'updated_at'
  ],

  users: [
    'user_id',
    'name',
    'role',
    'pin',
    'is_active',
    'created_at',
    'updated_at'
  ],

  tables: [
    'table_id',
    'table_no',
    'table_name',
    'status',
    'current_order_id',
    'qr_token',
    'sort_order',
    'is_active',
    'created_at',
    'updated_at'
  ],

  menu_categories: [
    'category_id',
    'name',
    'sort_order',
    'is_active',
    'created_at',
    'updated_at'
  ],

  menus: [
    'menu_id',
    'category_id',
    'name_th',
    'name_en',
    'description',
    'price',
    'cost',
    'image_url',
    'is_available',
    'is_recommended',
    'recommended_sort',
    'track_stock',
    'stock_mode',
    'stock_qty',
    'low_stock_level',
    'sort_order',
    'created_at',
    'updated_at'
  ],

  menu_options: [
    'option_id',
    'menu_id',
    'option_group',
    'option_name',
    'price_delta',
    'is_active',
    'sort_order',
    'created_at',
    'updated_at'
  ],

  ingredients: [
    'ingredient_id',
    'name',
    'unit',
    'stock_qty',
    'low_stock_level',
    'cost_per_unit',
    'is_active',
    'created_at',
    'updated_at'
  ],

  recipes: [
    'recipe_id',
    'menu_id',
    'ingredient_id',
    'quantity',
    'unit',
    'created_at',
    'updated_at'
  ],

  orders: [
    'order_id',
    'order_no',
    'order_type',
    'table_no',
    'table_id',
    'status',
    'payment_status',
    'subtotal',
    'discount',
    'service_charge',
    'tax',
    'total',
    'note',
    'created_by',
    'created_at',
    'updated_at',
    'closed_at'
  ],

  order_items: [
    'item_id',
    'order_id',
    'menu_id',
    'menu_name_snapshot',
    'menu_name',
    'quantity',
    'unit_price',
    'option_text',
    'discount',
    'total',
    'note',
    'status',
    'created_at',
    'updated_at'
  ],

  payments: [
    'payment_id',
    'order_id',
    'method',
    'amount',
    'received',
    'received_amount',
    'change_amount',
    'reference',
    'paid_at',
    'created_at',
    'created_by'
  ],

  stock_logs: [
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
  ],

  daily_close: [
    'close_id',
    'business_date',
    'opening_cash',
    'cash_sales',
    'transfer_sales',
    'card_sales',
    'other_sales',
    'total_sales',
    'expense_total',
    'expected_cash',
    'counted_cash',
    'difference',
    'note',
    'closed_by',
    'closed_at'
  ]
};

var REQUIRED_SHEETS = Object.keys(SHEET_SCHEMAS);

function getSpreadsheetId_() {
  var properties = PropertiesService.getScriptProperties();
  var spreadsheetId = properties.getProperty(SCRIPT_PROPERTY_KEYS.SPREADSHEET_ID);

  if (!spreadsheetId) {
    spreadsheetId = DEFAULT_SPREADSHEET_ID;
    properties.setProperty(SCRIPT_PROPERTY_KEYS.SPREADSHEET_ID, spreadsheetId);
  }

  return spreadsheetId;
}

function getDatabase_() {
  return SpreadsheetApp.openById(getSpreadsheetId_());
}

function getSheetOrThrow_(sheetName) {
  var sheet = getDatabase_().getSheetByName(sheetName);

  if (!sheet) {
    throw new Error('Missing required sheet: ' + sheetName);
  }

  return sheet;
}

function getHeaders_(sheetName) {
  return SHEET_SCHEMAS[sheetName] || [];
}

function nowIso_() {
  return new Date().toISOString();
}

function perfStart_() {
  return new Date().getTime();
}

var backendPerformanceLogsCache_ = {
  checkedAt: 0,
  enabled: false
};

function isBackendPerformanceLogsEnabled_() {
  var now = perfStart_();

  if (backendPerformanceLogsCache_.checkedAt && now - backendPerformanceLogsCache_.checkedAt < 30000) {
    return backendPerformanceLogsCache_.enabled;
  }

  var value = PropertiesService
    .getScriptProperties()
    .getProperty(SCRIPT_PROPERTY_KEYS.ENABLE_BACKEND_PERFORMANCE_LOGS);

  backendPerformanceLogsCache_.checkedAt = now;
  backendPerformanceLogsCache_.enabled = String(value || '').toUpperCase() === 'TRUE';

  return backendPerformanceLogsCache_.enabled;
}

function perfLog_(label, startTime) {
  if (!isBackendPerformanceLogsEnabled_()) {
    return;
  }

  Logger.log('[PERF] ' + label + ': ' + (perfStart_() - startTime) + 'ms');
}

function makeId_(prefix) {
  return prefix + '_' + Utilities.getUuid();
}
