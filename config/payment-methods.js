// ============================================================================
// config/payment-methods.js — Bật/tắt phương thức thanh toán
// ============================================================================
window.PAYMENT_METHODS = {
  cash: { enabled: true,  label: 'Tiền mặt',        icon: '💵' },
  qr:   { enabled: true,  label: 'Chuyển khoản QR', icon: '📱' },
  card: { enabled: false, label: 'Quẹt thẻ',        icon: '💳' },

  // Mã QR ngân hàng (VietQR) — chủ quán nhập thông tin TK ngân hàng
  // Để trống thì in mã QR placeholder; điền vào sẽ in QR thật.
  vietqr: {
    bank_bin: '',        // VD: 970422 (MBBank), 970436 (Vietcombank)
    account_no: '',      // Số TK
    account_name: '',    // Tên chủ TK
    template: 'compact', // compact | full
  },
};
