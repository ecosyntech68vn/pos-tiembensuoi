# Sổ tay chủ quán

Tài liệu này dành cho chủ quán — người chịu trách nhiệm setup và quản lý phần mềm POS Cafe.

## 1. Lần đầu mở phần mềm

1. Mở Chrome (hoặc Safari) trên iPad / máy tính.
2. Mở URL được cung cấp (hoặc mở file `index.html`).
3. Khi thấy bàn phím PIN, gõ **1234** rồi nhấn **OK**.
4. Đây là PIN mặc định của chủ quán — **đổi ngay**.

## 2. Đặt thông tin quán

Vào tab **Cài đặt → Thông tin quán**:

| Mục | Nhập gì |
| --- | --- |
| Tên quán | VD: "Trà sữa Nhà Mèo" |
| Địa chỉ | Đầy đủ để in hóa đơn |
| Số điện thoại | SĐT khách gọi đặt |
| Slogan | (tuỳ chọn) câu thương hiệu |
| VAT % | Mặc định 0. Đặt 8 hoặc 10 nếu xuất hóa đơn VAT |
| Làm tròn | Mặc định 1000đ. Đổi 500 hoặc 0 nếu cần |
| Logo | Upload ảnh logo (≤ 200KB, dạng PNG/JPG) |
| License cấp cho | Ghi tên quán/chủ — để rõ bản quyền |

Nhấn **Lưu thông tin quán**.

## 3. Đổi PIN mặc định

Vào **Cài đặt → Người dùng & PIN**:

- Nhấn **Đổi PIN** ở dòng "Chủ quán" → gõ PIN mới 4 số.
- Đổi PIN "Nhân viên 1" hoặc xoá, thêm nhân viên theo tên thật.

> **An toàn**: KHÔNG dùng PIN dễ đoán (0000, 1234, năm sinh). Mỗi nhân viên 1 PIN riêng để báo cáo doanh thu theo ca chính xác.

## 4. Quản lý menu

Vào tab **Menu**:

- 30 sản phẩm mẫu đã có sẵn (cafe, trà sữa, trà trái cây...). Sửa hoặc xoá theo menu thật.
- Nhấn **+ Thêm SP**: nhập tên, giá gốc, nhóm, icon emoji.
- Sản phẩm có size / topping / đường / đá: gắn variant group trong DB (V1 chỉ qua import; V1.1 sẽ có UI).

## 5. Quản lý nguyên liệu

Vào tab **Kho**:

- Xem danh sách 20 nguyên liệu mẫu.
- Nhấn **+ Nhập/Xuất** để ghi nhận nhập hàng, xuất hàng, hao hụt, điều chỉnh.
- Nguyên liệu dưới mức tồn tối thiểu → ô vàng cam → cần nhập thêm.

## 6. Xem báo cáo

Vào tab **Báo cáo**:

- **Doanh thu hôm nay**: số đơn, doanh thu, chi tiết theo phương thức (mặt / QR / thẻ).
- **Top bán chạy**: 5 sản phẩm bán nhiều nhất hôm nay.
- **Xuất CSV**: tải file Excel mở được.
- **Gửi Telegram**: gửi báo cáo cho điện thoại của chủ quán (sau khi cấu hình ở phần dưới).

## 7. Đồng bộ Google Sheets (tuỳ chọn)

Vào **Cài đặt → Đồng bộ Google Sheets (GAS)**:

1. Tạo Google Apps Script web app (mẫu sẽ cung cấp riêng).
2. Dán URL Web App vào ô.
3. Nhấn **Lưu** rồi **Test ping**.

Sau đó: mỗi đơn hàng sẽ tự đẩy lên Google Sheet sau ~1 phút (khi có mạng).

## 8. Báo doanh thu qua Telegram (tuỳ chọn)

Vào **Cài đặt → Telegram báo doanh thu**:

1. Chat với **@BotFather** trên Telegram → tạo bot mới → copy **bot token**.
2. Chat với **@userinfobot** → lấy **chat_id** của bạn.
3. Dán cả 2 vào ô → **Lưu**.
4. Nhấn **Gửi tin nhắn test**.
5. Cuối ngày bạn sẽ nhận báo cáo tự động (cần thao tác trong app trước khi đóng cửa).

## 9. Sao lưu dữ liệu

**Quy tắc vàng: sao lưu MỖI NGÀY.**

Xem chi tiết: `docs/BACKUP_GUIDE.md`.

## 10. Xử lý khi gặp vấn đề

| Tình huống | Cách xử lý |
| --- | --- |
| Quên PIN | Chỉ chủ quán còn nhớ PIN mới reset được người khác. Nếu chủ quên: phục hồi từ file backup gần nhất hoặc liên hệ EcoSynTech. |
| Tablet hỏng / mất | Mua tablet mới → mở URL → phục hồi từ file backup mới nhất. |
| Đơn không thấy trên Google Sheet | Vào Cài đặt → Test ping. Nếu OK, nhấn **Đồng bộ ngay**. Nếu vẫn lỗi, xem log trong console (F12). |
| Doanh thu sai | Kiểm tra danh sách đơn ở tab Đơn — có đơn nào đánh nhầm? Liên hệ EcoSynTech để hỗ trợ chỉnh sửa an toàn. |

## 11. Liên hệ hỗ trợ

- Email: davidta.ktqd.mba@gmail.com
- Nội dung gửi: **mô tả vấn đề + ảnh chụp màn hình + thời điểm xảy ra**.
- Phản hồi: trong giờ làm việc (8h-18h, T2-T7).
