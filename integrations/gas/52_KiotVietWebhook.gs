/**
 * EcoSynTech Farm OS / POS Cafe — KiotViet Webhook Receiver + Pull endpoint
 * ---------------------------------------------------------------------------
 * File: 52_KiotVietWebhook.gs
 * Target: drop-in vào EcoSynTech_GAS_V10_3/ (cùng cấp với 01_Config.gs)
 *
 * Contracts:
 *   POST <web-app-url>?shopId=KVB-001&secret=XXX
 *        body = KiotViet webhook payload JSON
 *        → ghi row vào Sheet `kiotviet-<shopId>-orders` trong Drive folder dùng chung
 *
 *   GET  <web-app-url>?action=kiotviet-pull&shopId=KVB-001&apiKey=XXX&since=TS&limit=50
 *        → trả JSON { ok, count, orders } cho POS Cafe poll
 *
 * Setup:
 *   1. Script Properties:
 *        KIOTVIET_WEBHOOK_SECRET   = chuỗi ngẫu nhiên (chia sẻ với KiotViet)
 *        KIOTVIET_PULL_APIKEY_<shopId>  = chuỗi ngẫu nhiên (chia sẻ với POS Cafe)
 *        KIOTVIET_FOLDER_NAME      = mặc định "KiotViet_Webhooks_EcoSynTech"
 *   2. Deploy as Web App: execute as Me, access: Anyone with link.
 *   3. Đăng ký webhook trên KiotViet với URL chứa ?shopId=...&secret=...
 *
 * WARNING — KiotViet payload schema được tham chiếu theo public docs
 * (Notifications[].Action / .Data[]). Trước go-live, MUST verify với
 * docs.kiotapi.com & test với 1 đơn thật để chốt field names.
 *
 * Hard rules:
 *   - KHÔNG hardcode secret, đọc từ Script Properties
 *   - Idempotent: dedupe theo Code (order_no)
 *   - Append-only Sheet, POS Cafe đọc bằng since=timestamp
 *   - GAS web app KHÔNG trả HTTP status code → ok/error đặt trong JSON body
 */

/** ========= ROUTER ENTRY POINTS — wire vào doPost/doGet existing ========= */

/**
 * Gọi từ doPost(e) chính:
 *   if (e.parameter.kvWebhook === '1') return handleKiotVietPost(e);
 */
function handleKiotVietPost(e) {
  try {
    var props = PropertiesService.getScriptProperties();
    var expected = props.getProperty('KIOTVIET_WEBHOOK_SECRET');
    var incoming = e.parameter.secret || '';

    if (!expected) {
      return _kvJson({ ok: false, error: 'server_secret_missing' });
    }
    if (incoming !== expected) {
      _kvAuditLog('webhook_auth_fail', { ip_hint: e.parameter.shopId || '', ts: Date.now() });
      return _kvJson({ ok: false, error: 'invalid_secret' });
    }

    var shopId = (e.parameter.shopId || '').trim();
    if (!shopId) return _kvJson({ ok: false, error: 'missing_shopId' });

    var payload = {};
    try {
      payload = JSON.parse(e.postData.contents);
    } catch (err) {
      return _kvJson({ ok: false, error: 'invalid_json' });
    }

    var notifications = (payload && payload.Notifications) || [];
    if (notifications.length === 0) {
      return _kvJson({ ok: true, skipped: 'empty_payload' });
    }

    var written = 0;
    notifications.forEach(function (n) {
      var action = (n.Action || '').toLowerCase();
      var data = n.Data || [];
      data.forEach(function (item) {
        if (action.indexOf('order') === 0) {
          if (_kvHandleOrder(shopId, item)) written++;
        } else if (action.indexOf('product') === 0) {
          _kvHandleProduct(shopId, item);
        } else if (action.indexOf('invoice') === 0) {
          if (_kvHandleOrder(shopId, item)) written++;
        }
      });
    });

    return _kvJson({ ok: true, written: written });
  } catch (err) {
    _kvAuditLog('webhook_exception', { msg: String(err), stack: String(err.stack || '') });
    return _kvJson({ ok: false, error: 'internal' });
  }
}

