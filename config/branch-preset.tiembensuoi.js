// ============================================================================
// branch-preset.tiembensuoi.js — Preset thông tin Tiệm Bên Suối
// ----------------------------------------------------------------------------
// CÁCH BẬT: thêm vào index.html + kiosk.html dòng:
//   <script src="config/branch-preset.tiembensuoi.js"></script>
// đặt SAU <script src="modules/core/db.js"></script>.
//
// Khi BẬT, db.js sẽ tự apply preset này vào branches table khi seed lần đầu.
// Nếu DB đã có data thì KHÔNG override (giữ data hiện tại của khách).
//
// CÁCH TẮT: gỡ dòng script trên hoặc đổi tên file → mặc định "Quán cafe của tôi".
// ============================================================================
(function (global) {
  'use strict';
  global.__BRANCH_PRESET__ = {
    code: 'tiembensuoi',
    name: 'Tiệm Bên Suối',
    address: 'Đông Giang, Tân Thanh, Tuyên Quang',
    phone: '0566.24.24.24',
    slogan: 'Cafe – Trà sữa – Mỳ cay – Best Seller Bên Suối',
    license_to: 'Hộ kinh doanh Tiệm Bên Suối',
    tax_rate: 0,           // Doanh thu < 1 tỷ/năm → miễn thuế (NQ 198/2025)
    round_to: 1000,        // Làm tròn 1.000đ

    // ---- Thanh toán (mặc định TẮT — anh bật khi có Sepay key + STK ngân hàng) ----
    payment: {
      qr_enabled: false,            // Bật để kiosk hiển thị QR self-pay
      bank_bin: '',                 // VD '970422' = MBBank
      account_no: '',               // Số tài khoản nhận
      account_name: '',             // Tên chủ TK
    },
    sepay: {
      enabled: false,               // Bật để auto-confirm khi khách CK
      api_key: '',                  // Lấy từ https://my.sepay.vn — KHÔNG commit lên GitHub public
      polling_seconds: 5,
    },
    telegram: {
      enabled: false,               // Bật để noti chủ quán mỗi đơn paid
      bot_token: '',                // Tạo bot mới qua @BotFather
      chat_id: '',
    },

    // ---- PIN mặc định cho preset (CHỦ QUÁN PHẢI ĐỔI khi nhận máy) ----
    default_pins: {
      owner: '1234',                // ⚠️ Đổi NGAY sau khi cài đặt cho khách
      staff: '5678',
    },
  };
  console.log('[branch-preset] Tiệm Bên Suối preset loaded — db.js sẽ apply khi seed lần đầu');
})(window);
