// ============================================================================
// sepay.js — Sepay.vn API client + matching helper
// Endpoint: GET https://my.sepay.vn/userapi/transactions/list?limit=N
// Auth: Authorization: Bearer <api_key>
// ============================================================================
(function (global) {
  'use strict';

  /** Normalize string for content matching (strip non-alphanumeric, lowercase) */
  function normalize(s) {
    return String(s || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  }

  /** XOR + base64 obfuscation for localStorage. NOT cryptographic security,
   *  just to keep the API key from being plain-text in DevTools. */
  function xorObfuscate(text, key) {
    const k = String(key || 'ecosyntech-pos');
    let out = '';
    for (let i = 0; i < text.length; i++) {
      out += String.fromCharCode(text.charCodeAt(i) ^ k.charCodeAt(i % k.length));
    }
    return btoa(out);
  }
  function xorDeobfuscate(b64, key) {
    try {
      const text = atob(b64);
      const k = String(key || 'ecosyntech-pos');
      let out = '';
      for (let i = 0; i < text.length; i++) {
        out += String.fromCharCode(text.charCodeAt(i) ^ k.charCodeAt(i % k.length));
      }
      return out;
    } catch (e) { return ''; }
  }

  class SepayClient {
    constructor(apiKey) {
      this.apiKey = apiKey || '';
      this.baseUrl = 'https://my.sepay.vn/userapi';
    }
    async listRecentTransactions(limit) {
      if (!this.apiKey) throw new Error('Sepay API key chưa cấu hình');
      const url = this.baseUrl + '/transactions/list?limit=' + (limit || 20);
      const res = await fetch(url, {
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + this.apiKey, 'Accept': 'application/json' },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error('Sepay HTTP ' + res.status + (text ? ': ' + text.slice(0, 80) : ''));
      }
      const data = await res.json();
      // Sepay returns { status, error, messages, transactions: [...] }
      return data.transactions || data.data || [];
    }
    async ping() {
      try {
        const txs = await this.listRecentTransactions(1);
        return { ok: true, count: txs.length };
      } catch (e) {
        return { ok: false, reason: e.message };
      }
    }
  }

  /** Match a Sepay transaction to an order.
   *  Sepay fields: amount_in (số dương cho khoản nhận), transaction_content (nội dung CK)
   *  Some responses use: transferAmount, transactionContent (camelCase)
   *  Optional: id (Sepay tx id)
   */
  function matchTxToOrder(tx, order) {
    if (!tx || !order) return false;
    const amount = Number(tx.amount_in || tx.transferAmount || tx.amountIn || 0);
    const content = tx.transaction_content || tx.transactionContent || tx.content || '';
    const amountMatch = amount > 0 && amount === Number(order.total);
    const contentMatch = normalize(content).includes(normalize(order.order_no));
    return amountMatch && contentMatch;
  }

  /** Find first matching tx for an order */
  function findMatch(txs, order) {
    return (txs || []).find(tx => matchTxToOrder(tx, order)) || null;
  }

  global.Sepay = {
    SepayClient,
    matchTxToOrder,
    findMatch,
    xorObfuscate,
    xorDeobfuscate,
  };
})(window);
