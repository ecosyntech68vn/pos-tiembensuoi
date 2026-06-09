// ============================================================================
// csv-parser.js — Minimal RFC 4180 CSV parser (handles quotes + escapes).
// Frugal: no PapaParse dep. Good enough for KiotViet/Sapo/iPos/Misa exports.
// ============================================================================
(function (global) {
  'use strict';

  function parseCSV(text, delimiter) {
    delimiter = delimiter || ',';
    // Strip BOM
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const next = text[i + 1];

      if (inQuotes) {
        if (ch === '"' && next === '"') { field += '"'; i++; }
        else if (ch === '"') { inQuotes = false; }
        else { field += ch; }
      } else {
        if (ch === '"') { inQuotes = true; }
        else if (ch === delimiter) { row.push(field); field = ''; }
        else if (ch === '\r') { /* skip */ }
        else if (ch === '\n') { row.push(field); field = ''; rows.push(row); row = []; }
        else { field += ch; }
      }
    }
    if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }

    // Drop trailing empty rows
    while (rows.length && rows[rows.length - 1].every((c) => c === '')) rows.pop();
    return rows;
  }

  function rowsToObjects(rows) {
    if (rows.length === 0) return { headers: [], objects: [] };
    const headers = rows[0].map((h) => h.trim());
    const objects = rows.slice(1).map((r) => {
      const o = {};
      headers.forEach((h, i) => { o[h] = (r[i] !== undefined) ? r[i] : ''; });
      return o;
    });
    return { headers, objects };
  }

  global.CSVParser = { parseCSV, rowsToObjects };
})(window);
