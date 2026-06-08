# Architecture — POS Cafe (for developers)

## High-level

```
┌────────────────────────────────────────────────────────────┐
│  Browser (Chrome / Safari on tablet / desktop)             │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  index.html (Alpine.js x-data="posApp()")            │  │
│  │  Views: pos | orders | reports | menu | inventory |  │
│  │         settings                                     │  │
│  └──────────────────────────────────────────────────────┘  │
│                       │                                    │
│  ┌────────────────────┴───────────────────────────────────┐│
│  │  Modules                                                ││
│  │  • core: utils, event-bus, db (sql.js), models          ││
│  │  • auth: session, permissions                           ││
│  │  • pos:  cart                                           ││
│  │  • sync: gas-client, sync-queue, telegram-bot           ││
│  └─────────────────────────────────────────────────────────┘│
│                       │                                    │
│  ┌────────────────────┴───────────────────────────────────┐│
│  │  Persistence                                            ││
│  │  • SQLite blob (sql.js WASM)                            ││
│  │  • IndexedDB ('ecosyntech-pos' → main.db)               ││
│  │  • localStorage (GAS / Telegram config)                 ││
│  └─────────────────────────────────────────────────────────┘│
└──────────────────────┬─────────────────────────────────────┘
                       │ (online only)
            ┌──────────┴───────────┐
            │                      │
       ┌────▼────┐           ┌─────▼─────┐
       │   GAS   │           │ Telegram  │
       │ (Sheets)│           │   Bot     │
       └─────────┘           └───────────┘
```

## Boot sequence

1. `index.html` loads → CDN scripts (Tailwind, sql.js, Alpine).
2. Config scripts (`config/*.js`) populate `window.BUSINESS_RULES`, `PAYMENT_METHODS`, `PRINTER`, `NOTIFICATION`.
3. Module scripts populate `window.DB`, `Models`, `Cart`, `Session`, `GASClient`, `SyncQueue`, `TelegramBot`, `EventBus`, `Utils`.
4. Alpine `posApp().boot()`:
   - `DB.init()` opens IndexedDB, restores or creates SQLite DB.
   - First run: applies `db-schema.sql`, seeds 30 products + 20 ingredients + default branch + 2 users.
   - Registers service worker for offline caching.
   - Starts `SyncQueue` (1 min interval).
5. UI swaps to PIN login.

## Data flow — create order

```
User clicks product
   → onProductClick(p)
   → if variants required: variantPicker modal
   → Cart.addProduct(p, selectedVariants)
   → EventBus emit 'cart:change'
   → cart panel re-renders

User clicks Pay
   → openCheckout()
   → confirmCheckout()
   → Models.createOrder(orderData, items)
       → INSERT INTO orders ... VALUES ...
       → INSERT INTO order_items ...
       → DB.persist() → IndexedDB
   → SyncQueue.flushOnce() (best-effort)
       → if online + GAS configured:
            → GASClient.pushOrders()
            → Models.markOrderSynced(id)
   → Cart.clear() → UI back to menu
```

## Persistence

- **SQLite** in-memory blob → exported as `Uint8Array` → stored in IndexedDB `ecosyntech-pos.sqlite/main.db`.
- Debounced persist on every `DB.run()` (200ms).
- Manual `DB.persist()` called after multi-statement transactions.

## Sync contract (GAS)

POST `<gas_url>` with JSON:

```json
{
  "action": "push_orders",
  "api_key": "<optional>",
  "branch_id": 1,
  "orders": [
    {
      "id": 1,
      "order_no": "2026-06-08#001",
      "branch_id": 1,
      "user_id": 1,
      "status": "paid",
      "subtotal": 50000,
      "tax": 0,
      "discount": 0,
      "total": 50000,
      "payment_method": "cash",
      "cash_received": 50000,
      "change_given": 0,
      "note": "",
      "created_at": 1717830000000,
      "paid_at": 1717830000000,
      "items": [
        { "product_id": 1, "product_name": "Cà phê đen", "variants_json": "[]", "unit_price": 25000, "qty": 2, "line_total": 50000 }
      ]
    }
  ],
  "ts": 1717830000000
}
```

Response (success):
```json
{ "ok": true, "synced": [1] }
```

Response (fail):
```json
{ "ok": false, "error": "API key invalid" }
```

## Schema versioning

Table `schema_version`. Increment per migration. Migration SQL applied in `db.js` on init.

## Security notes

- PIN hashed SHA-256 with branch_id salt — **not bcrypt**. Adequate for 1-shop trust model, NOT for adversarial multi-tenant. Upgrade to PBKDF2 / Argon2-WASM in V2 multi-branch.
- GAS API key in localStorage — exposed to anyone with device access. Acceptable for in-shop tablet. Lock device with iPad screen lock PIN.
- No CSRF protection needed (POS app doesn't host endpoints).
- HTTPS required for service worker + WASM. GitHub Pages provides it by default.

## Performance budget

- First load: ≤ 2.5s on 3G (cached after first load).
- Add to cart: < 50ms.
- DB.persist: debounced 200ms.
- Reports query: < 100ms for 1 year of data (with indexes).

## Constraint check

- No React/Vue/Angular ✓
- No Node/Python server ✓
- No paid cloud DB ✓
- No hardcoded secret ✓
- Mobile + tablet responsive ✓ (Tailwind grid + flex)
- Offline-first 100% ✓ (service worker + IndexedDB)
- LICENSE proprietary ✓
