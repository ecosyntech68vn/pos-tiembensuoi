// ============================================================================
// cart.js — Cart factory.
// IMPORTANT: Returns a plain object with state + methods using `this`.
// posApp() spreads this into Alpine reactive data so all mutations through
// `this.cart.<method>()` go through the Alpine proxy and are tracked.
// ============================================================================
(function (global) {
  'use strict';

  function lineKey(item) {
    return `${item.product_id}::${(item.variants || []).map((v) => v.id).sort().join(',')}`;
  }

  function makeCart() {
    return {
      items: [],
      note: '',
      discount: 0,

      addProduct(product, selectedVariants) {
        const variants = selectedVariants || [];
        const unitMod = variants.reduce((s, v) => s + (Number(v.price_modifier) || 0), 0);
        const unitPrice = (Number(product.base_price) || 0) + unitMod;
        const newItem = {
          product_id: product.id,
          product_name: product.name,
          icon: product.icon || '',
          variants,
          unit_price: unitPrice,
          qty: 1,
          line_total: unitPrice,
        };
        const key = lineKey(newItem);
        const exist = this.items.find((i) => lineKey(i) === key);
        if (exist) {
          exist.qty += 1;
          exist.line_total = exist.qty * exist.unit_price;
        } else {
          this.items.push(newItem);
        }
      },

      setQty(index, qty) {
        qty = Math.max(0, Math.floor(Number(qty) || 0));
        if (qty === 0) {
          this.items.splice(index, 1);
        } else {
          this.items[index].qty = qty;
          this.items[index].line_total = qty * this.items[index].unit_price;
        }
      },

      inc(index) { this.setQty(index, this.items[index].qty + 1); },
      dec(index) { this.setQty(index, this.items[index].qty - 1); },
      remove(index) { this.items.splice(index, 1); },
      clear() { this.items.splice(0, this.items.length); this.note = ''; this.discount = 0; },

      subtotal() {
        return this.items.reduce((s, i) => s + i.line_total, 0);
      },
      tax(taxRate) {
        return Math.round(this.subtotal() * (Number(taxRate) || 0) / 100);
      },
      total(taxRate) {
        return Math.max(0, this.subtotal() + this.tax(taxRate) - (Number(this.discount) || 0));
      },
      count() {
        return this.items.reduce((s, i) => s + i.qty, 0);
      },
    };
  }

  global.makeCart = makeCart;
})(window);
