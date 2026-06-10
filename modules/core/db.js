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

  // ---- Persist (debounced + robust) ----
  // 2026-06-09 PATCH: Fix race condition khi user reload nhanh sau khi save.
  // idbPut() now awaits transaction.oncomplete explicitly (Promise resolves
  // when blob FULLY written to disk, not just queued).
  let persistTimer = null;
  let persistInFlight = null;  // Promise — caller can await to ensure write done.
  const PERSIST_LOCK_KEY = 'ecosyntech-pos.persist-lock';
  const PERSIST_VER_KEY = 'ecosyntech-pos.persist-version';
  function acquireLock() {
    const lockTs = Date.now().toString();
    const existing = localStorage.getItem(PERSIST_LOCK_KEY);
    if (existing && (Date.now() - parseInt(existing, 10)) < 3000) return null;
    localStorage.setItem(PERSIST_LOCK_KEY, lockTs);
    return lockTs;
  }
  function releaseLock(lock) {
    if (lock && localStorage.getItem(PERSIST_LOCK_KEY) === lock) {
      localStorage.removeItem(PERSIST_LOCK_KEY);
    }
  }
  function getVersion() {
    return parseInt(localStorage.getItem(PERSIST_VER_KEY) || '0', 10);
  }
  function nextVersion() {
    const v = getVersion() + 1;
    localStorage.setItem(PERSIST_VER_KEY, String(v));
    return v;
  }
  function schedulePersist(ms) {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => persist().catch((e) => console.error('[db] persist', e)), ms || 200);
  }
  async function persist() {
    if (!db) return;
    if (persistInFlight) { try { await persistInFlight; } catch (e) {} }
    const lock = acquireLock();
    if (!lock) { schedulePersist(500); return; }
    try {
      const currentVer = getVersion();
      const data = db.export();
      persistInFlight = idbPut(data).finally(() => { persistInFlight = null; });
      await persistInFlight;
      nextVersion();
      EventBus.emit('db:persisted', { size: data.length });
    } finally {
      releaseLock(lock);
    }
  }
  /** Force flush — await this before navigating away to ensure DB safely written. */
  async function flush() {
    clearTimeout(persistTimer);
    await persist();
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
    // ---- Branch info: load preset if available, else default ----
    // 2026-06-09 PATCH: support window.__BRANCH_PRESET__ from config/branch-preset.<name>.js
    const preset = global.__BRANCH_PRESET__ || null;
    const branchName    = preset?.name      || 'Quán cafe của tôi';
    const branchAddress = preset?.address   || '';
    const branchPhone   = preset?.phone     || '';
    const branchSlogan  = preset?.slogan    || '';
    const branchTax     = preset?.tax_rate ?? 0;
    const branchRound   = preset?.round_to  || 1000;
    const branchLicense = preset?.license_to|| '';
    db.run("INSERT INTO branches (name, address, phone, slogan, tax_rate, round_to, license_to, created_at) VALUES (?,?,?,?,?,?,?,?)",
      [branchName, branchAddress, branchPhone, branchSlogan, branchTax, branchRound, branchLicense, now]);
    const branchId = db.exec("SELECT last_insert_rowid()")[0].values[0][0];

    // Apply payment config from preset (always SAFE — no secret key committed unless preset has it)
    if (preset?.payment) {
      const p = preset.payment;
      db.run("UPDATE branches SET payment_bank_bin=?, payment_account_no=?, payment_account_name=?, payment_qr_enabled=? WHERE id=?",
        [p.bank_bin || null, p.account_no || null, p.account_name || null, p.qr_enabled ? 1 : 0, branchId]);
    }
    if (preset?.sepay) {
      const s = preset.sepay;
      // NOTE: api_key được lưu plaintext nếu preset có. Khuyến nghị: KHÔNG commit api_key thật lên repo public.
      db.run("UPDATE branches SET sepay_api_key=?, sepay_enabled=?, sepay_polling_seconds=? WHERE id=?",
        [s.api_key || null, s.enabled ? 1 : 0, s.polling_seconds || 5, branchId]);
    }
    if (preset?.telegram) {
      const t = preset.telegram;
      db.run("UPDATE branches SET telegram_bot_token=?, telegram_chat_id=?, telegram_notify_enabled=? WHERE id=?",
        [t.bot_token || null, t.chat_id || null, t.enabled ? 1 : 0, branchId]);
    }

    // Random PIN on seed — user MUST change on first login
    const ownerPinValue = preset?.default_pins?.owner || String(1000 + Math.floor(Math.random() * 9000));
    const staffPinValue = preset?.default_pins?.staff || String(1000 + Math.floor(Math.random() * 9000));
    const ownerPin = await Utils.hashPin(ownerPinValue, branchId);
    db.run("INSERT INTO users (branch_id, name, pin_hash, role, active, created_at) VALUES (?,?,?,?,1,?)",
      [branchId, 'Chủ quán', ownerPin, 'owner', now]);
    const staffPin = await Utils.hashPin(staffPinValue, branchId);
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
      // Icon Win10-safe (🧋/🫐 là Emoji 13 — Windows 10 không có font, hiện ô vuông)
      const catIcons = {1:'🍋',2:'🥛',3:'⭐',4:'🧀',5:'🍨',6:'🍧',7:'🔥',8:'☕',9:'🍟',10:'🍜',11:'➕',12:'➕'};
      Object.entries(catMap).forEach(([name, id], idx) => {
        db.run("INSERT INTO categories (id, branch_id, name, sort_order, icon) VALUES (?,?,?,?,?)",
          [id, branchId, name, idx + 1, catIcons[id] || '🍴']);
      });

      // Variant groups theo MỨC CHÊNH GIÁ L-M thật từ CSV.
      // 2026-06-10 FIX GIÁ: bản cũ L modifier=0 → bán size L bằng giá M, mất 5-10k/ly.
      // Chênh không đồng nhất (đa số +5k, trà sữa khoai môn +8k, kem mây +10k)
      // → tạo 1 group cho mỗi mức chênh, gắn sản phẩm vào group đúng mức của nó.
      const tierGroups = new Map(); // diff(VND) -> group_id
      let vgId = 0, varId = 0;
      const groupForDiff = (diff) => {
        if (tierGroups.has(diff)) return tierGroups.get(diff);
        vgId++;
        db.run("INSERT INTO variant_groups (id, name, selection_type, required) VALUES (?,?,?,?)",
          [vgId, 'Size đồ uống', 'single', 1]);
        varId++;
        db.run("INSERT INTO variants (id, group_id, name, price_modifier) VALUES (?,?,?,?)", [varId, vgId, 'M', 0]);
        varId++;
        db.run("INSERT INTO variants (id, group_id, name, price_modifier) VALUES (?,?,?,?)", [varId, vgId, 'L', diff]);
        tierGroups.set(diff, vgId);
        return vgId;
      };

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
          const diff = Math.max(0, (p.sizes.L.price || 0) - (p.sizes.M.price || 0));
          db.run("INSERT INTO product_variant_groups (product_id, group_id) VALUES (?,?)", [p.id, groupForDiff(diff)]);
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
      // 2026-06-10: chuẩn hoá đơn vị kho về gram/ml (kg→gram ×1000, lít→ml ×1000).
      // Đơn giá CHIA tương ứng (đ/kg → đ/gram) — tool reseed cũ quên chia làm giá kho sai ×1000.
      const convU = (u) => {
        u = (u || '').toLowerCase();
        if (u === 'kg') return { unit: 'gram', mult: 1000 };
        if (u === 'lít' || u === 'l' || u === 'lit') return { unit: 'ml', mult: 1000 };
        return { unit: u.replace(/[^\w]/g, '') || 'unit', mult: 1 };
      };
      const ingCodeToId = new Map();
      const ingMult = new Map(); // code -> mult (để nhân qty recipe cùng hệ đơn vị)
      let iid = 0;
      ingRows.forEach(row => {
        if (row.status !== 'ACTIVE') return;
        iid++;
        const c = convU(row.unit);
        const minRaw = parseInt(row.stock_min, 10) || 100;
        const min = minRaw * c.mult;
        const cost = (parseInt(row.unit_cost_vnd, 10) || 0) / c.mult;
        db.run("INSERT INTO ingredients (id, branch_id, name, unit, stock_current, stock_min, cost_per_unit, supplier, active) VALUES (?,?,?,?,?,?,?,?,1)",
          [iid, branchId, '[' + row.ingredient_code + '] ' + row.name_vn,
           c.unit,
           Math.max(5000, min * 5),
           min,
           Math.round(cost * 100) / 100,
           row.supplier || '']);
        ingCodeToId.set(row.ingredient_code, iid);
        ingMult.set(row.ingredient_code, c.mult);
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
        let qty = parseFloat(row.qty) || 0;
        // Quy đổi cùng hệ đơn vị với kho: recipe ghi kg/lít → ×1000 thành gram/ml
        const ru = (row.unit || '').toLowerCase();
        if (ru === 'kg' || ru === 'lít' || ru === 'l' || ru === 'lit') qty *= 1000;
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
    // 2026-06-10 v4 auto-fix: DB seed bản cũ có variant L modifier=0 (bán L giá M).
    // Giá L gốc đã mất khi seed → không vá tại chỗ được. Nếu CHƯA có đơn nào thì
    // reseed an toàn từ CSV; nếu đã có đơn thì cảnh báo để chủ quán tự Reset.
    try {
      const badL = exec("SELECT COUNT(*) AS n FROM variants WHERE name='L' AND price_modifier=0")[0].n;
      if (badL > 0) {
        const ords = exec("SELECT COUNT(*) AS n FROM orders")[0].n;
        if (ords === 0) {
          console.warn('[v4] Reseed tự động: sửa giá size L (DB chưa có đơn — an toàn).');
          await resetAll();
        } else {
          console.warn('[v4] CẢNH BÁO GIÁ: size L đang bán bằng giá size M. Vào Cài đặt → Reset dữ liệu (mất ' + ords + ' đơn hiện có) để nạp giá đúng.');
        }
      }
    } catch (e) { /* bảng variants có thể trống — bỏ qua */ }
    // 2026-06-10 v5: CSV cũ ghi nước lọc qty=ml nhưng unit='lít' → reseed nhân oan ×1000
    // (hiển thị "120000ml Nước lọc"). Chia lại cho DB đang chạy. Idempotent: chỉ chạm
    // dòng >= 10000 (10 lít/ly — chắc chắn sai).
    try {
      const ingW = exec("SELECT id FROM ingredients WHERE name LIKE '%IG-OT-002%' LIMIT 1");
      if (ingW.length) {
        const bad = exec("SELECT COUNT(*) AS n FROM recipes WHERE ingredient_id=? AND qty_per_unit >= 10000", [ingW[0].id])[0].n;
        if (bad > 0) {
          db.run("UPDATE recipes SET qty_per_unit = qty_per_unit / 1000.0 WHERE ingredient_id=? AND qty_per_unit >= 10000", [ingW[0].id]);
          console.warn('[v5] Fix nước lọc ×1000: đã chia lại', bad, 'dòng recipe');
        }
      }
    } catch (e) { /* ignore */ }
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

  global.DB = { init, exec, run, lastInsertId, persist, flush, exportBlob, importBlob, resetAll, reload };
})(window);
