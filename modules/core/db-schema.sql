-- ============================================================================
-- EcoSynTech POS Cafe — Database Schema
-- White-label POS for cafe / milk tea shops
-- Storage: SQLite (sql.js WASM in browser, persisted via IndexedDB)
-- Multi-tenant ready: branch_id propagates everywhere (V1 lock 1 branch)
-- ============================================================================

PRAGMA foreign_keys = ON;

-- Branches: V1 = 1 row, V2 = multi-branch
CREATE TABLE IF NOT EXISTS branches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  logo_data_url TEXT,        -- base64 image, stored in DB to survive offline
  slogan TEXT,
  tax_rate REAL DEFAULT 0,
  round_to INTEGER DEFAULT 1000, -- VND rounding: 500/1000/10000
  license_to TEXT,           -- shop name on license
  created_at INTEGER
);

-- Users: PIN-based, 2 roles
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  name TEXT NOT NULL,
  pin_hash TEXT NOT NULL,    -- SHA-256 of "<pin>:<branch_id>" salt
  role TEXT NOT NULL CHECK(role IN ('owner','staff')),
  active INTEGER DEFAULT 1,
  created_at INTEGER
);

-- Categories
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  icon TEXT
);

-- Products
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  category_id INTEGER REFERENCES categories(id),
  name TEXT NOT NULL,
  base_price INTEGER NOT NULL, -- VND integer (no decimal)
  icon TEXT,
  image TEXT,
  active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at INTEGER
);

-- Variants: size, sugar, ice, topping
CREATE TABLE IF NOT EXISTS variant_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  selection_type TEXT NOT NULL CHECK(selection_type IN ('single','multi')),
  required INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL REFERENCES variant_groups(id),
  name TEXT NOT NULL,
  price_modifier INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS product_variant_groups (
  product_id INTEGER NOT NULL REFERENCES products(id),
  group_id INTEGER NOT NULL REFERENCES variant_groups(id),
  PRIMARY KEY (product_id, group_id)
);

-- Orders
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  user_id INTEGER REFERENCES users(id),
  order_no TEXT,             -- Human-readable e.g. "2026-06-08#001"
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','cancelled','refunded')),
  subtotal INTEGER NOT NULL DEFAULT 0,
  tax INTEGER NOT NULL DEFAULT 0,
  discount INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  payment_method TEXT CHECK(payment_method IN ('cash','qr','card','transfer')),
  cash_received INTEGER,
  change_given INTEGER,
  note TEXT,
  created_at INTEGER NOT NULL,
  paid_at INTEGER,
  sync_status TEXT NOT NULL DEFAULT 'pending' CHECK(sync_status IN ('pending','synced','failed'))
);

CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_sync ON orders(sync_status);

-- Order items (snapshot of product/variants at sale time)
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  product_id INTEGER REFERENCES products(id),
  product_name TEXT NOT NULL,   -- snapshot
  variants_json TEXT,           -- JSON snapshot
  unit_price INTEGER NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  line_total INTEGER NOT NULL
);

-- Ingredients
CREATE TABLE IF NOT EXISTS ingredients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  stock_current REAL DEFAULT 0,
  stock_min REAL DEFAULT 0,
  cost_per_unit INTEGER DEFAULT 0,
  supplier TEXT,
  waste_pct REAL DEFAULT 0,   -- hao hụt % (Excel khách thường có cột này)
  active INTEGER DEFAULT 1
);

-- Recipes: 1 product uses N ingredients
CREATE TABLE IF NOT EXISTS recipes (
  product_id INTEGER NOT NULL REFERENCES products(id),
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id),
  qty_per_unit REAL NOT NULL,
  variant_filter TEXT,         -- NULL or JSON filter for size variants
  PRIMARY KEY (product_id, ingredient_id, variant_filter)
);

-- Inventory transactions (nhap/xuat/dieu chinh/hao hut)
CREATE TABLE IF NOT EXISTS inventory_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id),
  type TEXT NOT NULL CHECK(type IN ('purchase','sale','adjustment','waste')),
  qty REAL NOT NULL,           -- + nhap, - xuat
  unit_cost INTEGER,
  total_cost INTEGER,
  ref_type TEXT,
  ref_id INTEGER,
  note TEXT,
  user_id INTEGER REFERENCES users(id),
  created_at INTEGER NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'pending' CHECK(sync_status IN ('pending','synced','failed'))
);

CREATE INDEX IF NOT EXISTS idx_inv_tx_created ON inventory_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_inv_tx_ingredient ON inventory_transactions(ingredient_id);

-- Shifts (open/close cash session)
CREATE TABLE IF NOT EXISTS shifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  opening_cash INTEGER DEFAULT 0,
  closing_cash INTEGER DEFAULT 0,
  total_sales INTEGER DEFAULT 0,
  note TEXT
);

-- Sync log
CREATE TABLE IF NOT EXISTS sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity TEXT NOT NULL,
  entity_id INTEGER,
  action TEXT NOT NULL CHECK(action IN ('push','pull')),
  status TEXT NOT NULL CHECK(status IN ('success','failed','retry')),
  payload TEXT,
  error TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sync_log_created ON sync_log(created_at);

-- Schema version (migration tracking)
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO schema_version (version, applied_at) VALUES (1, strftime('%s','now')*1000);
