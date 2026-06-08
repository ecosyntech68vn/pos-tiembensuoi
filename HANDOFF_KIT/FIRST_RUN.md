# Setup ngày đầu — POS Cafe

Checklist cho chủ quán làm 1 lần duy nhất, trước khi mở bán.

## Trước khi bắt đầu

Chuẩn bị:

- [ ] iPad / máy POS đã cài app (xem `INSTALL_TABLET.md`).
- [ ] Logo quán dạng PNG/JPG ≤ 200KB.
- [ ] Danh sách menu thật (Excel hoặc giấy).
- [ ] Danh sách nguyên liệu hiện có.
- [ ] (Tuỳ chọn) Tài khoản Google để dùng Telegram bot + Google Sheets sync.

## Phần 1: Đăng nhập + thông tin quán (5 phút)

1. Mở app → đăng nhập PIN **1234** (chủ quán mặc định).
2. Vào **Cài đặt → Thông tin quán** → điền:
   - Tên quán
   - Số điện thoại
   - Địa chỉ
   - Slogan (tuỳ chọn)
   - VAT % (mặc định 0)
   - Làm tròn (mặc định 1000đ)
   - Logo → bấm chọn file → upload
   - License cấp cho: tên quán/chủ
3. Bấm **Lưu thông tin quán**.

## Phần 2: Đổi PIN mặc định (3 phút)

1. Vào **Cài đặt → Người dùng & PIN**.
2. Bấm **Đổi PIN** ở dòng "Chủ quán" → gõ PIN mới (KHÔNG dùng 1234, 0000, năm sinh).
3. Đổi PIN "Nhân viên 1" hoặc:
   - Bấm **Xoá** "Nhân viên 1" nếu chưa cần.
   - Thêm nhân viên thật ở khung **Thêm nhân viên**.

## Phần 3: Setup menu (15-30 phút)

1. Vào tab **Menu**.
2. App đã có 30 sản phẩm mẫu (cafe, trà sữa, trà trái cây...).
3. **Sửa từng sản phẩm**: bấm **Sửa** → cập nhật tên / giá / nhóm cho khớp menu thật.
4. **Thêm sản phẩm mới**: bấm **+ Thêm SP**.
5. **Xoá / ẩn**: V1 chưa có nút xoá hẳn — đặt giá = 0 hoặc rename "[ẨN] Tên cũ" để loại khỏi POS.

> Nếu menu > 50 món và Excel có sẵn, liên hệ EcoSynTech để được import nhanh (tính phí dịch vụ).

## Phần 4: Setup nguyên liệu (10-20 phút, tuỳ chọn)

1. Vào tab **Kho**.
2. App có 20 nguyên liệu mẫu. Sửa hoặc thay tên cho khớp.
3. Mỗi nguyên liệu nhập tồn ban đầu qua **+ Nhập/Xuất** → chọn loại "Nhập".

> **Có thể bỏ qua bước này V1**, app vẫn bán bình thường — chỉ là không có cảnh báo tồn thấp.

## Phần 5: Đồng bộ Google Sheets (tuỳ chọn, 10 phút)

> Cần tài khoản Google + GAS script (EcoSynTech cung cấp).

1. Vào **Cài đặt → Đồng bộ Google Sheets (GAS)**.
2. Dán URL Web App → **Lưu** → **Test ping** (phải báo OK).

## Phần 6: Telegram báo doanh thu (tuỳ chọn, 5 phút)

1. Chat với **@BotFather** trên Telegram → `/newbot` → đặt tên → copy **token**.
2. Chat với **@userinfobot** → copy **ID** của bạn (chat_id).
3. Vào **Cài đặt → Telegram** → dán cả 2 → **Lưu** → **Gửi tin nhắn test**.
4. Kiểm tra Telegram cá nhân → có tin nhắn test.

## Phần 7: Backup đầu tiên (2 phút)

1. Vào **Cài đặt → Sao lưu & Phục hồi** → **⬇ Tải file backup**.
2. Lưu file `pos-backup-YYYY-MM-DD.db` vào Google Drive folder "POS Backup".

## Phần 8: Test bán thử 3 đơn (10 phút)

1. Vào **Bán hàng**.
2. Tạo 3 đơn mẫu (chính chủ tự mua thử) — kiểm tra giá, tiền thừa.
3. Vào **Báo cáo** → kiểm tra doanh thu = tổng 3 đơn.
4. Vào **Đơn** → kiểm tra 3 đơn xuất hiện đầy đủ.

> Nếu muốn xoá 3 đơn test → V1 chưa có nút xoá đơn. Dùng **Reset toàn bộ dữ liệu** ở cuối Cài đặt → bắt đầu lại sạch sẽ. **Lưu ý**: reset sẽ xoá hết menu đã sửa → backup trước nếu cần.

## Phần 9: Training nhân viên

Xem `TRAINING_60MIN.md`.

---

✅ Sau 9 bước trên: quán sẵn sàng bán hàng.

Hỗ trợ: davidta.ktqd.mba@gmail.com
