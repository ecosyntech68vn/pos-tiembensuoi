# Hướng dẫn Import doanh thu từ POS khác

App POS Cafe hỗ trợ 2 workflow để chủ quán **chọn cách phù hợp**:

## Workflow A — "Full" (bán trực tiếp trong app)

- NV bán hàng qua tab **POS Bán hàng** trong app này.
- App tự ghi đơn → tự trừ kho theo công thức.
- Dashboard cập nhật doanh thu ngay.
- Telegram báo cuối ngày 22h.

→ Dùng nếu **bỏ POS cũ**, dùng app này làm POS chính.

## Workflow B — "Hybrid" (giữ POS hiện tại + import vào app)

- NV vẫn bán hàng trên KiotViet / Sapo / iPos / MISA như hiện tại.
- Cuối ngày: xuất CSV doanh thu từ POS đó.
- Import vào app qua tab **📥 Import CSV**.
- App tự trừ kho + cập nhật dashboard.

→ Dùng nếu **không muốn đổi habit POS**, chỉ cần dashboard + quản lý kho thông minh.

## Cách import (4 bước)

1. **Upload CSV**: bấm "Chọn file CSV" → chọn file từ POS.
2. **Nhận diện POS**: app tự đoán KiotViet/Sapo/iPos/Misa. Nếu sai → chọn thủ công.
3. **Map cột**: app tự khớp cột CSV với trường app. Kiểm tra preview 3 dòng. Sửa nếu cần.
4. **Xác nhận**: app báo số đơn sắp import, số trùng (bỏ qua), bất thường. Bấm "Auto-trừ kho" nếu muốn trừ nguyên liệu theo công thức. Bấm **Xác nhận**.

## Định dạng CSV được hỗ trợ

App tự xử lý:
- Tiếng Việt có dấu (UTF-8 / UTF-8 BOM).
- Ngày dạng `DD/MM/YYYY HH:mm` hoặc `YYYY-MM-DD HH:mm:ss`.
- Tiền dạng `30,000` hoặc `30.000` hoặc `30000`.
- 1 đơn nhiều dòng (mỗi item 1 dòng — group theo Mã đơn).
- Quotes có escape (`""inside""`).

## Xuất CSV từ POS phổ biến

### KiotViet
Tổng quan → Báo cáo → Bán hàng → **Xuất Excel** → Save As CSV → tải về tablet.

### Sapo FnB
Báo cáo → Đơn hàng → **Xuất file**.

### iPOS.vn
Báo cáo → Doanh thu → **Xuất CSV**.

### MISA CukCuk
Báo cáo → Bán hàng → **Xuất file (.csv)**.

## Nếu mapping không khớp

- Chọn preset **"Generic / Tự định nghĩa"**.
- Map từng cột thủ công ở bước 3.
- Mapping này KHÔNG lưu giữa các lần import — V1.1 sẽ thêm "Lưu preset của tôi".

## Import lặp lại trong ngày

- App bỏ qua đơn đã import (so theo Mã đơn) → import lại CSV nhiều lần KHÔNG bị trùng.
- Nếu muốn xoá đơn import sai: **Cài đặt → Reset toàn bộ** (xoá hết) hoặc liên hệ EcoSynTech để query DB tay.

## Auto-trừ kho khi import

- Nếu công thức (recipes) đã setup đúng → app tự trừ nguyên liệu cho mỗi đơn.
- Nếu món trong CSV KHÔNG tìm thấy trong menu app → app vẫn ghi đơn (revenue chính xác) nhưng KHÔNG trừ kho → hiển thị cảnh báo.
- → Quan trọng: setup menu đúng tên SP để khớp với CSV trước khi import.

---

EcoSynTech Global · davidta.ktqd.mba@gmail.com
