// ============================================================================
// vietqr.js — VietQR.io image URL builder + Vietnamese bank registry
// Free public service: https://img.vietqr.io/image/{bank}-{account}-{tmpl}.png
// Templates: compact, compact2, qr_only, print
// ============================================================================
(function (global) {
  'use strict';

  // BIN codes from NAPAS (popular Vietnamese banks)
  const BANKS = [
    { bin: '970422', code: 'MB',    name: 'MBBank' },
    { bin: '970436', code: 'VCB',   name: 'Vietcombank' },
    { bin: '970407', code: 'TCB',   name: 'Techcombank' },
    { bin: '970416', code: 'ACB',   name: 'ACB' },
    { bin: '970418', code: 'BIDV',  name: 'BIDV' },
    { bin: '970432', code: 'VPB',   name: 'VPBank' },
    { bin: '970415', code: 'CTG',   name: 'Vietinbank' },
    { bin: '970403', code: 'STB',   name: 'Sacombank' },
    { bin: '970405', code: 'AGR',   name: 'Agribank' },
    { bin: '970448', code: 'OCB',   name: 'OCB' },
    { bin: '970426', code: 'MSB',   name: 'MSB' },
    { bin: '970454', code: 'VCCB',  name: 'Viet Capital Bank' },
    { bin: '970441', code: 'VIB',   name: 'VIB' },
    { bin: '970437', code: 'HDB',   name: 'HDBank' },
    { bin: '970423', code: 'TPB',   name: 'TPBank' },
    { bin: '970458', code: 'OCEANBANK', name: 'OceanBank' },
    { bin: '970430', code: 'PGB',   name: 'PG Bank' },
  ];

  function bankByBin(bin) {
    return BANKS.find(b => b.bin === bin) || null;
  }

  /**
   * Build VietQR image URL.
   * @param {object} p
   *   bank_bin: '970422'
   *   account_no: '0123456789'
   *   amount: 50000 (VND integer)
   *   message: 'Don 2026-06-08-003'
   *   account_name: 'NGUYEN VAN A'
   *   template: 'compact' | 'compact2' | 'qr_only' | 'print'
   */
  function qrUrl(p) {
    if (!p || !p.bank_bin || !p.account_no) return null;
    const tmpl = p.template || 'compact2';
    const url = `https://img.vietqr.io/image/${p.bank_bin}-${p.account_no}-${tmpl}.png`;
    const qs = [];
    if (p.amount) qs.push('amount=' + encodeURIComponent(p.amount));
    if (p.message) qs.push('addInfo=' + encodeURIComponent(p.message));
    if (p.account_name) qs.push('accountName=' + encodeURIComponent(p.account_name));
    return url + (qs.length ? '?' + qs.join('&') : '');
  }

  global.VietQR = { BANKS, bankByBin, qrUrl };
})(window);
