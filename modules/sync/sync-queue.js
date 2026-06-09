// ============================================================================
// sync-queue.js — Offline queue: retry on reconnect, batch push to GAS
// ============================================================================
(function (global) {
  'use strict';

  let intervalId = null;
  let inFlight = false;

  async function flushOnce(branchId) {
    if (inFlight) return;
    if (!navigator.onLine) return;
    inFlight = true;
    try {
      const pending = Models.pendingSyncOrders(branchId, 20);
      if (!pending.length) return;
      // Attach items for each order
      const payload = pending.map((o) => ({
        ...o,
        items: Models.getOrderItems(o.id),
      }));
      try {
        const res = await GASClient.pushOrders(payload);
        if (res && res.ok) {
          payload.forEach((o) => Models.markOrderSynced(o.id));
          Models.logSync({ entity: 'order', action: 'push', status: 'success', payload: { count: payload.length } });
          EventBus.emit('sync:success', { count: payload.length });
        } else {
          throw new Error(res && res.error ? res.error : 'Unknown GAS response');
        }
      } catch (e) {
        Models.logSync({ entity: 'order', action: 'push', status: 'failed', error: e.message });
        EventBus.emit('sync:fail', { error: e.message });
      }
    } finally {
      inFlight = false;
    }
  }

  function start(branchId, intervalMs) {
    if (intervalId) clearInterval(intervalId);
    intervalId = setInterval(() => flushOnce(branchId), intervalMs || 60000);
    window.addEventListener('online', () => flushOnce(branchId));
  }

  function stop() {
    if (intervalId) clearInterval(intervalId);
    intervalId = null;
  }

  global.SyncQueue = { start, stop, flushOnce };
})(window);
