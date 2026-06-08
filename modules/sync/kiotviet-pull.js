// ============================================================================
// kiotviet-pull.js — Poll GAS endpoint cho orders KiotViet realtime
// Non-blocking: GAS down → silent log, KHÔNG vỡ POS.
// Idempotent: dedup theo order_no qua Models.findOrderByNo (existing check).
// ============================================================================
(function (global) {
  'use strict';

  const STORAGE_CFG = 'ecosyntech-pos.kiotviet-config';
  const STORAGE_LAST = 'ecosyntech-pos.kiotviet-last-sync-ts';
  const STORAGE_LOG = 'ecosyntech-pos.kiotviet-log';
  const LOG_MAX = 50;

  function getConfig() {
    try { return JSON.parse(localStorage.getItem(STORAGE_CFG) || '{}'); }
    catch (e) { return {}; }
  }
  function setConfig(cfg) {
    localStorage.setItem(STORAGE_CFG, JSON.stringify(cfg || {}));
  }
  function getLastTs() {
    return parseInt(localStorage.getItem(STORAGE_LAST) || '0', 10) || 0;
  }
  function setLastTs(ts) {
    localStorage.setItem(STORAGE_LAST, String(ts));
  }
  function pushLog(entry) {
    let log = [];
    try { log = JSON.parse(localStorage.getItem(STORAGE_LOG) || '[]'); } catch (e) {}
    log.unshift({ ts: Date.now(), ...entry });
    log = log.slice(0, LOG_MAX);
    localStorage.setItem(STORAGE_LOG, JSON.stringify(log));
  }
  function readLog() {
    try { return JSON.parse(localStorage.getItem(STORAGE_LOG) || '[]'); }
    catch (e) { return []; }
  }

  /** Test connection: GET với since=now (kỳ vọng 0 đơn). */
  async function testConnection() {
    const cfg = getConfig();
    if (!cfg.endpoint || !cfg.shop_id || !cfg.pull_api_key) {
      return { ok: false, reason: 'Chưa nhập đủ Endpoint / Shop ID / Pull API Key' };
    }
    try {
      const url = _buildPullUrl(cfg, Date.now());
      const r = await fetch(url, { method: 'GET' });
      if (!r.ok) return { ok: false, reason: 'HTTP ' + r.status };
      const data = await r.json();
      if (!data.ok) return { ok: false, reason: data.error || 'GAS từ chối' };
      return { ok: true, count: data.count || 0 };
    } catch (e) {
      return { ok: false, reason: e.message };
    }
  }

  /** Poll 1 lần. Trả về { imported, skipped, errors } hoặc null nếu disabled. */
  async function pollOnce(app) {
    const cfg = getConfig();
    if (!cfg.enabled || !cfg.endpoint || !cfg.shop_id || !cfg.pull_api_key) return null;

    const since = getLastTs();
    try {
      const url = _buildPullUrl(cfg, since);
      const r = await fetch(url, { method: 'GET' });
      if (!r.ok) {
        pushLog({ level: 'warn', msg: 'GAS HTTP ' + r.status });
        return { imported: 0, skipped: 0, errors: 1 };
      }
      const data = await r.json();
      if (!data.ok) {
        pushLog({ level: 'warn', msg: 'GAS error: ' + (data.error || '?') });
        return { imported: 0, skipped: 0, errors: 1 };
      }
      const orders = data.orders || [];
      if (orders.length === 0) return { imported: 0, skipped: 0, errors: 0 };

      const result = _importOrders(app, orders, cfg);

      // Update last_ts to max received_at among imported (avoid re-pull)
      const maxTs = orders.reduce((m, o) => Math.max(m, Number(o.received_at || 0)), since);
      if (maxTs > since) setLastTs(maxTs);

      pushLog({
        level: 'info',
        msg: `Pull OK: ${orders.length} đơn từ GAS, import ${result.imported}, skip ${result.skipped}`,
      });
      return result;
    } catch (e) {
      pushLog({ level: 'error', msg: 'Pull exception: ' + e.message });
      return { imported: 0, skipped: 0, errors: 1 };
    }
  }

  function _buildPullUrl(cfg, since) {
    const base = cfg.endpoint.replace(/\?.*$/, '');
    const params = new URLSearchParams({
      action: 'kiotviet-pull',
      shopId: cfg.shop_id,
      apiKey: cfg.pull_api_key,
      since: String(since),
      limit: '50',
    });
    return base + '?' + params.toString();
  }

  /** Convert 1 KiotViet order (từ Sheet row) → POS Cafe order + import qua Models. */
  function _importOrders(app, orders, cfg) {
    const branchId = (app.shop && app.shop.id) || 1;
    let imported = 0, skipped = 0, errors = 0;

    orders.forEach((kv) => {
      try {
        const orderNo = String(kv.order_no || '').trim();
        if (!orderNo) { skipped++; return; }

        // Idempotent: dedupe theo (branch_id, order_no)
        const existing = DB.exec(
          'SELECT id FROM orders WHERE branch_id=? AND order_no=? LIMIT 1',
          [branchId, orderNo]
        );
        if (existing.length > 0) { skipped++; return; }

        // Parse details_json → items
        let details = [];
        try { details = JSON.parse(kv.details_json || '[]'); }
        catch (e) { details = []; }

        const items = details.map((d) => {
          const productName = String(d.ProductName || d.Name || '').trim();
          const qty = parseInt(d.Quantity || d.Qty || 1, 10) || 1;
          const unitPrice = Math.round(Number(d.Price || d.UnitPrice || 0));
          const discount = Math.round(Number(d.Discount || 0));
          const lineTotal = Math.round(Number(d.SubTotal || d.LineTotal || (unitPrice * qty - discount)));
          const found = Models.findProductByName(branchId, productName);
          return {
            product_id: found ? found.id : null,
            product_name: productName || '(không tên)',
            qty,
            unit_price: unitPrice,
            line_total: lineTotal,
          };
        });

        if (items.length === 0) {
          // Đơn không có details → tạo 1 item generic
          items.push({
            product_id: null,
            product_name: 'KiotViet đơn ' + orderNo,
            qty: 1,
            unit_price: Math.round(Number(kv.total || 0)),
            line_total: Math.round(Number(kv.total || 0)),
          });
        }

        const subtotal = items.reduce((s, it) => s + it.line_total, 0);
        const total = Math.round(Number(kv.total || 0)) || subtotal;
        const createdAt = _parseTs(kv.ordered_at) || Date.now();

        const orderId = Models.insertImportedOrder(branchId, {
          order_no: orderNo,
          subtotal,
          tax: 0,
          discount: Math.max(0, subtotal - total),
          total,
          payment_method: 'cash', // KiotViet không luôn gửi payment_method → mặc định
          note: 'KiotViet webhook · ' + (kv.customer || ''),
          created_at: createdAt,
          source: 'kiotviet_webhook',
        }, items);

        // Auto-deduct inventory (chỉ khi có recipe match)
        try {
          Models.deductInventoryForOrderItems(branchId, orderId, items, 'auto');
        } catch (e) {
          console.warn('[kiotviet-pull] deduct fail order', orderNo, e.message);
        }

        Models.logSync({
          entity: 'kiotviet_import',
          entity_id: orderId,
          action: 'pull',
          status: 'success',
          payload: { order_no: orderNo, total },
        });
        imported++;
      } catch (e) {
        errors++;
        console.warn('[kiotviet-pull] import fail', e);
        Models.logSync({
          entity: 'kiotviet_import',
          action: 'pull',
          status: 'failed',
          error: e.message,
        });
      }
    });

    DB.persist();
    return { imported, skipped, errors };
  }

  function _parseTs(s) {
    if (!s) return null;
    if (typeof s === 'number') return s;
    const d = new Date(String(s));
    if (!isNaN(d.getTime())) return d.getTime();
    // KiotViet sometimes returns "DD/MM/YYYY HH:mm:ss"
    const m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[\sT]?(\d{0,2}):?(\d{0,2}):?(\d{0,2})/);
    if (m) {
      return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)).getTime();
    }
    return null;
  }

  /** Public entry: gọi setInterval với chu kỳ này từ index.html boot. */
  let _timer = null;
  function startPolling(app) {
    stopPolling();
    const cfg = getConfig();
    if (!cfg.enabled) return;
    const mins = Math.max(1, parseInt(cfg.poll_interval_min || 5, 10));

    // Run once immediately, then schedule
    pollOnce(app).then((res) => {
      if (res && res.imported > 0) _notifyApp(app, res);
    });
    _timer = setInterval(async () => {
      const res = await pollOnce(app);
      if (res && res.imported > 0) _notifyApp(app, res);
    }, mins * 60 * 1000);
  }

  function stopPolling() {
    if (_timer) { clearInterval(_timer); _timer = null; }
  }

  function _notifyApp(app, result) {
    if (!app) return;
    try {
      if (app.showToast) app.showToast(`📥 KiotViet: +${result.imported} đơn mới`, 'success');
      if (app.refreshDashboard) app.refreshDashboard();
      if (app.loadOrders) app.loadOrders();
      if (app.loadKitchen) app.loadKitchen();
    } catch (e) { console.warn('[kiotviet-pull] notify fail', e); }
  }

  global.KiotVietPull = {
    getConfig, setConfig,
    getLastTs, setLastTs,
    readLog,
    testConnection,
    pollOnce,
    startPolling, stopPolling,
  };
})(window);
