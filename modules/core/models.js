// ============================================================================
// models.js — Data access layer over DB
// ============================================================================
// PATCH 2026-06-09 CEO_THUAN: deductInventoryForOrderItems now respects
// variant_filter ("M"/"L"/null) so per-size recipes deduct correct quantities.
// Was V1 'ignore variant_filter' → over-deducted both M+L sizes simultaneously.
// ============================================================================
(function (global) {
  'use strict';

  const Models = {
    // ---- Branch / Shop ----
    getShop() {
      const rows = DB.exec("SELECT * FROM branches ORDER BY id LIMIT 1");
      return rows[0] || null;
    },
    updateShop(data) {
      DB.run(
        `UPDATE branches SET name=?, address=?, phone=?, logo_data_url=?, slogan=?, tax_rate=?, round_to=?, license_to=? WHERE id=?`,
        [data.name, data.address, data.phone, data.logo_data_url || null, data.slogan || '',
         data.tax_rate || 0, data.round_to || 1000, data.license_to || '', data.id]
      );
    },
    updatePayment(branchId, payment) {
      DB.run(
        `UPDATE branches SET payment_bank_bin=?, payment_account_no=?, payment_account_name=?, payment_qr_enabled=? WHERE id=?`,
        [payment.bank_bin || null, payment.account_no || null, payment.account_name || null,
         payment.qr_enabled ? 1 : 0, branchId]
      );
    },
    updateSepayConfig(branchId, cfg) {
      // api_key stored as XOR-obfuscated base64
      const obf = cfg.api_key ? Sepay.xorObfuscate(cfg.api_key) : null;
      DB.run(
        `UPDATE branches SET sepay_api_key=?, sepay_enabled=?, sepay_polling_seconds=? WHERE id=?`,
        [obf, cfg.enabled ? 1 : 0, cfg.polling_seconds || 5, branchId]
      );
    },
    getSepayApiKey(shop) {
      if (!shop || !shop.sepay_api_key) return '';
      return Sepay.xorDeobfuscate(shop.sepay_api_key);
    },
    updateTelegramPerShop(branchId, cfg) {
      DB.run(
        `UPDATE branches SET telegram_bot_token=?, telegram_chat_id=?, telegram_notify_enabled=? WHERE id=?`,
        [cfg.bot_token || null, cfg.chat_id || null, cfg.enabled ? 1 : 0, branchId]
      );
    },
    /** Orders waiting for Sepay payment in last N minutes */
    listOrdersWaitingPayment(branchId, withinMinutes) {
      const since = Date.now() - (withinMinutes || 10) * 60000;
      return DB.exec(`
        SELECT id, order_no, total, table_number, order_source, created_at
        FROM orders
        WHERE branch_id=? AND status='pending'
          AND order_source='self_order'
          AND (sepay_tx_id IS NULL OR sepay_tx_id='')
          AND created_at >= ?
        ORDER BY created_at DESC
        LIMIT 50
      `, [branchId, since]);
    },
    markOrderPaidBySepay(orderId, sepayTxId) {
      // payment_method='qr' (in CHECK); Sepay distinguishable via sepay_tx_id IS NOT NULL
      DB.run(
        `UPDATE orders SET status='paid', payment_method='qr', sepay_tx_id=?, paid_at=?, sync_status='pending'
         WHERE id=? AND (sepay_tx_id IS NULL OR sepay_tx_id='')`,
        [String(sepayTxId), Date.now(), orderId]
      );
      DB.persist();
    },
    getOrderById(orderId) {
      const rows = DB.exec("SELECT * FROM orders WHERE id=?", [orderId]);
      return rows[0] || null;
    },

    // ---- Users ----
    listUsers(branchId) {
      return DB.exec("SELECT id, name, role, active FROM users WHERE branch_id=? AND active=1 ORDER BY role DESC, name", [branchId]);
    },
    async authPin(pin, branchId) {
      const hash = await Utils.hashPin(pin, branchId);
      const rows = DB.exec("SELECT id, name, role FROM users WHERE branch_id=? AND pin_hash=? AND active=1",
        [branchId, hash]);
      return rows[0] || null;
    },
    async createUser({ branch_id, name, pin, role }) {
      const hash = await Utils.hashPin(pin, branch_id);
      DB.run("INSERT INTO users (branch_id, name, pin_hash, role, active, created_at) VALUES (?,?,?,?,1,?)",
        [branch_id, name, hash, role, Date.now()]);
      return DB.lastInsertId();
    },
    async changePin(userId, newPin, branchId) {
      const hash = await Utils.hashPin(newPin, branchId);
      DB.run("UPDATE users SET pin_hash=? WHERE id=?", [hash, userId]);
    },
    deactivateUser(userId) {
      DB.run("UPDATE users SET active=0 WHERE id=?", [userId]);
    },

    // ---- Categories / Products / Variants ----
    listCategories(branchId) {
      return DB.exec("SELECT * FROM categories WHERE branch_id=? ORDER BY sort_order, name", [branchId]);
    },
    listProducts(branchId) {
      return DB.exec("SELECT * FROM products WHERE branch_id=? AND active=1 ORDER BY sort_order, name", [branchId]);
    },
    listProductsByCategory(branchId, categoryId) {
      return DB.exec("SELECT * FROM products WHERE branch_id=? AND active=1 AND category_id=? ORDER BY sort_order, name",
        [branchId, categoryId]);
    },
    getVariantGroupsForProduct(productId) {
      return DB.exec(`
        SELECT vg.id, vg.name, vg.selection_type, vg.required
        FROM product_variant_groups pvg
        JOIN variant_groups vg ON vg.id = pvg.group_id
        WHERE pvg.product_id=?
        ORDER BY vg.id
      `, [productId]);
    },
    getVariantsForGroup(groupId) {
      return DB.exec("SELECT id, name, price_modifier FROM variants WHERE group_id=? ORDER BY id", [groupId]);
    },
    upsertProduct(p) {
      if (p.id) {
        DB.run(`UPDATE products SET category_id=?, name=?, base_price=?, icon=?, active=?, sort_order=? WHERE id=?`,
          [p.category_id, p.name, p.base_price, p.icon || '', p.active ? 1 : 0, p.sort_order || 0, p.id]);
        return p.id;
      }
      DB.run(`INSERT INTO products (branch_id, category_id, name, base_price, icon, active, sort_order, created_at) VALUES (?,?,?,?,?,?,?,?)`,
        [p.branch_id, p.category_id, p.name, p.base_price, p.icon || '', p.active ? 1 : 0, p.sort_order || 0, Date.now()]);
      return DB.lastInsertId();
    },

    // ---- Orders ----
    nextOrderSequenceToday(branchId) {
      const start = Utils.startOfDay(new Date());
      const end = Utils.endOfDay(new Date());
      const rows = DB.exec("SELECT COUNT(*) AS n FROM orders WHERE branch_id=? AND created_at BETWEEN ? AND ?",
        [branchId, start, end]);
      return (rows[0] ? rows[0].n : 0) + 1;
    },
    createOrder(order, items) {
      const now = Date.now();
      const seq = Models.nextOrderSequenceToday(order.branch_id);
      const orderNo = Utils.nextOrderNo(seq);
      DB.run(
        `INSERT INTO orders (branch_id, user_id, order_no, status, subtotal, tax, discount, total, payment_method, cash_received, change_given, note, created_at, paid_at, sync_status, table_number, order_source, kitchen_status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'pending', ?, ?, ?)`,
        [order.branch_id, order.user_id, orderNo, order.status || 'paid',
         order.subtotal, order.tax || 0, order.discount || 0, order.total,
         order.payment_method, order.cash_received || null, order.change_given || null,
         order.note || '', now, order.status === 'paid' ? now : null,
         order.table_number || null, order.order_source || 'pos', order.kitchen_status || 'pending']
      );
      const orderId = DB.lastInsertId();
      items.forEach((it) => {
        DB.run(`INSERT INTO order_items (order_id, product_id, product_name, variants_json, unit_price, qty, line_total)
                VALUES (?,?,?,?,?,?,?)`,
          [orderId, it.product_id, it.product_name, JSON.stringify(it.variants || []),
           it.unit_price, it.qty, it.line_total]);
      });
      // Auto-deduct inventory from recipes
      let deductions = [];
      try {
        deductions = Models.deductInventoryForOrderItems(order.branch_id, orderId, items, 'auto');
      } catch (e) {
        console.warn('[deduct] order', orderId, e.message);
      }
      DB.persist();
      return { id: orderId, order_no: orderNo, deductions };
    },
    listRecentOrders(branchId, limit) {
      return DB.exec("SELECT * FROM orders WHERE branch_id=? ORDER BY created_at DESC LIMIT ?", [branchId, limit || 20]);
    },
    getOrderItems(orderId) {
      return DB.exec("SELECT * FROM order_items WHERE order_id=?", [orderId]);
    },
    voidOrder(orderId, reason) {
      // 2026-06-10 PRODUCTION FIX (CEO_THUAN audit): huỷ đơn phải HOÀN KHO.
      // Bản cũ chỉ đổi status → nguyên liệu đã trừ mất luôn, tồn kho sai dần.
      // Idempotent: chỉ hoàn nếu đơn chưa cancelled (tránh double-restore).
      const cur = DB.exec("SELECT status FROM orders WHERE id=?", [orderId]);
      if (!cur.length || cur[0].status === 'cancelled') return false;
      // Hoàn kho: đảo các giao dịch 'sale' đã ghi cho đơn này
      const sales = DB.exec(
        "SELECT branch_id, ingredient_id, qty FROM inventory_transactions WHERE ref_type='order' AND ref_id=? AND type='sale'",
        [orderId]);
      sales.forEach((s) => {
        const restoreQty = -s.qty; // sale lưu qty âm → hoàn = dương
        DB.run(`INSERT INTO inventory_transactions
                (branch_id, ingredient_id, type, qty, unit_cost, total_cost, ref_type, ref_id, note, user_id, created_at, sync_status)
                VALUES (?,?,?,?,0,0,'order',?,?,NULL,?, 'pending')`,
          [s.branch_id, s.ingredient_id, 'adjustment', restoreQty, orderId,
           'Hoàn kho do huỷ đơn #' + orderId, Date.now()]);
        DB.run("UPDATE ingredients SET stock_current = stock_current + ? WHERE id=?",
          [restoreQty, s.ingredient_id]);
      });
      DB.run("UPDATE orders SET status='cancelled', note=COALESCE(note,'') || ?, sync_status='pending' WHERE id=?",
        [' [HUỶ: ' + (reason || '') + ']', orderId]);
      DB.persist();
      return true;
    },

    // ---- Kitchen workflow (V2.3) ----
    listKitchenOrders(branchId, limit) {
      return DB.exec(`
        SELECT o.*, u.name AS assigned_name
        FROM orders o LEFT JOIN users u ON u.id = o.assigned_user_id
        WHERE o.branch_id=? AND o.status IN ('paid','pending')
          AND (o.kitchen_status IS NULL OR o.kitchen_status != 'served')
        ORDER BY o.created_at DESC
        LIMIT ?
      `, [branchId, limit || 50]);
    },
    listKitchenOrdersByStatus(branchId, status) {
      // Empty string / null → 'pending' (initial)
      if (status === 'pending') {
        return DB.exec(`
          SELECT o.*, u.name AS assigned_name
          FROM orders o LEFT JOIN users u ON u.id = o.assigned_user_id
          WHERE o.branch_id=? AND o.status IN ('paid','pending')
            AND (o.kitchen_status IS NULL OR o.kitchen_status = 'pending')
          ORDER BY o.created_at ASC
        `, [branchId]);
      }
      return DB.exec(`
        SELECT o.*, u.name AS assigned_name
        FROM orders o LEFT JOIN users u ON u.id = o.assigned_user_id
        WHERE o.branch_id=? AND o.kitchen_status=?
        ORDER BY o.created_at ASC
      `, [branchId, status]);
    },
    updateKitchenStatus(orderId, status, userId) {
      const now = Date.now();
      let extra = '';
      const args = [status, orderId];
      if (status === 'preparing') {
        extra = ', kitchen_started_at=?, assigned_user_id=COALESCE(assigned_user_id, ?)';
        args.splice(1, 0, now, userId || null);
      } else if (status === 'ready') {
        extra = ', kitchen_ready_at=?';
        args.splice(1, 0, now);
      }
      DB.run(`UPDATE orders SET kitchen_status=?${extra}, sync_status='pending' WHERE id=?`, args);
      DB.persist();
    },
    assignOrder(orderId, userId) {
      DB.run("UPDATE orders SET assigned_user_id=?, sync_status='pending' WHERE id=?", [userId, orderId]);
      DB.persist();
    },
    markOrderPaid(orderId, method) {
      DB.run(`UPDATE orders SET status='paid', payment_method=?, paid_at=?, sync_status='pending' WHERE id=?`,
        [method || 'transfer', Date.now(), orderId]);
      DB.persist();
    },
    countNewKitchenSince(branchId, sinceTs) {
      const r = DB.exec(`SELECT COUNT(*) AS n FROM orders
        WHERE branch_id=? AND created_at > ?
          AND (kitchen_status IS NULL OR kitchen_status='pending')`, [branchId, sinceTs]);
      return r[0] ? r[0].n : 0;
    },

    // ---- Reports ----
    dailyRevenue(branchId, date) {
      const start = Utils.startOfDay(date);
      const end = Utils.endOfDay(date);
      const rows = DB.exec(`
        SELECT
          COUNT(*) AS orders,
          COALESCE(SUM(total),0) AS revenue,
          COALESCE(SUM(CASE WHEN payment_method='cash' THEN total ELSE 0 END),0) AS cash,
          COALESCE(SUM(CASE WHEN payment_method='qr'   THEN total ELSE 0 END),0) AS qr,
          COALESCE(SUM(CASE WHEN payment_method='card' THEN total ELSE 0 END),0) AS card,
          COALESCE(SUM(CASE WHEN payment_method='transfer' THEN total ELSE 0 END),0) AS transfer
        FROM orders
        WHERE branch_id=? AND status='paid' AND created_at BETWEEN ? AND ?
      `, [branchId, start, end]);
      return rows[0] || { orders: 0, revenue: 0, cash: 0, qr: 0, card: 0, transfer: 0 };
    },
    bestSellers(branchId, fromTs, toTs, limit) {
      return DB.exec(`
        SELECT oi.product_name, SUM(oi.qty) AS qty, SUM(oi.line_total) AS revenue
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE o.branch_id=? AND o.status='paid' AND o.created_at BETWEEN ? AND ?
        GROUP BY oi.product_name
        ORDER BY qty DESC
        LIMIT ?
      `, [branchId, fromTs, toTs, limit || 10]);
    },
    rangeRevenue(branchId, fromTs, toTs) {
      const rows = DB.exec(`
        SELECT
          COUNT(*) AS orders,
          COALESCE(SUM(total),0) AS revenue
        FROM orders
        WHERE branch_id=? AND status='paid' AND created_at BETWEEN ? AND ?
      `, [branchId, fromTs, toTs]);
      return rows[0] || { orders: 0, revenue: 0 };
    },

    // ---- Ingredients / Inventory ----
    listIngredients(branchId) {
      return DB.exec("SELECT * FROM ingredients WHERE branch_id=? AND active=1 ORDER BY name", [branchId]);
    },
    addInventoryTx(tx) {
      DB.run(`INSERT INTO inventory_transactions
              (branch_id, ingredient_id, type, qty, unit_cost, total_cost, ref_type, ref_id, note, user_id, created_at, sync_status)
              VALUES (?,?,?,?,?,?,?,?,?,?,?, 'pending')`,
        [tx.branch_id, tx.ingredient_id, tx.type, tx.qty, tx.unit_cost || 0,
         tx.total_cost || 0, tx.ref_type || 'manual', tx.ref_id || null,
         tx.note || '', tx.user_id || null, Date.now()]);
      // Update stock
      DB.run("UPDATE ingredients SET stock_current = stock_current + ? WHERE id=?",
        [tx.qty, tx.ingredient_id]);
      DB.persist();
    },
    lowStockAlerts(branchId) {
      return DB.exec("SELECT id, name, unit, stock_current, stock_min FROM ingredients WHERE branch_id=? AND active=1 AND stock_current < stock_min", [branchId]);
    },

    // ---- Dashboard analytics ----
    yesterdayStats(branchId) {
      const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
      return Models.dailyRevenue(branchId, yesterday);
    },
    daysAgoStats(branchId, daysAgo) {
      const d = new Date(); d.setDate(d.getDate() - daysAgo);
      return Models.dailyRevenue(branchId, d);
    },
    revenueLastNDays(branchId, n) {
      const end = Utils.endOfDay(new Date());
      const start = Utils.startOfDay(new Date(Date.now() - (n - 1) * 86400000));
      return Models.rangeRevenue(branchId, start, end);
    },
    ingredientCostLastNDays(branchId, n) {
      const start = Utils.startOfDay(new Date(Date.now() - (n - 1) * 86400000));
      const end = Utils.endOfDay(new Date());
      const rows = DB.exec(`
        SELECT COALESCE(SUM(total_cost),0) AS cost
        FROM inventory_transactions
        WHERE branch_id=? AND type='purchase' AND created_at BETWEEN ? AND ?
      `, [branchId, start, end]);
      return rows[0] ? rows[0].cost : 0;
    },
    grossProfitLastNDays(branchId, n) {
      const rev = Models.revenueLastNDays(branchId, n).revenue;
      const cost = Models.ingredientCostLastNDays(branchId, n);
      return { revenue: rev, cost, gross: rev - cost, margin_pct: rev ? Math.round((rev - cost) * 100 / rev) : 0 };
    },
    dailyRevenueSeries(branchId, n) {
      // Returns array of {date_label, revenue, orders} for last n days
      const out = [];
      for (let i = n - 1; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const stats = Models.dailyRevenue(branchId, d);
        const label = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
        out.push({ date_label: label, revenue: stats.revenue, orders: stats.orders });
      }
      return out;
    },
    lowStockWithRunRate(branchId, daysToAnalyze) {
      // For each low-stock ingredient, calc daily burn rate from last N days
      const lows = Models.lowStockAlerts(branchId);
      const start = Utils.startOfDay(new Date(Date.now() - daysToAnalyze * 86400000));
      const end = Utils.endOfDay(new Date());
      return lows.map((i) => {
        const rows = DB.exec(`
          SELECT COALESCE(SUM(ABS(qty)),0) AS used
          FROM inventory_transactions
          WHERE branch_id=? AND ingredient_id=? AND type IN ('sale','waste') AND created_at BETWEEN ? AND ?
        `, [branchId, i.id, start, end]);
        const used = rows[0] ? rows[0].used : 0;
        const burn_per_day = used / Math.max(1, daysToAnalyze);
        const days_left = burn_per_day > 0 ? Math.floor(i.stock_current / burn_per_day) : null;
        return { ...i, burn_per_day: Math.round(burn_per_day * 100) / 100, days_left };
      });
    },
    detectAnomalies(branchId) {
      // V1: simple heuristics. V2 ML.
      const anomalies = [];
      const start = Utils.startOfDay(new Date(Date.now() - 7 * 86400000));
      const end = Utils.endOfDay(new Date());
      // 1. Void rate > 10% last 7 days
      const r = DB.exec(`
        SELECT
          SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END) AS voids,
          COUNT(*) AS total
        FROM orders WHERE branch_id=? AND created_at BETWEEN ? AND ?
      `, [branchId, start, end])[0] || { voids: 0, total: 0 };
      if (r.total > 0 && r.voids * 100 / r.total > 10) {
        anomalies.push({
          level: 'high',
          icon: '⚠',
          title: 'Tỷ lệ huỷ đơn cao bất thường',
          detail: `${r.voids}/${r.total} đơn huỷ (${Math.round(r.voids*100/r.total)}%) trong 7 ngày`,
        });
      }
      // 2. Day revenue drop > 30% vs previous day average
      const today = Models.dailyRevenue(branchId, new Date()).revenue;
      const last7 = Models.revenueLastNDays(branchId, 7).revenue;
      const avg = last7 / 7;
      if (avg > 0 && today < avg * 0.7 && new Date().getHours() > 16) {
        anomalies.push({
          level: 'medium',
          icon: '📉',
          title: 'Doanh thu hôm nay thấp',
          detail: `Hôm nay ${Utils.formatVND(today)} vs TB 7 ngày ${Utils.formatVND(Math.round(avg))}`,
        });
      }
      // 3. Cash discrepancy: closing_cash != opening_cash + total_sales (if shifts used)
      const shifts = DB.exec(`
        SELECT id, opening_cash, closing_cash, total_sales
        FROM shifts WHERE branch_id=? AND ended_at IS NOT NULL
        ORDER BY ended_at DESC LIMIT 5
      `, [branchId]);
      shifts.forEach((s) => {
        const expected = (s.opening_cash || 0) + (s.total_sales || 0);
        const diff = Math.abs((s.closing_cash || 0) - expected);
        if (diff > 50000) {
          anomalies.push({
            level: 'medium',
            icon: '💵',
            title: `Lệch tiền ca #${s.id}`,
            detail: `Chênh ${Utils.formatVND(diff)} so với dự kiến`,
          });
        }
      });
      return anomalies;
    },

    // ---- Recipe CRUD ----
    listRecipesForProduct(productId) {
      return DB.exec(`
        SELECT r.product_id, r.ingredient_id, r.qty_per_unit, r.variant_filter,
               i.name AS ingredient_name, i.unit, i.cost_per_unit, i.stock_current, i.stock_min
        FROM recipes r
        JOIN ingredients i ON i.id = r.ingredient_id
        WHERE r.product_id = ?
        ORDER BY i.name
      `, [productId]);
    },
    upsertRecipe(productId, ingredientId, qtyPerUnit, variantFilter) {
      // SQLite UPSERT via INSERT OR REPLACE on PK (product_id, ingredient_id, variant_filter)
      // Note: variant_filter NULL — SQLite distinct treats NULL specially. Normalize NULL → ''.
      const vf = variantFilter || null;
      DB.run(
        `INSERT OR REPLACE INTO recipes (product_id, ingredient_id, qty_per_unit, variant_filter) VALUES (?,?,?,?)`,
        [productId, ingredientId, qtyPerUnit, vf]
      );
      DB.persist();
    },
    removeRecipe(productId, ingredientId, variantFilter) {
      if (variantFilter) {
        DB.run(`DELETE FROM recipes WHERE product_id=? AND ingredient_id=? AND variant_filter=?`,
          [productId, ingredientId, variantFilter]);
      } else {
        DB.run(`DELETE FROM recipes WHERE product_id=? AND ingredient_id=? AND variant_filter IS NULL`,
          [productId, ingredientId]);
      }
      DB.persist();
    },
    /** Aggregate deductions by ingredient — for UI summary toast/modal */
    aggregateDeductions(deductions) {
      const map = new Map();
      (deductions || []).forEach((d) => {
        if (!map.has(d.ingredient_id)) map.set(d.ingredient_id, {
          ingredient_id: d.ingredient_id, ingredient_name: d.ingredient_name,
          unit: d.unit, qty: 0, products: new Set(),
        });
        const agg = map.get(d.ingredient_id);
        agg.qty += d.qty;
        agg.products.add(d.product_name);
      });
      return Array.from(map.values()).map((a) => ({
        ingredient_id: a.ingredient_id,
        ingredient_name: a.ingredient_name,
        unit: a.unit,
        qty: Math.round(a.qty * 100) / 100,
        products: Array.from(a.products),
      }));
    },
    /** Check which of given ingredient IDs are now below stock_min */
    lowStockAlertsAfter(branchId, ingredientIds) {
      if (!ingredientIds || !ingredientIds.length) return [];
      const placeholders = ingredientIds.map(() => '?').join(',');
      return DB.exec(
        `SELECT id, name, unit, stock_current, stock_min FROM ingredients
         WHERE branch_id=? AND active=1 AND stock_current < stock_min AND id IN (${placeholders})`,
        [branchId, ...ingredientIds]
      );
    },
    recipeCostForProduct(productId) {
      // Returns { total_cost, lines: [{ingredient_name, qty, cost}] }
      const rows = Models.listRecipesForProduct(productId);
      const lines = rows.map((r) => ({
        ingredient_name: r.ingredient_name,
        qty: r.qty_per_unit,
        unit: r.unit,
        unit_cost: r.cost_per_unit,
        line_cost: Math.round((r.qty_per_unit || 0) * (r.cost_per_unit || 0)),
      }));
      const total = lines.reduce((s, l) => s + l.line_cost, 0);
      return { total_cost: total, lines };
    },

    // ---- Inventory tx batch (bulk purchase) ----
    addInventoryTxBatch(txs) {
      // txs: array of { branch_id, ingredient_id, type, qty, unit_cost, total_cost, note, supplier, user_id }
      const created = [];
      txs.forEach((tx) => {
        const ts = Date.now();
        DB.run(`INSERT INTO inventory_transactions
                (branch_id, ingredient_id, type, qty, unit_cost, total_cost, ref_type, ref_id, note, user_id, created_at, sync_status)
                VALUES (?,?,?,?,?,?,?,?,?,?,?, 'pending')`,
          [tx.branch_id, tx.ingredient_id, tx.type, tx.qty, tx.unit_cost || 0,
           tx.total_cost || 0, tx.ref_type || 'manual', tx.ref_id || null,
           (tx.note || '') + (tx.supplier ? ' [NCC: ' + tx.supplier + ']' : ''),
           tx.user_id || null, ts]);
        DB.run("UPDATE ingredients SET stock_current = stock_current + ? WHERE id=?",
          [tx.qty, tx.ingredient_id]);
        if (tx.supplier) {
          DB.run("UPDATE ingredients SET supplier=? WHERE id=? AND (supplier IS NULL OR supplier='')",
            [tx.supplier, tx.ingredient_id]);
        }
        created.push({ ingredient_id: tx.ingredient_id, qty: tx.qty });
      });
      DB.persist();
      return created;
    },
    listSuppliers(branchId) {
      const rows = DB.exec("SELECT DISTINCT supplier FROM ingredients WHERE branch_id=? AND supplier IS NOT NULL AND supplier!='' ORDER BY supplier", [branchId]);
      return rows.map((r) => r.supplier);
    },

    // ---- Recipe inventory deduction ----
    deductInventoryForOrderItems(branchId, orderId, items, mode) {
      // mode: 'auto' | 'preview' (preview returns list without writing)
      // PATCH 2026-06-09 CEO_THUAN: respect variant_filter ("M"/"L"/null) so per-size recipes
      // deduct correct quantities. Was V1 'ignore variant_filter' → over-deducted both sizes.
      const deductions = [];
      items.forEach((it) => {
        // Parse size code from variants_json snapshot. Accept multiple shapes:
        //   { size: "M" }                                  ← canonical
        //   { size: "M (500ml)" }                          ← name string with code prefix
        //   { size_name: "M (500ml)" } / { variant: "M" } ← legacy
        // 2026-06-10 PRODUCTION FIX (CEO_THUAN audit): cart lưu variants_json dạng
        // ARRAY [{group_id, id, name:'M', price_modifier}] (createOrder stringify it.variants).
        // Bản cũ chỉ đọc object {size:...} → orderSize luôn null → recipe theo size
        // KHÔNG BAO GIỜ trừ kho. Nay hỗ trợ cả 2 shape: array (canonical) + object (legacy).
        let orderSize = null;
        try {
          if (it.variants_json || it.variants) {
            const src = it.variants_json != null ? it.variants_json : it.variants;
            const v = (typeof src === 'string') ? JSON.parse(src) : src;
            let raw = null;
            if (Array.isArray(v)) {
              // Array shape: tìm variant có name bắt đầu bằng size code (M/L/S/XL...)
              for (let k = 0; k < v.length; k++) {
                const nm = v[k] && v[k].name ? String(v[k].name).trim() : '';
                if (/^(XXL|XL|S|M|L)\b/i.test(nm)) { raw = nm; break; }
              }
              // Fallback: variant đầu tiên có name
              if (!raw && v.length && v[0] && v[0].name) raw = String(v[0].name);
            } else if (v && typeof v === 'object') {
              raw = v.size || v.size_name || v.variant || v.variant_name || null;
            }
            if (raw) {
              // Extract leading letter token (M/L/S) so "M (500ml)" → "M"
              const m = String(raw).trim().match(/^[A-Za-z]+/);
              orderSize = m ? m[0].toUpperCase() : String(raw).toUpperCase();
            }
          }
        } catch (e) { /* malformed snapshot — treat as no size filter */ }
        const recipes = DB.exec(`
          SELECT r.ingredient_id, r.qty_per_unit, r.variant_filter, i.name, i.unit
          FROM recipes r JOIN ingredients i ON i.id = r.ingredient_id
          WHERE r.product_id=?
        `, [it.product_id]);
        recipes.forEach((rec) => {
          // Filter rules:
          //   recipe.variant_filter IS NULL → applies to all sizes (e.g. shared base ingredients)
          //   recipe.variant_filter matches order size → applies
          //   otherwise → skip
          if (rec.variant_filter !== null && rec.variant_filter !== undefined && rec.variant_filter !== '') {
            if (String(rec.variant_filter).toUpperCase() !== orderSize) return; // skip non-matching size
          }
          const qty = rec.qty_per_unit * (it.qty || 1);
          deductions.push({
            ingredient_id: rec.ingredient_id,
            ingredient_name: rec.name,
            unit: rec.unit,
            qty,
            product_name: it.product_name,
          });
        });
      });
      if (mode !== 'preview') {
        deductions.forEach((d) => {
          DB.run(`INSERT INTO inventory_transactions
                  (branch_id, ingredient_id, type, qty, unit_cost, total_cost, ref_type, ref_id, note, user_id, created_at, sync_status)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?, 'pending')`,
            [branchId, d.ingredient_id, 'sale', -d.qty, 0, 0, 'order', orderId,
             'Auto-trừ từ ' + d.product_name, null, Date.now()]);
          DB.run("UPDATE ingredients SET stock_current = stock_current - ? WHERE id=?",
            [d.qty, d.ingredient_id]);
        });
        DB.persist();
      }
      return deductions;
    },

    // ---- CSV Import ----
    insertImportedOrder(branchId, order, items) {
      DB.run(
        `INSERT INTO orders (branch_id, user_id, order_no, status, subtotal, tax, discount, total, payment_method, cash_received, change_given, note, created_at, paid_at, sync_status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'pending')`,
        [branchId, null, order.order_no || ('IMP-' + Date.now()), 'paid',
         order.subtotal || order.total, order.tax || 0, order.discount || 0, order.total,
         order.payment_method || 'cash', null, null,
         order.note || ('Import từ ' + (order.source || 'CSV')),
         order.created_at, order.created_at]
      );
      const orderId = DB.lastInsertId();
      (items || []).forEach((it) => {
        DB.run(`INSERT INTO order_items (order_id, product_id, product_name, variants_json, unit_price, qty, line_total)
                VALUES (?,?,?,?,?,?,?)`,
          [orderId, it.product_id || null, it.product_name, JSON.stringify(it.variants || []),
           it.unit_price, it.qty, it.line_total]);
      });
      return orderId;
    },
    findProductByName(branchId, name) {
      const rows = DB.exec("SELECT id, base_price FROM products WHERE branch_id=? AND name=? AND active=1 LIMIT 1", [branchId, name]);
      return rows[0] || null;
    },

    // ---- Sync ----
    pendingSyncOrders(branchId, limit) {
      return DB.exec("SELECT * FROM orders WHERE branch_id=? AND sync_status='pending' ORDER BY created_at LIMIT ?",
        [branchId, limit || 50]);
    },
    markOrderSynced(orderId) {
      DB.run("UPDATE orders SET sync_status='synced' WHERE id=?", [orderId]);
    },
    markOrderSyncFailed(orderId) {
      DB.run("UPDATE orders SET sync_status='failed' WHERE id=?", [orderId]);
    },
    logSync(entry) {
      DB.run(`INSERT INTO sync_log (entity, entity_id, action, status, payload, error, created_at) VALUES (?,?,?,?,?,?,?)`,
        [entry.entity, entry.entity_id || null, entry.action, entry.status,
         entry.payload ? JSON.stringify(entry.payload) : null,
         entry.error || null, Date.now()]);
    },
  };

  global.Models = Models;
})(window);
