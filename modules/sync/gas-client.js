// ============================================================================
// gas-client.js — Google Apps Script endpoint client
// Stub V1. User configures GAS_WEB_APP_URL in settings.
// Push orders + inventory tx. Pull menu updates (V2).
// ============================================================================
(function (global) {
  'use strict';

  const STORAGE_KEY = 'ecosyntech-pos.gas-config';

  function obfuscate(s) {
    if (!s) return '';
    let out = '';
    const k = 'ecosyntech-pos-v2';
    for (let i = 0; i < s.length; i++) out += String.fromCharCode(s.charCodeAt(i) ^ k.charCodeAt(i % k.length));
    return btoa(out);
  }
  function deobfuscate(b64) {
    if (!b64) return '';
    try {
      const s = atob(b64);
      let out = '';
      const k = 'ecosyntech-pos-v2';
      for (let i = 0; i < s.length; i++) out += String.fromCharCode(s.charCodeAt(i) ^ k.charCodeAt(i % k.length));
      return out;
    } catch (e) { return ''; }
  }

  function getConfig() {
    try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}'); }
    catch (e) { return {}; }
  }
  function setConfig(cfg) {
    const safe = { ...cfg };
    if (safe.api_key) safe.api_key = obfuscate(safe.api_key);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(safe || {}));
  }

  async function ping() {
    const cfg = getConfig();
    if (!cfg.url) return { ok: false, reason: 'GAS URL chưa cấu hình' };
    try {
      const r = await fetch(cfg.url + '?ping=1', { method: 'GET' });
      return { ok: r.ok };
    } catch (e) {
      return { ok: false, reason: e.message };
    }
  }

  async function pushOrders(orders) {
    const cfg = getConfig();
    if (!cfg.url) throw new Error('GAS URL chưa cấu hình');
    const payload = {
      action: 'push_orders',
      api_key: deobfuscate(cfg.api_key) || '',
      branch_id: cfg.branch_id || 1,
      orders,
      ts: Date.now(),
    };
    const r = await fetch(cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) throw new Error('GAS push thất bại: HTTP ' + r.status);
    return await r.json();
  }

  global.GASClient = { getConfig, setConfig, ping, pushOrders };
})(window);
