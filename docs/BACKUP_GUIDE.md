# Hướng dẫn sao lưu dữ liệu — 1 trang

> **Quy tắc vàng: sao lưu MỖI NGÀY trước khi đóng cửa.**

## Sao lưu là gì?

App lưu toàn bộ đơn hàng, menu, kho... trong 1 file gọi là **file backup .db**.
Nếu iPad hỏng / bị mất / cài lại / bị xóa nhầm — chỉ cần file backup là khôi phục được TẤT CẢ.

## Cách 1: Backup ra Google Drive (khuyên dùng)

1. Vào **Cài đặt → Sao lưu & Phục hồi**.
2. Bấm **⬇ Tải file backup** → file `pos-backup-YYYY-MM-DD.db` được tải xuống.
3. Mở app Google Drive trên iPad.
4. Bấm **+** → **Tải lên** → chọn file vừa tải.
5. Tạo folder "POS Backup" → kéo file vào đó.

**Tần suất**: Mỗi tối trước khi đóng cửa.

**Giữ bao lâu**: Giữ 30 ngày gần nhất. File cũ hơn có thể xoá.

## Cách 2: Backup ra USB (phòng khi không có mạng)

1. Cắm USB vào iPad (cần adapter Lightning-USB hoặc USB-C).
2. Vào **Cài đặt → Sao lưu & Phục hồi**.
3. Bấm **⬇ Tải file backup**.
4. Chọn USB làm nơi lưu.
5. Rút USB cất tủ an toàn.

## Phục hồi từ file backup

> ⚠ Phục hồi sẽ **ghi đè toàn bộ dữ liệu hiện tại**. Chỉ làm khi cần thật.

1. Vào **Cài đặt → Sao lưu & Phục hồi**.
2. Bấm **⬆ Phục hồi từ file**.
3. Chọn file backup mới nhất.
4. Xác nhận → app tự khởi động lại với dữ liệu đã phục hồi.

## Chuyển sang iPad mới

1. iPad cũ: backup → tải về.
2. Gửi file qua AirDrop / email / Google Drive sang iPad mới.
3. iPad mới: mở URL POS Cafe → đăng nhập PIN mặc định → **Phục hồi từ file** → xong.

## Khi cài lại app

App lưu dữ liệu trong "trình duyệt" — nếu xóa Chrome, dữ liệu **có thể mất**.
→ **Backup TRƯỚC** khi xóa cache, gỡ Chrome, hay reset iPad.

## Hỏi đáp

**Q: Tự động backup được không?**
A: V1.0 chưa. V1.1 sẽ thêm tự động backup lên Google Drive hằng đêm.

**Q: File backup nặng bao nhiêu?**
A: Tháng đầu ~200KB, 1 năm ~5-10MB.

**Q: Tôi xóa nhầm 1 đơn, có khôi phục được không?**
A: Có — phục hồi từ backup gần nhất (sẽ mất các đơn sau backup đó).

---

EcoSynTech Global · davidta.ktqd.mba@gmail.com