/**
 * Gọi từ doGet(e) chính:
 *   if (e.parameter.action === 'kiotviet-pull') return handleKiotVietPull(e);
 */
function handleKiotVietPull(e) {
  try {
    var shopId = (e.parameter.shopId || '').trim();
    var apiKey = (e.parameter.apiKey || '').trim();
    if (!shopId || !apiKey) return _kvJson({ ok: false, error: 'missing_params' });

    var props = PropertiesService.getScriptProperties();
    var expected = props.getProperty('KIOTVIET_PULL_APIKEY_' + shopId);
    if (!expected || apiKey !== expected) {
      _kvAuditLog('pull_auth_fail', { shopId: shopId, ts: Date.now() });
      return _kvJson({ ok: false, error: 'unauthorized' });
    }

    var since = parseInt(e.parameter.since || '0', 10);
    var limit = Math.min(parseInt(e.parameter.limit || '50', 10), 200);

    var sheet = _kvGetOrCreateSheet(shopId, 'orders');
    var range = sheet.getDataRange().getValues();
    if (range.length <= 1) return _kvJson({ ok: true, count: 0, orders: [] });

    var header = range[0];
    var orders = [];
    for (var i = 1; i < range.length && orders.length < limit; i++) {
      var row = range[i];
      var receivedAt = row[0];
      var ts = (receivedAt instanceof Date) ? receivedAt.getTime() : new Date(receivedAt).getTime();
      if (isNaN(ts) || ts <= since) continue;
      var obj = {};
      header.forEach(function (k, idx) { obj[k] = row[idx]; });
      // Normalize Date objects to epoch ms for JSON safe
      obj.received_at = ts;
      orders.push(obj);
    }
    return _kvJson({ ok: true, count: orders.length, orders: orders });
  } catch (err) {
    return _kvJson({ ok: false, error: 'internal', detail: String(err) });
  }
}

/** ========= ORDER / PRODUCT HANDLERS ========= */

function _kvHandleOrder(shopId, order) {
  // Schema giả định (verify với docs.kiotapi.com):
  //   order.Id, order.Code, order.Total, order.PurchaseDate, order.Customer{}, order.OrderDetails[]
  var orderNo = order.Code || order.OrderCode || ('KV-' + (order.Id || Date.now()));
  var sheet = _kvGetOrCreateSheet(shopId, 'orders');

  // Idempotent: skip nếu order_no đã có
  if (_kvOrderExists(sheet, orderNo)) return false;

  var customerName = '';
  if (order.Customer && (order.Customer.Name || order.Customer.ContactNumber)) {
    customerName = order.Customer.Name || order.Customer.ContactNumber || '';
  }

  var orderedAt = order.PurchaseDate || order.OrderDate || order.CreatedDate || '';
  var details = order.OrderDetails || order.InvoiceDetails || [];

  sheet.appendRow([
    new Date(),                          // received_at
    orderNo,                             // order_no
    Number(order.Total || 0),            // total
    String(orderedAt || ''),             // ordered_at (giữ string từ KiotViet)
    customerName,                        // customer
    String(order.TableId || order.RetailerId || ''), // table
    String(order.Description || ''),     // note
    String(order.StatusValue || order.Status || ''), // status_raw
    JSON.stringify(details).slice(0, 49000) // details_json (Sheet cell limit 50k)
  ]);
  return true;
}

function _kvHandleProduct(shopId, product) {
  var sheet = _kvGetOrCreateSheet(shopId, 'products');
  sheet.appendRow([
    new Date(),
    product.Code || '',
    product.Name || '',
    Number(product.BasePrice || 0),
    String(product.Status || ''),
    JSON.stringify(product).slice(0, 49000)
  ]);
}

function _kvOrderExists(sheet, orderNo) {
  // Cache last 200 order_no in script cache for speed
  var cache = CacheService.getScriptCache();
  var key = 'kv_seen_' + sheet.getName();
  var seen = cache.get(key);
  var arr = seen ? seen.split('|') : [];
  if (arr.indexOf(orderNo) >= 0) return true;

  // Fallback: scan column B (order_no)
  var data = sheet.getRange(1, 2, sheet.getLastRow(), 1).getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === orderNo) {
      arr.push(orderNo);
      cache.put(key, arr.slice(-200).join('|'), 21600);
      return true;
    }
  }
  arr.push(orderNo);
  cache.put(key, arr.slice(-200).join('|'), 21600);
  return false;
}

