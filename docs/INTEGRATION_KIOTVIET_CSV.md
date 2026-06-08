# Tích hợp KiotViet → POS Cafe — Phương án A: CSV daily

> **Khi nào dùng:** khách hàng đã chạy KiotViet, không muốn (hoặc gói KiotViet chưa có) webhook realtime. Chấp nhận đồng bộ 1 lần/ngày, làm tay 2 phút.
>
> **Pricing:** miễn phí trong gói POS Cafe 3M 1-lần.

## Quy trình 5 bước cho khách (5 phút mỗi ngày)

### 1. Xuất CSV từ KiotViet
Đăng nhập KiotViet → menu **Báo cáo** → **Báo cáo bán hàng theo hàng hoá** (hoặc **theo hoá đơn chi tiết**) → chọn khoảng ngày (mặc định: hôm nay) → nhấn **Xuất Excel** → lưu file `.xlsx` hoặc `.csv`.

> **Lưu ý:** nếu KiotViet chỉ cho xuất `.xlsx`, mở file bằng Excel/LibreOffice → **Save As → CSV UTF-8**. App nhận cả 2 charset (UTF-8 có/không BOM, Windows-1258 chuyển sang UTF-8).

### 2. Mở POS Cafe → tab **Import CSV**
Login PIN owner (mặc định `1234`, đổi sau lần đầu) → bottom-nav hoặc sidebar → **Import CSV**.

### 3. Upload file CSV
Kéo-thả file vào ô upload, hoặc nhấn **Chọn file**.

App tự chạy:
- Bước 1 ✓ Đọc file → ra số dòng + preview 5 dòng đầu
- Bước 2 ✓ Auto-detect format = **KiotViet** (match ≥ 3 cột header)
- Bước 3 ✓ Auto-map cột (xác nhận nếu KiotViet đổi tên cột)
- Bước 4 ✓ Preview list orders → nhấn **Import**

### 4. Verify
Sau khi import:
- Tab **Đơn hàng** → có các đơn KiotViet với prefix `IMP-` hoặc số HD gốc
- Tab **Tổng quan** → doanh thu cập nhật ngay
- Tab **Kho** → tồn nguyên liệu tự trừ theo recipe (nếu sản phẩm có recipe)

### 5. Tự động hoá (option)
Bật **Telegram bot** ở Cài đặt → mỗi 23h app nhắc qua tin nhắn: "Đã import CSV hôm nay chưa?"

## Format CSV KiotViet hỗ trợ

App dùng preset `modules/import/mappings/kiotviet.json`. Các cột nhận diện:

| Trường nội bộ | Header KiotViet (alias) |
|---|---|
| `order_no` | Mã đơn / Mã hóa đơn / Mã hoá đơn |
| `created_at` | Thời gian / Ngày bán / Ngày tạo |
| `customer` | Khách hàng / Tên khách |
| `product_name` | Tên hàng hóa / Tên sản phẩm / Sản phẩm |
| `qty` | Số lượng / SL |
| `unit_price` | Đơn giá / Giá bán |
| `line_total` | Thành tiền / Tổng tiền hàng |
| `discount` | Giảm giá / Chiết khấu |
| `total` | Tổng tiền / Tổng cộng / Thành tiền hóa đơn |
| `payment_method` | Phương thức thanh toán / Hình thức TT |
| `note` | Ghi chú |

**Format ngày hỗ trợ:** `DD/MM/YYYY HH:mm`, `DD/MM/YYYY HH:mm:ss`, `DD/MM/YYYY`, `YYYY-MM-DD HH:mm:ss`.

**Mapping phương thức thanh toán:** Tiền mặt → cash, Chuyển khoản → transfer, Thẻ → card, QR / QR Code → qr.

## Tính chất idempotent

Mỗi `order_no` (theo cặp `branch_id + order_no`) chỉ import 1 lần. Nếu khách lỡ upload trùng file, đơn cũ KHÔNG nhân đôi — chỉ báo "skipped: N".

## Self-test trước khi gặp khách

Mở file `test/kiotviet-csv-test.html` trong trình duyệt (file local, không cần server):

```
file:///D:/MOHINH_AI_FIRST_ECOSYNTECHGLOBAL/ecosyntech-pos-cafe/test/kiotviet-csv-test.html
```

Nhấn **Chạy toàn bộ 5 test** → kỳ vọng **5/5 PASS**. Nếu fail bất kỳ:
- T1 fail → đường dẫn `seed/sample-kiotviet-export.csv` sai → check `.nojekyll` + Pages config
- T2 fail → BOM hoặc encoding lạ → check `csv-parser.js:11` BOM strip
- T3 fail → KiotViet đổi tên header → update `kiotviet.json:detect_headers`
- T4 fail → cột mới → bổ sung alias trong `kiotviet.json:fields`
- T5 fail → group/total tính sai → check `import-wizard.js:groupByOrder`

## Troubleshooting

| Triệu chứng | Nguyên nhân khả dĩ | Fix |
|---|---|---|
| Upload xong báo "0 orders" | File trống / header không match | Mở CSV bằng Notepad++, check cột |
| Ngày = "Invalid Date" | KiotViet đổi format ngày | Thêm format mới vào `kiotviet.json:date_formats` |
| Doanh thu lệch tổng | Một số dòng có declared_total inconsistent | Kiểm tra cột "Tổng cộng" — bình thường lấy max |
| Tồn kho không trừ | Sản phẩm chưa có recipe | Vào Menu → Recipe → khai báo |
| Tên sản phẩm khác → tạo mới? | Hiện tại match exact theo `name` | Roadmap V2.6: fuzzy match + alias table |

## Giới hạn hiện tại

- **Match sản phẩm theo tên exact** (case-sensitive). Khách phải đảm bảo tên KiotViet ≡ tên POS Cafe. Nếu khác → đơn vẫn import nhưng `product_id = null`, tồn kho không trừ.
- **Variants không tách**: KiotViet export "Trà sữa size L" thành 1 dòng → POS Cafe coi như sản phẩm độc lập, không liên kết với variant group.
- **Chiết khấu cấp đơn**: nếu KiotViet đặt discount ở dòng đầu, app dùng max — chính xác ~99% case.

Phương án realtime → xem [INTEGRATION_KIOTVIET_WEBHOOK.md](INTEGRATION_KIOTVIET_WEBHOOK.md).
