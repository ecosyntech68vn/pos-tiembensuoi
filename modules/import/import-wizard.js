// ============================================================================
// import-wizard.js — Drives the 4-step CSV import flow.
// Steps: 1) Upload  2) Detect POS  3) Map columns  4) Confirm + Import
// ============================================================================
(function (global) {
  'use strict';

  const PRESETS = ['kiotviet', 'sapo', 'ipos', 'misa', 'generic'];
  let LOADED_PRESETS = {};

  async function loadPresets() {
    if (Object.keys(LOADED_PRESETS).length) return LOADED_PRESETS;
    for (const p of PRESETS) {
      try {
        const r = await fetch(`modules/import/mappings/${p}.json`);
        if (r.ok) LOADED_PRESETS[p] = await r.json();
      } catch (e) { console.warn('preset load fail', p, e); }
    }
    return LOADED_PRESETS;
  }

  function detectPreset(headers) {
    // Returns { key, preset, score }
    let best = { key: 'generic', preset: LOADED_PRESETS.generic, score: 0 };
    for (const [key, preset] of Object.entries(LOADED_PRESETS)) {
      if (!preset.detect_headers || preset.detect_headers.length === 0) continue;
      let score = 0;
      preset.detect_headers.forEach((h) => {
        if (headers.includes(h)) score++;
      });
      if (score > best.score) best = { key, preset, score };
    }
    return best;
  }

  function autoMap(preset, headers) {
    const map = {};
    for (const [field, candidates] of Object.entries(preset.fields || {})) {
      const found = candidates.find((c) => headers.includes(c));
      if (found) map[field] = found;
    }
    return map;
  }

  /** Parse a date string given a list of formats. Returns epoch ms or null. */
  function parseDate(str, formats) {
    if (!str) return null;
    const s = String(str).trim();
    // ISO?
    const iso = new Date(s);
    if (!isNaN(iso.getTime()) && s.includes('-')) return iso.getTime();

    for (const fmt of (formats || [])) {
      // Manual parse for common Vietnamese formats
      // DD/MM/YYYY[ HH:mm[:ss]]
      let m;
      if (fmt.startsWith('DD/MM/YYYY')) {
        m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
        if (m) {
          const d = new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
          return d.getTime();
        }
      }
      if (fmt.startsWith('YYYY-MM-DD')) {
        m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[\sT](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
        if (m) {
          const d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
          return d.getTime();
        }
      }
    }
    return null;
  }

  /** Parse VND amount: "30,000" or "30.000" or "30000" → 30000 */
  function parseVND(str) {
    if (str == null) return 0;
    if (typeof str === 'number') return Math.round(str);
    const s = String(str).replace(/[^\d.,-]/g, '');
    if (!s) return 0;
    // If both . and , present, assume comma is thousand sep
    let cleaned = s;
    if (s.includes('.') && s.includes(',')) {
      // KiotViet often "1,234.56" (rare) — last separator is decimal
      const lastDot = s.lastIndexOf('.');
      const lastComma = s.lastIndexOf(',');
      if (lastDot > lastComma) {
        cleaned = s.replace(/,/g, '');
      } else {
        cleaned = s.replace(/\./g, '').replace(',', '.');
      }
    } else if (s.includes(',') && !s.includes('.')) {
      // Could be thousand sep or decimal — assume thousand if 3 digits after
      const parts = s.split(',');
      if (parts[parts.length - 1].length === 3) cleaned = s.replace(/,/g, '');
      else cleaned = s.replace(',', '.');
    } else {
      cleaned = s.replace(/\./g, '');
    }
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : Math.round(n);
  }

  function sanitize(str) {
    return String(str || '').replace(/[<>]/g, '').slice(0, 255);
  }

  /** Convert raw rows (objects keyed by header) → normalized orders. */
  function normalize(objects, preset, columnMap) {
    const norm = [];
    objects.forEach((row) => {
      const get = (field) => {
        const col = columnMap[field];
        return col ? row[col] : '';
      };
      norm.push({
        order_no: String(get('order_no') || '').trim().slice(0, 50),
        created_at: parseDate(get('created_at'), preset.date_formats),
        customer: sanitize(get('customer')),
        product_name: sanitize(get('product_name')),
        qty: Math.min(parseInt(get('qty'), 10) || 1, 9999),
        unit_price: parseVND(get('unit_price')),
        line_total: parseVND(get('line_total')),
        discount: parseVND(get('discount')),
        total: parseVND(get('total')),
        payment_method_raw: String(get('payment_method') || '').trim().slice(0, 30),
        note: sanitize(get('note')).slice(0, 500),
      });
    });
    return norm;
  }

  /** Group rows by order_no (since CSV typically has 1 row per item). */
  function groupByOrder(normRows, preset) {
    const map = new Map();
    normRows.forEach((r) => {
      if (!r.order_no) return; // skip invalid
      if (!map.has(r.order_no)) {
        map.set(r.order_no, {
          order_no: r.order_no,
          created_at: r.created_at || Date.now(),
          customer: r.customer,
          payment_method: (preset.payment_map || {})[r.payment_method_raw] || 'cash',
          note: r.note,
          discount: r.discount || 0,
          declared_total: r.total || 0,
          items: [],
        });
      }
      const o = map.get(r.order_no);
      if (r.product_name) {
        o.items.push({
          product_name: r.product_name,
          qty: r.qty,
          unit_price: r.unit_price || (r.qty ? Math.round(r.line_total / r.qty) : 0),
          line_total: r.line_total,
        });
      }
      // Some POS put declared_total only on first row; if rows have it inconsistent, keep max
      if (r.total > o.declared_total) o.declared_total = r.total;
      if (r.discount > o.discount) o.discount = r.discount;
    });

    return Array.from(map.values()).map((o) => {
      const subtotal = o.items.reduce((s, i) => s + i.line_total, 0);
      return {
        ...o,
        subtotal,
        total: o.declared_total || (subtotal - o.discount),
      };
    });
  }

  /** Validate orders, return { valid, issues }. */
  function validate(orders) {
    const issues = [];
    orders.forEach((o, idx) => {
      if (!o.created_at) issues.push({ row: idx + 1, msg: `Đơn ${o.order_no}: ngày không parse được` });
      if (!o.items || o.items.length === 0) issues.push({ row: idx + 1, msg: `Đơn ${o.order_no}: không có item` });
      if (o.total <= 0) issues.push({ row: idx + 1, msg: `Đơn ${o.order_no}: tổng tiền = 0` });
      // Cross-check sum
      const sumItems = o.items.reduce((s, i) => s + i.line_total, 0);
      if (sumItems > 0 && Math.abs(sumItems - o.subtotal) > 1) {
        issues.push({ row: idx + 1, msg: `Đơn ${o.order_no}: tổng items ${sumItems} ≠ subtotal ${o.subtotal}` });
      }
    });
    return { valid: issues.length === 0, issues };
  }

  /** Import into DB. Returns summary. */
  function importOrders(branchId, orders, opts) {
    opts = opts || {};
    const source = opts.source || 'csv';
    const importBatchId = 'imp-' + Date.now();
    const summary = { batch_id: importBatchId, imported: 0, skipped: 0, deduct_lines: [] };

    orders.forEach((o) => {
      // Skip if order_no already exists for branch (idempotent re-import)
      const existing = DB.exec("SELECT id FROM orders WHERE branch_id=? AND order_no=? LIMIT 1",
        [branchId, o.order_no]);
      if (existing.length > 0) { summary.skipped++; return; }

      // Resolve product_id by name (best-effort)
      const itemsResolved = o.items.map((it) => {
        const found = Models.findProductByName(branchId, it.product_name);
        return { ...it, product_id: found ? found.id : null };
      });

      const orderId = Models.insertImportedOrder(branchId, {
        order_no: o.order_no,
        subtotal: o.subtotal,
        tax: 0,
        discount: o.discount,
        total: o.total,
        payment_method: o.payment_method,
        note: o.note,
        created_at: o.created_at,
        source,
      }, itemsResolved);

      summary.imported++;

      // Trigger inventory deduction (auto mode)
      if (opts.deduct) {
        const deductions = Models.deductInventoryForOrderItems(branchId, orderId, itemsResolved, 'auto');
        summary.deduct_lines.push(...deductions);
      }
    });

    DB.persist();
    Models.logSync({
      entity: 'import', action: 'push', status: 'success',
      payload: { batch_id: importBatchId, imported: summary.imported, skipped: summary.skipped },
    });
    return summary;
  }

  global.ImportWizard = {
    loadPresets,
    detectPreset,
    autoMap,
    parseDate,
    parseVND,
    normalize,
    groupByOrder,
    validate,
    importOrders,
  };
})(window);