/** ========= SHEET / FOLDER UTILS ========= */

function _kvGetOrCreateSheet(shopId, kind) {
  var folder = _kvGetOrCreateFolder();
  var fileName = 'kiotviet-' + shopId + '-' + kind;
  var iter = folder.getFilesByName(fileName);
  var ss;
  if (iter.hasNext()) {
    ss = SpreadsheetApp.openById(iter.next().getId());
  } else {
    ss = SpreadsheetApp.create(fileName);
    DriveApp.getFileById(ss.getId()).moveTo(folder);
    var sheet = ss.getActiveSheet();
    if (kind === 'orders') {
      sheet.appendRow([
        'received_at', 'order_no', 'total', 'ordered_at', 'customer',
        'table', 'note', 'status_raw', 'details_json'
      ]);
      sheet.setFrozenRows(1);
    } else if (kind === 'products') {
      sheet.appendRow(['received_at', 'code', 'name', 'base_price', 'status', 'raw_json']);
      sheet.setFrozenRows(1);
    }
  }
  return ss.getActiveSheet();
}

function _kvGetOrCreateFolder() {
  var props = PropertiesService.getScriptProperties();
  var name = props.getProperty('KIOTVIET_FOLDER_NAME') || 'KiotViet_Webhooks_EcoSynTech';
  var folders = DriveApp.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(name);
}

function _kvAuditLog(action, payload) {
  try {
    var sheet = _kvGetOrCreateSheet('_system', 'audit');
    sheet.appendRow([new Date(), action, JSON.stringify(payload || {}).slice(0, 49000)]);
  } catch (e) { /* swallow */ }
}

function _kvJson(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** ========= ADMIN UTILITIES (chạy thủ công 1 lần qua editor) ========= */

/**
 * Tạo Pull API Key mới cho 1 shop.
 * Mở Apps Script editor → chọn function này → Run → check log.
 * Output: chuỗi key → copy paste vào POS Cafe Settings.
 *
 * Sử dụng:
 *   1. Mở function này
 *   2. Sửa SHOP_ID = "KVB-001"
 *   3. Run → xem Logs → copy key
 */
function adminCreatePullApiKey() {
  var SHOP_ID = 'KVB-001'; // ⚠ ĐỔI shopId tại đây trước khi Run
  var key = Utilities.getUuid().replace(/-/g, '').slice(0, 24);
  PropertiesService.getScriptProperties().setProperty('KIOTVIET_PULL_APIKEY_' + SHOP_ID, key);
  Logger.log('Shop: ' + SHOP_ID);
  Logger.log('Pull API Key: ' + key);
  Logger.log('Lưu vào POS Cafe Settings → KiotViet Integration → Pull API Key');
  return key;
}

/**
 * Tạo Webhook Secret 1 lần cho toàn server.
 * Output: copy chuỗi này vào KiotViet webhook config.
 */
function adminCreateWebhookSecret() {
  var s = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty('KIOTVIET_WEBHOOK_SECRET', s);
  Logger.log('Webhook Secret: ' + s);
  Logger.log('Dán secret này vào URL webhook KiotViet: ?shopId=...&secret=' + s);
  return s;
}

/**
 * Smoke test — chạy 1 lần để tạo file Sheet template trước go-live.
 */
function adminSmokeTest() {
  var shop = 'KVB-DEMO';
  var fakeOrder = {
    Code: 'TEST-' + Date.now(),
    Total: 99000,
    PurchaseDate: new Date().toISOString(),
    Customer: { Name: 'Khách Test' },
    Description: 'Smoke test',
    OrderDetails: [{ ProductCode: 'CFD01', ProductName: 'Cà phê test', Quantity: 1, Price: 99000 }]
  };
  var ok = _kvHandleOrder(shop, fakeOrder);
  Logger.log('Smoke: written=' + ok + ' → mở Sheet "kiotviet-' + shop + '-orders" trong folder KiotViet_Webhooks_EcoSynTech.');
}
