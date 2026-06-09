// ============================================================================
// sw.js — Service Worker (PWA offline cache)
// ----------------------------------------------------------------------------
// 2026-06-09: cache-first cho assets cố định, network-first cho data CSV/JSON.
// Khi POS Cafe LIVE rebuild, version bumps → user F5 = nhận bản mới.
// ============================================================================
const CACHE_VERSION = 'pos-cafe-v2.6.0';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './kiosk.html',
  './manifest.json',
  './assets/styles.css',
  './modules/core/db.js',
  './modules/core/models.js',
  './modules/core/utils.js',
  './modules/core/event-bus.js',
  './modules/core/icons.js',
  './modules/core/vietqr.js',
  './modules/core/sepay.js',
  './modules/core/db-schema.sql',
  './modules/pos/cart.js',
  './config/business-rules.js',
  './config/payment-methods.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_VERSION).then((c) => c.addAll(ASSETS_TO_CACHE).catch((err) => {
      console.warn('[sw] some assets failed cache:', err);
    }))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Network-first cho CSV data + sql.js WASM (cần fresh)
  if (url.pathname.includes('/data/') || url.pathname.includes('sql-wasm') || url.search.includes('cb=')) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }
  // Cache-first cho assets cố định
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request).then((r) => {
      if (r.ok && e.request.method === 'GET') {
        const clone = r.clone();
        caches.open(CACHE_VERSION).then((c) => c.put(e.request, clone));
      }
      return r;
    }).catch(() => cached))
  );
});
