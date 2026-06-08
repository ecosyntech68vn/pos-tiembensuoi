// ============================================================================
// event-bus.js — Lightweight pub/sub between modules
// ============================================================================
(function (global) {
  'use strict';
  const listeners = {};

  const EventBus = {
    on(event, cb) {
      (listeners[event] = listeners[event] || []).push(cb);
      return () => EventBus.off(event, cb);
    },
    off(event, cb) {
      if (!listeners[event]) return;
      listeners[event] = listeners[event].filter((f) => f !== cb);
    },
    emit(event, payload) {
      (listeners[event] || []).forEach((cb) => {
        try { cb(payload); } catch (e) { console.error('[bus]', event, e); }
      });
    },
  };

  global.EventBus = EventBus;
})(window);
