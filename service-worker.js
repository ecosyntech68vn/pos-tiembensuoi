// ============================================================================
// service-worker.js — Offline-first caching
// Strategy: cache-first cho assets tĩnh, network-first cho data API (GAS, Telegram)
// ============================================================================
const CACHE = 'pos-cafe-v6';
const CORE_ASSETS = [
  './',
  './index.html',
  './kiosk.html',
  './manifest.json',
  './assets/styles.css',
  './assets/icons/logo.svg',
  './assets/icons/icon-192.svg',
  './assets/icons/icon-512.svg',
  './config/business-rules.js',
  './config/payment-methods.js',
  './config/printer.js',
  './config/notification.js',
  './modules/core/utils.js',
  './modules/core/event-bus.js',
  './modules/core/icons.js',
  './modules/core/vietqr.js',
  './modules/core/sepay.js',
  './modules/core/db.js',
  './modules/core/db-schema.sql',
  './modules/core/models.js',
  './modules/auth/session.js',
  './modules/auth/permissions.js',
  './modules/pos/cart.js',
  './modules/dashboard/dashboard.js',
  './modules/import/csv-parser.js',
  './modules/import/import-wizard.js',
  './modules/import/mappings/kiotviet.json',
  './modules/import/mappings/sapo.json',
  './modules/import/mappings/ipos.json',
  './modules/import/mappings/misa.json',
  './modules/import/mappings/generic.json',
  './seed/sample-recipes.json',
  './seed/sample-kiotviet-export.csv',
  './modules/sync/gas-client.js',
  './modules/sync/sync-queue.js',
  './modules/sync/telegram-bot.js',
  './seed/sample-menu.json',
  './seed/sample-ingredients.json',
  // CDN — best-effort
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap',
  'https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/sql-wasm.js',
  'https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/sql-wasm.wasm',
  'https://cdn.jsdelivr.net/npm/alpinejs@3.13.10/dist/cdn.min.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      Promise.all(CORE_ASSETS.map((u) => c.add(u).catch(() => null)))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Never cache GAS/Telegram API
  if (url.hostname.includes('script.google.com') || url.hostname.includes('api.telegram.org')) {
    e.respondWith(fetch(e.request).catch(() => new Response('Offline', { status: 503 })));
    return;
  }

  // Cache-first cho mọi thứ khác
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request)
        .then((res) => {
          if (res && res.status === 200 && e.request.method === 'GET') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => cached || new Response('Offline', { status: 503 }));
    })
  );
});
