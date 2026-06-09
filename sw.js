// ============================================================================
// sw.js — KILL SWITCH 2026-06-09
// ----------------------------------------------------------------------------
// SW V1 (pos-cafe-v8 cache) gây trang trắng do cache index.html cũ có script tag
// pos-enhance.js đã rollback. SW này KHÔNG cache gì cả + unregister chính nó +
// xoá toàn bộ cache cũ. Sau khi user load lần đầu, SW sẽ tự huỷ.
// ============================================================================
self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // 1. Xoá tất cả caches cũ
    const names = await caches.keys();
    await Promise.all(names.map((n) => caches.delete(n)));
    // 2. Unregister chính SW này
    await self.registration.unregister();
    // 3. Reload tất cả clients để chạy không SW
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach((c) => c.navigate(c.url));
  })());
});

self.addEventListener('fetch', (e) => {
  // Không cache gì — pass-through trực tiếp tới network
  e.respondWith(fetch(e.request));
});
