# Đối chiếu Excel cũ → POS Cafe

Tài liệu này giúp chủ quán hiểu **dữ liệu Excel hiện tại của quán** chuyển sang **POS Cafe** như thế nào.

> ⚠ **Status**: Excel mẫu khách chưa được parse (sandbox tạm down lúc build V1).
> Khi parse xong sẽ điền chi tiết từng sheet và cột mapping vào bảng dưới.

## Quan điểm chuyển đổi

- **Không bắt khách đổi habit**: app port logic Excel sang UI trực quan.
- **Giữ tên cột quen thuộc**: nếu Excel ghi "Hao hụt", app giữ "Hao hụt".
- **Excel song song trong giai đoạn pilot**: 1 tuần đầu chạy cả 2 để đối chiếu số liệu, sau đó chuyển hẳn POS.

## Mapping dự kiến (sẽ cập nhật sau khi parse Excel)

| Sheet Excel | Tab POS Cafe | Ghi chú |
| --- | --- | --- |
| Danh mục sản phẩm | Menu | Tên, giá, nhóm. Variants (size/topping) thêm thủ công ở app |
| Danh mục nguyên liệu | Kho | Tên, đơn vị, tồn đầu, đơn giá nhập |
| Nhập hàng | Kho → Nhập/Xuất → Loại "Nhập" | Tự cập nhật tồn |
| Xuất / sử dụng | Kho → Nhập/Xuất → Loại "Xuất" | Tự cập nhật tồn |
| Hao hụt | Kho → Nhập/Xuất → Loại "Hao hụt" | Có cột `waste_pct` trong schema |
| Báo cáo doanh thu | Báo cáo | Tự tính từ đơn |
| Báo cáo tồn kho | Kho | Tồn = đầu kỳ + nhập − xuất − hao hụt |

## Cách import dữ liệu từ Excel

### A. Menu sản phẩm (30-80 món)

1. Mở Excel quán → sheet danh mục sản phẩm.
2. Chuẩn hóa 4 cột: **Tên SP | Nhóm | Giá gốc | Icon emoji (tuỳ chọn)**.
3. Export sang CSV (UTF-8).
4. Cách 1 (nhanh, V1): Nhập tay vào **Menu → + Thêm SP** (mất ~30s/SP, 30 SP ~ 15 phút).
5. Cách 2 (V1.1 ship sau): Vào **Cài đặt → Import CSV** → chọn file → app tự nhập.

### B. Nguyên liệu

1. Sheet danh mục nguyên liệu → cột: **Tên | Đơn vị | Tồn hiện tại | Tồn tối thiểu | Đơn giá | NCC**.
2. Nhập tay vào **Kho** (V1) hoặc Import CSV (V1.1).

### C. Lịch sử đơn hàng cũ

- **Không cần import**: lịch sử cũ giữ trong Excel để tra cứu.
- **Bắt đầu app từ ngày X**: app tính báo cáo từ ngày X trở đi.

## Khi parse Excel khách xong sẽ cập nhật

Sau khi parse được file mẫu khách, tài liệu này sẽ liệt kê **chính xác**:

- Mỗi sheet trong Excel ánh xạ sang tab nào của POS.
- Mỗi cột Excel tương ứng cột nào của bảng SQLite.
- Logic công thức nào trong Excel cần kiểm tra lại bằng tay.
- Trường nào Excel có nhưng POS V1 chưa hỗ trợ → ưu tiên đưa vào V1.1.

---

EcoSynTech Global · davidta.ktqd.mba@gmail.com
