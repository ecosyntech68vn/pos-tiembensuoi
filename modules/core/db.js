// ============================================================================
// db.js — SQLite (sql.js WASM) lifecycle + IndexedDB persistence
// Offline-first: DB lives in browser. Persists to IndexedDB on every commit.
// ============================================================================
// PATCH 2026-06-09: Fix BUG #1 — variant_filter no longer hardcoded NULL.
//                   Now reads r.variant_filter from seed JSON so per-size
//                   recipes (M/L) work correctly. — CEO_THUAN audit fix.
// ============================================================================
(function (global) {
  'use strict';

  const DB_NAME = 'ecosyntech-pos-tbs';  // 2026-06-09: switched to fresh DB name (old IDB lock workaround)
  const STORE = 'sqlite';
  const KEY = 'main.db';
  // Auto-detect base URL from db.js script location (works from any HTML, any folder)
  const BASE_PATH = (function () {
    try {
      const scripts = document.getElementsByTagName('script');
      for (let i = 0; i < scripts.length; i++) {
        const src = scripts[i].src || '';
        if (src.indexOf('/modules/core/db.js') >= 0) {
          return new URL('../../', src).href;
        }
      }
    } catch (e) { /* ignore */ }
    return ''; // fallback: relative
  })();
  const SCHEMA_URL       = BASE_PATH + 'modules/core/db-schema.sql';
  // PATCH 2026-06-09: bypass JSON seed - load directly from 4 CSV (Tiệm Bên Suối FULL data)
  const SEED_CSV_MENU    = BASE_PATH + 'data/00_MENU.csv';
  const SEED_CSV_ING     = BASE_PATH + 'data/01_INGREDIENTS.csv';
  const SEED_CSV_REC     = BASE_PATH + 'data/02_RECIPES_BOM.csv';
  const SEED_CSV_TOP     = BASE_PATH + 'data/04_TOPPINGS.csv';

  let SQL = null;       // sql.js module
  let db = null;        // Database instance

  // ---- IndexedDB helpers ----
  function idbOpen() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  function idbGet() {
    return idbOpen().then((idb) => new Promise((resolve, reject) => {
      const tx = idb.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    }));
  }
  function idbPut(blob) {
    return idbOpen().then((idb) => new Promise((resolve, reject) => {
      const tx = idb.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(blob, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    }));
  }

  // ---- Persist (debounced) ----
  let persistTimer = null;
  function schedulePersist(ms) {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => persist().catch((e) => console.error('[db] persist', e)), ms || 200);
  }
  async function persist() {
    if (!db) return;
    const data = db.export();
    await idbPut(data);
    EventBus.emit('db:persisted', { size: data.length });
  }

  // ---- Schema + seed ----
  async function fetchText(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error('fetch ' + url + ' ' + r.status);
    return await r.text();
  }
  async function fetchJSON(url) {
    return JSON.parse(await fetchText(url));
  }

  async function applySchema() {
    const sql = await fetchText(SCHEMA_URL);
    db.exec(sql);
  }

  // ---- Migration runner ----
  function currentSchemaVersion() {
    try {
      const r = db.exec("SELECT MAX(version) AS v FROM schema_version");
      return (r[0] && r[0].values[0][0]) || 1;
    } catch (e) { return 1; }
  }
  function recordVersion(v) {
    db.run("INSERT OR IGNORE INTO schema_version (version, applied_at) VALUES (?, ?)", [v, Date.now()]);
  }
  function hasColumn(table, col) {
    try {
      const r = db.exec("PRAGMA table_info(" + table + ")");
      if (!r[0]) return false;
      return r[0].values.some(row => row[1] === col);
    } catch (e) { return false; }
  }
  function safeAlter(table, col, def) {
    if (hasColumn(table, col)) return;
    try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`); }
    catch (e) { console.warn('[migrate]', table, col, e.message); }
  }
  function runMigrations() {
    const cur = currentSchemaVersion();
    // ---- v2: kitchen workflow + payment QR ----
    if (cur < 2) {
      console.log('[migrate] v1 → v2');
      safeAlter('orders', 'table_number',         'INTEGER');
      safeAlter('orders', 'order_source',         "TEXT DEFAULT 'pos'");
      safeAlter('orders', 'assigned_user_id',     'INTEGER');
      safeAlter('orders', 'kitchen_status',       "TEXT DEFAULT 'pending'");
      safeAlter('orders', 'kitchen_started_at',   'INTEGER');
      safeAlter('orders', 'kitchen_ready_at',     'INTEGER');
      safeAlter('orders', 'payment_qr_url',       'TEXT');
      safeAlter('branches', 'payment_bank_bin',      'TEXT');
      safeAlter('branches', 'payment_account_no',    'TEXT');
      safeAlter('branches', 'payment_account_name',  'TEXT');
      safeAlter('branches', 'payment_qr_enabled',    'INTEGER DEFAULT 0');
      recordVersion(2);
    }
    // ---- v3: Sepay auto-confirm + Telegram per-shop ----
    if (cur < 3) {
      console.log('[migrate] v2 → v3');
      safeAlter('orders',   'sepay_tx_id',              'TEXT');
      safeAlter('orders',   'payment_expired_at',       'INTEGER');
      safeAlter('branches', 'sepay_api_key',            'TEXT');
      safeAlter('branches', 'sepay_enabled',            'INTEGER DEFAULT 0');
      safeAlter('branches', 'sepay_polling_seconds',    'INTEGER DEFAULT 5');
      safeAlter('branches', 'telegram_bot_token',       'TEXT');
      safeAlter('branches', 'telegram_chat_id',         'TEXT');
      safeAlter('branches', 'telegram_notify_enabled',  'INTEGER DEFAULT 0');
      recordVersion(3);
    }
  }

  async function seedIfEmpty() {
    const r = db.exec("SELECT COUNT(*) AS n FROM branches");
    const n = r[0] ? r[0].values[0][0] : 0;
    if (n > 0) return false;

    const now = Date.now();
    // Default branch (white-label, user edits in settings)
    db.run("INSERT INTO branches (name, address, phone, tax_rate, round_to, license_to, created_at) VALUES (?,?,?,?,?,?,?)",
      ['Quán cafe của tôi', '', '', 0, 1000, '', now]);
    const branchId = db.exec("SELECT last_insert_rowid()")[0].values[0][0];

    // Default owner PIN 1234 — user MUST change
    const ownerPin = await Utils.hashPin('1234', branchId);
    db.run("INSERT INTO users (branch_id, name, pin_hash, role, active, created_at) VALUES (?,?,?,?,1,?)",
      [branchId, 'Chủ quán', ownerPin, 'owner', now]);
    const staffPin = await Utils.hashPin('5678', branchId);
    db.run("INSERT INTO users (branch_id, name, pin_hash, role, active, created_at) VALUES (?,?,?,?,1,?)",
      [branchId, 'Nhân viên 1', staffPin, 'staff', now]);

    // PATCH 2026-06-09: Load FULL Tiệm Bên Suối data from 4 CSV files
    // (Bypass JSON seed — CSV serves as single source of truth from /data/ folder)
    try {
      const parseCSV = (text) => {
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        const hdr = lines[0].split(',').map(s => s.trim());
        return lines.slice(1).map(line => {
          const cells = line.split(',');
          const obj = {};
          hdr.forEach((h, i) => obj[h] = cells[i] !== undefined ? cells[i].trim() : '');
          return obj;
        });
      };
      const [menuText, ingText, recText, topText] = await Promise.all([
        fetchText(SEED_CSV_MENU), fetchText(SEED_CSV_ING), fetchText(SEED_CSV_REC), fetchText(SEED_CSV_TOP)
      ]);
      const menuRows = parseCSV(menuText);
      const ingRows  = parseCSV(ingText);
      const recRows  = parseCSV(recText);
      const topRows  = parseCSV(topText);

      // Categories (fixed map)
      const catMap = {'Trà hoa quả':1,'Trà sữa':2,'Best Seller':3,'Trà kem cheese':4,'Sữa chua':5,'Đồ đá xay':6,'Đồ uống nóng':7,'Cà phê':8,'Đồ ăn vặt':9,'Mỳ cay':10,'Topping đồ uống':11,'Topping mỳ cay':12};
      const catIcons = {1:'🍋',2:'🧋',3:'⭐',4:'🧀',5:'🥛',6:'🍧',7:'🔥',8:'☕',9:'🍟',10:'🍜',11:'➕',12:'➕'};
      Object.entries(catMap).forEach(([name, id], idx) => {
        db.run("INSERT INTO categories (id, branch_id, name, sort_order, icon) VALUES (?,?,?,?,?)",
          [id, branchId, name, idx + 1, catIcons[id] || '🍴']);
      });

      // Variant groups + variants
      db.run("INSERT INTO variant_groups (id, name, selection_type, required) VALUES (?,?,?,?)",
        [1, 'Size đồ uống', 'single', 1]);
      db.run("INSERT INTO variants (id, group_id, name, price_modifier) VALUES (?,?,?,?)", [1, 1, 'M', 0]);
      db.run("INSERT INTO variants (id, group_id, name, price_modifier) VALUES (?,?,?,?)", [2, 1, 'L', 0]);

      // Products: collapse menu by base_code (remove -M/-L suffix)
      const productMap = new Map();
      let pid = 0;
      const productList = [];
      menuRows.forEach(row => {
        if (row.status !== 'ACTIVE') return;
        const m = row.item_code.match(/^(.+?)-([ML]|S)$/);
        const baseCode = m ? m[1] : row.item_code;
        const size = m ? m[2] : null;
        let p = productMap.get(baseCode);
        if (!p) {
          pid++;
          p = { id: pid, base_code: baseCode, name: row.name_vn, category_sub: row.category_sub, sizes: {}, single_price: null };
          productMap.set(baseCode, p);
          productList.push(p);
        }
        if (size) p.sizes[size] = { price: parseInt(row.price_sell_vnd, 10) };
        else p.single_price = parseInt(row.price_sell_vnd, 10);
      });
      productList.forEach((p, idx) => {
        let bp, hv;
        if (p.sizes.M || p.sizes.L) {
          bp = p.sizes.M ? p.sizes.M.price : (p.sizes.L ? p.sizes.L.price : 0);
          hv = !!(p.sizes.M && p.sizes.L);
        } else { bp = p.single_price || 0; hv = false; }
        const fullName = '[' + p.base_code + '] ' + p.name;
        const categoryId = catMap[p.category_sub] || 9;
        db.run("INSERT INTO products (id, branch_id, category_id, name, base_price, icon, active, sort_order, created_at) VALUES (?,?,?,?,?,?,1,?,?)",
          [p.id, branchId, categoryId, fullName, bp, '', idx, now]);
        if (hv) {
          db.run("INSERT INTO product_variant_groups (product_id, group_id) VALUES (?,?)", [p.id, 1]);
        }
      });

      // Topping products
      topRows.forEach((t, idx) => {
        if (t.status !== 'ACTIVE') return;
        pid++;
        const catId = t.applies_to_category === 'Drinks' ? 11 : 12;
        db.run("INSERT INTO products (id, branch_id, category_id, name, base_price, icon, active, sort_order, created_at) VALUES (?,?,?,?,?,?,1,?,?)",
          [pid, branchId, catId, '[' + t.topping_code + '] ' + t.name_vn, parseInt(t.price_sell_vnd, 10), '', productList.length + idx, now]);
        productMap.set(t.topping_code, { id: pid, base_code: t.topping_code });
      });
      const productCodeToId = new Map();
      productMap.forEach((p, code) => productCodeToId.set(code, p.id));

      // Ingredients (108 from CSV + 11 IG-SF semi-finished)
      const ingCodeToId = new Map();
      let iid = 0;
      ingRows.forEach(row => {
        if (row.status !== 'ACTIVE') return;
        iid++;
        db.run("INSERT INTO ingredients (id, branch_id, name, unit, stock_current, stock_min, cost_per_unit, supplier, active) VALUES (?,?,?,?,?,?,?,?,1)",
          [iid, branchId, '[' + row.ingredient_code + '] ' + row.name_vn,
           (row.unit || '').replace(/[^\w]/g, '') || 'unit',
           Math.max(5000, parseInt(row.stock_min, 10) * 5 || 1000),
           parseInt(row.stock_min, 10) || 100,
           parseInt(row.unit_cost_vnd, 10) || 0,
           row.supplier || '']);
        ingCodeToId.set(row.ingredient_code, iid);
      });
      const sfDefs = [['IG-SF-001','Cốt trà nhài','ml',7,5000,1000],['IG-SF-002','Cốt hồng trà','ml',7,5000,1000],['IG-SF-003','Cốt trà ô long','ml',10,2000,500],['IG-SF-004','Đường nước pha sẵn','ml',15,10000,2000],['IG-SF-005','Cà phê pha phin','ml',100,2000,500],['IG-SF-006','Trân châu đường đen ủ','gram',110,3000,500],['IG-SF-007','Cốt trà sen','ml',30,1500,300],['IG-SF-008','Sốt mỳ cay base','ml',80,3000,500],['IG-SF-009','Kem cheese đánh sẵn','ml',180,1500,300],['IG-SF-010','Kem trứng đánh sẵn','ml',200,1000,200],['IG-SF-011','Kem xịt whipping','ml',150,1500,300]];
      sfDefs.forEach(([code, n, u, c, s, m]) => {
        iid++;
        db.run("INSERT INTO ingredients (id, branch_id, name, unit, stock_current, stock_min, cost_per_unit, supplier, active) VALUES (?,?,?,?,?,?,?,?,1)",
          [iid, branchId, '[' + code + '] ' + n, u, s, m, c, 'Tự pha sáng / mua sẵn']);
        ingCodeToId.set(code, iid);
      });

      // Recipes — apply mapping DR-TC→DR-TH, DR-MN→DR-BS
      const remap = (code) => {
        let m = code.match(/^DR-TC-(\d+)(-([ML]))?$/);
        if (m) return 'DR-TH-' + m[1] + (m[2] || '');
        m = code.match(/^DR-MN-(\d+)(-([ML]))?$/);
        if (m) return 'DR-BS-' + m[1] + (m[2] || '');
        return code;
      };
      const seenRec = new Set();
      recRows.forEach(row => {
        if (!row.item_code) return;
        const remapped = remap(row.item_code);
        const m = remapped.match(/^(.+?)-([ML])$/);
        const baseCode = m ? m[1] : remapped;
        const size = m ? m[2] : null;
        const pId = productCodeToId.get(baseCode);
        const iId = ingCodeToId.get(row.ingredient_code);
        if (!pId || !iId) return;
        const qty = parseFloat(row.qty) || 0;
        if (qty <= 0) return;
        const key = pId + '|' + iId + '|' + (size || '');
        if (seenRec.has(key)) return;
        seenRec.add(key);
        db.run("INSERT OR IGNORE INTO recipes (product_id, ingredient_id, qty_per_unit, variant_filter) VALUES (?,?,?,?)",
          [pId, iId, qty, size]);
      });
      // Topping recipes
      topRows.forEach(t => {
        if (t.status !== 'ACTIVE') return;
        const pId = productCodeToId.get(t.topping_code);
        const iId = ingCodeToId.get(t.ingredient_ref);
        if (!pId || !iId) return;
        const qty = parseFloat(t.qty_default) || 0;
        if (qty <= 0) return;
        const key = pId + '|' + iId + '|';
        if (seenRec.has(key)) return;
        seenRec.add(key);
        db.run("INSERT OR IGNORE INTO recipes (product_id, ingredient_id, qty_per_unit, variant_filter) VALUES (?,?,?,?)",
          [pId, iId, qty, null]);
      });
      console.log('[seed] FULL Tiệm Bên Suối loaded: ' + pid + ' products, ' + iid + ' ingredients, ' + seenRec.size + ' recipes');
    } catch (e) {
      console.error('[db] CSV seed failed:', e.message, e.stack);
    }

    await persist();
    return true;
  }

  // ---- Init ----
  async function init() {
    if (!global.initSqlJs) throw new Error('sql.js chưa load');
    SQL = await initSqlJs({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/${file}`,
    });

    const saved = await idbGet();
    if (saved) {
      db = new SQL.Database(new Uint8Array(saved));
      EventBus.emit('db:loaded', { fromStorage: true });
    } else {
      db = new SQL.Database();
      await applySchema();
      const seeded = await seedIfEmpty();
      EventBus.emit('db:loaded', { fromStorage: false, seeded });
    }
    // Run migrations (idempotent)
    runMigrations();
    await persist();
    global.dbInstance = db;
    return db;
  }

  // ---- Query helpers ----
  function exec(sql, params) {
    const stmt = db.prepare(sql);
    if (params) stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  }
  function run(sql, params) {
    db.run(sql, params || []);
    schedulePersist();
  }
  function lastInsertId() {
    const r = db.exec("SELECT last_insert_rowid() AS id");
    return r[0].values[0][0];
  }
  function exportBlob() {
    return db.export();
  }
  async function importBlob(uint8) {
    if (db) db.close();
    db = new SQL.Database(uint8);
    global.dbInstance = db;
    await persist();
    EventBus.emit('db:imported', {});
  }
  async function resetAll() {
    if (db) db.close();
    db = new SQL.Database();
    await applySchema();
    await seedIfEmpty();
    runMigrations();
    await persist();
    global.dbInstance = db;
    EventBus.emit('db:reset', {});
  }

  /** Re-read SQLite blob from IndexedDB (cross-tab sync after other tab persists changes) */
  async function reload() {
    const saved = await idbGet();
    if (!saved) return false;
    if (db) db.close();
    db = new SQL.Database(new Uint8Array(saved));
    global.dbInstance = db;
    EventBus.emit('db:reloaded', {});
    return true;
  }

  global.DB = { init, exec, run, lastInsertId, persist, exportBlob, importBlob, resetAll, reload };
})(window);
