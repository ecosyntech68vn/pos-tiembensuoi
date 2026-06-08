// ============================================================================
// session.js — Lightweight session state (NOT persisted; PIN re-entered on reload)
// ============================================================================
(function (global) {
  'use strict';
  let current = null;

  const Session = {
    set(user) { current = user; EventBus.emit('auth:login', user); },
    clear() { current = null; EventBus.emit('auth:logout'); },
    get() { return current; },
    is(role) { return current && current.role === role; },
    requireOwner() {
      if (!current || current.role !== 'owner') throw new Error('Cần quyền chủ quán');
    },
  };

  global.Session = Session;
})(window);
