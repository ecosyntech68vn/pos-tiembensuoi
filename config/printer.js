// ============================================================================
// config/printer.js — Cấu hình máy in nhiệt (Bluetooth, V1.1 ship)
// ============================================================================
window.PRINTER = {
  enabled: false,           // V1 chưa bật. Sang V1.1 bật + pair Bluetooth.
  paper_width_mm: 80,       // 58 hoặc 80
  encoding: 'CP1258',       // tiếng Việt: CP1258 hoặc dùng UTF-8 nếu máy in hỗ trợ
  cut_after_print: true,
  open_drawer: false,
  copies: 1,
  // ESC/POS variant: 'generic' | 'epson' | 'xprinter'
  variant: 'generic',
};
