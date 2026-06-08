// ============================================================================
// db.js — SQLite (sql.js WASM) lifecycle + IndexedDB persistence
// Offline-first: DB lives in browser. Persists to IndexedDB on every commit.
// ============================================================================
(function (global) {
  'use strict';

  const DB_NAME = 'ecosyntech-pos';
  const STORE = 'sqlite';
  const KEY = 'main.db';
  const SCHEMA_URL = 'modules/core/db-schema.sql';
  const SEED_MENU_URL = 'seed/sample-menu.json';
  const SEED_INGR_URL = 'seed/sample-ingredients.json';
  const SEED_RECIPES_URL = 'seed/sample-recipes.json';

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

    // Load menu seed
    try {
      const menu = await fetchJSON(SEED_MENU_URL);
      menu.categories.forEach((c) => {
        db.run("INSERT INTO categories (id, branch_id, name, sort_order, icon) VALUES (?,?,?,?,?)",
          [c.id, branchId, c.name, c.sort_order, c.icon || '']);
      });
      menu.variant_groups.forEach((g) => {
        db.run("INSERT INTO variant_groups (id, name, selection_type, required) VALUES (?,?,?,?)",
          [g.id, g.name, g.selection_type, g.required ? 1 : 0]);
      });
      menu.variants.forEach((v) => {
        db.run("INSERT INTO variants (id, group_id, name, price_modifier) VALUES (?,?,?,?)",
          [v.id, v.group_id, v.name, v.price_modifier || 0]);
      });
      menu.products.forEach((p, idx) => {
        db.run("INSERT INTO products (id, branch_id, category_id, name, base_price, icon, active, sort_order, created_at) VALUES (?,?,?,?,?,?,1,?,?)",
          [p.id, branchId, p.category_id, p.name, p.base_price, p.icon || '', idx, now]);
        (p.variant_groups || []).forEach((gid) => {
          db.run("INSERT INTO product_variant_groups (product_id, group_id) VALUES (?,?)", [p.id, gid]);
        });
      });
    } catch (e) {
      console.warn('[db] menu seed skipped:', e.message);
    }

    // Load ingredients seed
    try {
      const ing = await fetchJSON(SEED_INGR_URL);
      ing.ingredients.forEach((i) => {
        db.run("INSERT INTO ingredients (id, branch_id, name, unit, stock_current, stock_min, cost_per_unit, supplier, active) VALUES (?,?,?,?,?,?,?,?,1)",
          [i.id, branchId, i.name, i.unit, i.stock_current, i.stock_min, i.cost_per_unit, i.supplier || '']);
      });
    } catch (e) {
      console.warn('[db] ingredient seed skipped:', e.message);
    }

    // Load recipes seed
    try {
      const rec = await fetchJSON(SEED_RECIPES_URL);
      rec.recipes.forEach((r) => {
        db.run("INSERT OR IGNORE INTO recipes (product_id, ingredient_id, qty_per_unit, variant_filter) VALUES (?,?,?,?)",
          [r.product_id, r.ingredient_id, r.qty_per_unit, null]);
      });
    } catch (e) {
      console.warn('[db] recipe seed skipped:', e.message);
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
    global.dbInstance = db;
    EventBus.emit('db:reset', {});
  }

  global.DB = { init, exec, run, lastInsertId, persist, exportBlob, importBlob, resetAll };
})(window);
