# Lộ trình mở rộng chi nhánh

V1 hoạt động cho 1 quán. Khi mở chi nhánh 2 trở lên, đây là lộ trình nâng cấp.

## V1 (hôm nay) — 1 quán, 1 POS

- Schema đã có cột `branch_id` ở mọi bảng nhưng lock 1 row.
- Backup local + sync 1 chiều lên Google Sheets.

## V2 (khi mở chi nhánh 2) — multi-branch, sync 2 chiều

### Khả năng mới

- Mỗi chi nhánh 1 license riêng, 1 file `.db` riêng (offline-first vẫn giữ).
- 1 dashboard chủ quán xem doanh thu tổng + theo chi nhánh.
- Đồng bộ menu trung tâm: chủ chỉnh menu ở 1 chỗ → đẩy về mọi chi nhánh.
- Đồng bộ tồn kho trung tâm (xem nhanh tồn ở chi nhánh nào).
- Báo cáo so sánh chi nhánh.

### Backend lựa chọn (frugal, theo thứ tự ưu tiên)

| Phương án | Chi phí | Ưu | Nhược |
| --- | --- | --- | --- |
| **Google Sheets + GAS** (tiếp tục) | 0đ | Đã quen, miễn phí, đủ dùng <5 chi nhánh | GAS có quota, không real-time |
| **Cloudflare D1 + Workers** | 0đ → ~5$/tháng | SQL, real-time, free tier rộng | Cần thiết lập |
| **Supabase free tier** | 0đ → 25$/tháng | Postgres + Auth có sẵn | Lock-in tương đối |
| **Tự host VPS + SQLite** | 5-10$/tháng | Full control | Cần admin |

**Quyết định V2 ban đầu**: tiếp tục GAS (frugal cứng) cho <5 chi nhánh, nâng cấp Cloudflare D1 khi vượt ngưỡng.

### Thay đổi UI

- Header thêm dropdown chọn chi nhánh.
- Báo cáo có 1 trang "Tất cả chi nhánh" (chỉ chủ).
- Menu manager: nút "Đẩy menu sang chi nhánh khác".

### Migration từ V1 → V2

1. Backup file .db V1 từng chi nhánh hiện tại.
2. Mở app V2, import từng file → tự gắn `branch_id` mới.
3. Cấu hình master URL sync.
4. Chạy song song 1 tuần → verify số liệu khớp.

## V3 (tương lai, nếu khách lớn)

- App nhân viên di động (Android/iOS) cho phục vụ chạy bàn.
- Tích hợp loyalty / thẻ thành viên qua QR.
- Tích hợp giao hàng (GrabFood, ShopeeFood) qua webhook.
- Phân tích AI: dự đoán doanh thu, suggest menu theo mùa.

> **Quan điểm**: chỉ ship khi có ít nhất 3 khách trả tiền yêu cầu. Không build tính năng đầu cơ.

---

EcoSynTech Global · davidta.ktqd.mba@gmail.com
