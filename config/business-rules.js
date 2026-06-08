// ============================================================================
// config/business-rules.js — Chủ quán tự sửa file này (KHÔNG đụng code core)
// Lưu ý: thay đổi xong nhấn Cài lại (Refresh) trên iPad.
// ============================================================================
window.BUSINESS_RULES = {
  // Thuế VAT, mặc định 0 cho quán nhỏ. Đặt 8 hoặc 10 nếu xuất hoá đơn VAT.
  vat_percent: 0,

  // Làm tròn tiền cuối cùng. 1000 = làm tròn về 1.000đ; 500 = 500đ; 0 = không làm tròn.
  cash_round: 1000,

  // Cho phép chiết khấu? (true = staff thấy ô giảm giá khi checkout)
  allow_discount: true,
  // Mức giảm tối đa staff tự áp được (vượt thì cần PIN owner)
  max_discount_without_owner: 20000,

  // Giờ mở/đóng (24h). Dùng cho cảnh báo log out cuối ca + báo cáo theo ca.
  open_hour: 7,
  close_hour: 22,

  // Bao nhiêu phút không thao tác thì tự logout (an toàn iPad chung).
  auto_logout_minutes: 15,

  // Hao hụt mặc định (%) — Excel khách thường có cột này. Áp vào báo cáo cost.
  default_waste_pct: 5,
};
