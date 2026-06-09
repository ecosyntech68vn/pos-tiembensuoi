// ============================================================================
// cart.js — POS Cart state (Alpine.js component factory)
// ============================================================================
// 2026-06-09 V2.6 PATCH (CEO_THUAN audit):
//   FIX BUG variants bị nuốt — addProduct(p, variants) signature 2 args:
//     1. Lưu variants array nguyên vẹn (vd [{group_id:1, id:1, name:'M (500ml)', price_modifier:0}])
//     2. Tính unit_price = base + tổng price_modifier của tất cả variants
//     3. Merge qty CHỈ KHI cùng product_id + cùng variants → M và L tách thành 2 line riêng
//     4. Hiển thị tên kèm size: "Trà chanh · M (500ml)"
//   Đây là điều kiện bắt buộc để deductInventoryForOrderItems trừ kho ĐÚNG size.
//   Backwards compatible: index.html gọi addProduct(p, []) cho sản phẩm không variant.
// ============================================================================
(function (global) {
  'use strict';

  /**
   * Stable key để compare variants 2 line cart — chỉ dựa trên ID variant đã chọn.
   * Vd [{id:1, name:'M'}] khác với [{id:2, name:'L'}] → 2 line riêng.
   */
  function variantsKey(variants) {
    if (!variants || !Array.isArray(variants) || variants.length === 0) return '';
    return variants
      .map((v) => (v && (v.id != null ? String(v.id) : (v.name || ''))))
      .filter(Boolean)
      .sort()
      .join('|');
  }

  /**
   * Tính tổng price_modifier từ tất cả variants được chọn.
   * Vd size L có +5000, topping +3000 → modifier tổng = 8000.
   */
  function sumPriceModifier(variants) {
    if (!variants || !Array.isArray(variants)) return 0;
    return variants.reduce((s, v) => s + (v && typeof v.price_modifier === 'number' ? v.price_modifier : 0), 0);
  }

  /**
   * Tên hiển thị: "Trà chanh · M (500ml)" hoặc "Trà chanh · M (500ml) · Trân châu".
   */
  function variantDisplayName(p, variants) {
    if (!variants || !Array.isArray(variants) || variants.length === 0) return p.name;
    const tail = variants.map((v) => (v && v.name) || '').filter(Boolean).join(' · ');
    return tail ? p.name + '  ·  ' + tail : p.name;
  }

  global.posCart = function () {
    return {
      items: [],
      note: '',
      discount: 0,

      /**
       * Thêm sản phẩm vào giỏ.
       * @param {Object} p - { id, name, base_price, icon }
       * @param {Array} variants - mảng các variant đã chọn, vd [{group_id, id, name, price_modifier}]
       *                            hoặc [] cho sản phẩm không có biến thể.
       */
      addProduct(p, variants) {
        variants = Array.isArray(variants) ? variants : [];
        const key       = variantsKey(variants);
        const priceMod  = sumPriceModifier(variants);
        const unitPrice = (p.base_price || p.unit_price || 0) + priceMod;
        const dispName  = variantDisplayName(p, variants);

        // Merge qty CHỈ KHI cùng product_id + cùng variants key (M không merge với L)
        const existing = this.items.find((it) => it.product_id === p.id && variantsKey(it.variants) === key);
        if (existing) {
          existing.qty += 1;
          existing.line_total = existing.unit_price * existing.qty;
          return;
        }

        // Line mới — lưu variants nguyên array để pass vào order_items.variants_json
        this.items.push({
          product_id:   p.id,
          product_name: dispName,
          icon:         p.icon || '',
          unit_price:   unitPrice,
          qty:          1,
          line_total:   unitPrice,
          variants:     variants.slice(),  // copy để tránh mutate
        });
      },

      setQty(idx, qty) {
        const n = Math.max(1, Math.min(999, parseInt(qty, 10) || 1));
        const it = this.items[idx];
        if (!it) return;
        it.qty = n;
        it.line_total = it.unit_price * n;
      },

      inc(idx) {
        const it = this.items[idx];
        if (!it) return;
        it.qty += 1;
        it.line_total = it.unit_price * it.qty;
      },

      dec(idx) {
        const it = this.items[idx];
        if (!it) return;
        if (it.qty <= 1) { this.remove(idx); return; }
        it.qty -= 1;
        it.line_total = it.unit_price * it.qty;
      },

      remove(idx) {
        this.items.splice(idx, 1);
      },

      clear() {
        this.items = [];
        this.note = '';
        this.discount = 0;
      },

      // ---- Computed (method API — khớp call-site index.html/kiosk.html) ----
      // 2026-06-10 PRODUCTION FIX (CEO_THUAN audit):
      //   index.html/kiosk.html gọi cart.subtotal(), cart.tax(vatPct), cart.total(vatPct),
      //   cart.count() dạng HÀM — bản getter cũ gây TypeError "is not a function"
      //   → toàn bộ checkout chết. Chuyển sang method, vatPct là PHẦN TRĂM (vd 8 = 8%).
      subtotal() {
        return this.items.reduce((s, it) => s + (it.line_total || 0), 0);
      },
      tax(vatPct) {
        const pct = (vatPct != null && !isNaN(vatPct))
          ? Number(vatPct)
          : ((global.__SHOP_TAX_RATE__ || 0) * 100);
        return Math.round(this.subtotal() * pct / 100);
      },
      total(vatPct) {
        const raw = Math.max(0, this.subtotal() + this.tax(vatPct) - (parseInt(this.discount, 10) || 0));
        const roundTo = (global.__SHOP_ROUND_TO__ || 0);
        return roundTo > 0 ? Math.round(raw / roundTo) * roundTo : raw;
      },
      count() {
        return this.items.reduce((n, it) => n + (it.qty || 0), 0);
      },
    };
  };

  // API chính thức được index.html / kiosk.html / e2e-runner gọi
  global.makeCart = global.posCart;
  // Backward compat: 1 số nơi gọi window.Cart
  global.Cart = global.posCart;
})(window);
