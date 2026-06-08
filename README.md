# POS Cafe

Phần mềm bán hàng cho quán cafe / trà sữa nhỏ. **Offline-first**, chạy thẳng trong trình duyệt — không cần server, không cần cài đặt phức tạp.

Built by **EcoSynTech Global** cho quán cafe Việt.

---

## Đặc điểm chính

- **Dashboard quản lý** — 6 KPI cards + biểu đồ 30 ngày + cảnh báo tồn + bất thường.
- **2 workflow** — dùng POS app này HOẶC import CSV từ KiotViet/Sapo/iPos/Misa.
- **Auto-trừ kho theo công thức** — bán 1 ly trà sữa → tự trừ trà + sữa + đường + đá theo recipe.
- **Mở bằng trình duyệt Chrome / Safari trên iPad, máy tính** — không cài app store.
- **Không cần mạng để bán hàng** — đơn vẫn lưu, đồng bộ lại khi có Wi-Fi.
- **Cài như app riêng (PWA)** trên iPad / Android tablet.
- **Sao lưu 1 cú nhấp** ra file .db, lưu USB hoặc Google Drive.
- **Báo doanh thu cuối ngày qua Telegram** (tuỳ chọn) — kèm top bán chạy + cảnh báo tồn + bất thường.
- **Đồng bộ Google Sheets** qua Google Apps Script (tuỳ chọn).

## Bắt đầu nhanh

1. Mở `index.html` trong Chrome (hoặc URL Pages do người cung cấp).
2. Đăng nhập PIN: **Chủ quán 1234**, **Nhân viên 5678** (đổi ngay sau lần đầu trong Cài đặt).
3. Vào **Cài đặt → Thông tin quán**: điền tên quán, địa chỉ, SĐT, upload logo.
4. Vào **Menu**: điều chỉnh 30 sản phẩm mẫu hoặc thêm sản phẩm thật.
5. Quay lại **Bán hàng** — bắt đầu nhận đơn.

> Chi tiết: xem `HANDOFF_KIT/INSTALL_TABLET.md` và `docs/OWNER_MANUAL.md`.

## Cấu trúc thư mục

```
ecosyntech-pos-cafe/
├── index.html               # Entry — mở file này
├── manifest.json            # PWA manifest
├── service-worker.js        # Offline cache
├── config/                  # Chủ quán tự sửa: VAT, payment, printer, Telegram
├── modules/                 # Mã nguồn theo module: core, auth, pos, sync...
├── seed/                    # Menu mẫu + nguyên liệu mẫu
├── assets/                  # Icon, logo
├── docs/                    # Hướng dẫn người dùng + dev
├── HANDOFF_KIT/             # Bộ tài liệu bàn giao cho khách hàng
└── LICENSE                  # Proprietary license
```

## Tài liệu

- **Chủ quán**: `docs/OWNER_MANUAL.md`
- **Nhân viên**: `docs/USER_GUIDE.md` (in ra dán cạnh máy POS)
- **Import CSV từ POS khác**: `docs/IMPORT_GUIDE.md`
- **Sao lưu**: `docs/BACKUP_GUIDE.md`
- **Lộ trình mở rộng chi nhánh**: `docs/MULTI_BRANCH_ROADMAP.md`
- **Đối chiếu Excel cũ → app mới**: `docs/MIGRATION_GUIDE.md`
- **Kiến trúc kỹ thuật**: `docs/dev/ARCHITECTURE.md`

## Hỗ trợ

Liên hệ EcoSynTech Global: davidta.ktqd.mba@gmail.com

---

© 2026 EcoSynTech Global · Powered by EcoSynTech Global
