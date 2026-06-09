# Nhập menu từ Excel — POS Cafe

V1 chưa có nút import CSV trực tiếp trong UI. Có 3 cách nhập menu Excel:

## Cách 1: Nhập tay (≤ 30 SP, ~15 phút)

Đơn giản nhất:

1. Mở Excel menu thật của quán.
2. Trong app, vào **Menu → + Thêm SP**.
3. Lần lượt nhập từng sản phẩm: tên, giá, nhóm, icon.
4. Mỗi SP mất ~30 giây.

## Cách 2: Sửa file seed JSON (kỹ thuật một chút)

Cần biết dùng text editor. Nếu không quen, dùng Cách 1.

1. Mở Excel → save as CSV.
2. Mở file `seed/sample-menu.json` trong app POS bằng text editor (Notepad++, VSCode).
3. Sửa mảng `products`: từng sản phẩm có dạng:
   ```json
   { "id": 1, "category_id": 1, "name": "Cà phê đen", "base_price": 20000, "icon": "☕", "variant_groups": [1,3] }
   ```
4. Sửa danh sách products theo Excel của quán.
5. Vào app → **Cài đặt → Reset toàn bộ dữ liệu** → app sẽ seed lại với menu mới.

> ⚠ **Backup trước khi reset!**

## Cách 3: Dùng dịch vụ EcoSynTech (có phí, < 1 giờ)

Nếu menu > 50 SP hoặc có nhiều variants phức tạp:

1. Gửi file Excel menu cho EcoSynTech qua email.
2. EcoSynTech sẽ:
   - Parse Excel.
   - Map sang JSON seed chuẩn.
   - Gửi lại file `.db` đã import sẵn menu của quán.
3. Vào app → **Cài đặt → Phục hồi từ file** → chọn file `.db`.

Phí: liên hệ EcoSynTech để báo giá.

## Định dạng Excel khuyến nghị

Cột tối thiểu (đặt tên đúng để dễ map):

| TenSP | Nhom | GiaGoc | Icon | SizeS | SizeM | SizeL | DuongDa | Topping |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Cà phê đen | Cà phê | 20000 | ☕ | 0 | 5000 | 10000 | Có | Không |
| Trà sữa truyền thống | Trà sữa | 30000 | 🧋 | 0 | 5000 | 10000 | Có | Có |

- **GiaGoc**: VND nguyên đồng (không decimal).
- **SizeS/M/L**: cộng thêm bao nhiêu vào giá gốc.
- **DuongDa**: Có / Không (có chọn % đường, % đá).
- **Topping**: Có / Không (có cho chọn topping).

---

EcoSynTech Global · davidta.ktqd.mba@gmail.com
