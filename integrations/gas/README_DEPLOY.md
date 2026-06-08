# Deploy `52_KiotVietWebhook.gs` vào EcoSynTech_GAS_V10_3

> File này drop-in. CEO copy nguyên file vào `EcoSynTech_GAS_V10_3/` rồi wire 2 dòng vào `doPost` / `doGet` chính.

## Bước 1 — Copy file

Copy `integrations/gas/52_KiotVietWebhook.gs` → `D:\ECOSYNTECHGLOBAL2026\GAS\EcoSynTech_GAS_V10_3\52_KiotVietWebhook.gs`.

Hoặc trong Google Apps Script editor: **+ → Script** → đặt tên `52_KiotVietWebhook` → paste content.

## Bước 2 — Wire vào router

Tìm function `doPost(e)` chính trong V10.3 (thường ở `00_Main.gs` hoặc `30_Router.gs`). Thêm vào đầu function, trước switch hiện tại:

```javascript
function doPost(e) {
  // KiotViet webhook entrypoint — đặt sớm nhất
  if (e.parameter && e.parameter.kvWebhook === '1') {
    return handleKiotVietPost(e);
  }
  // ... existing code dưới đây giữ nguyên ...
}
```

Tương tự cho `doGet(e)`:

```javascript
function doGet(e) {
  if (e.parameter && e.parameter.action === 'kiotviet-pull') {
    return handleKiotVietPull(e);
  }
  // ... existing code ...
}
```

## Bước 3 — Setup Script Properties

Apps Script editor → ⚙ **Project Settings** → **Script Properties** → **Add script property**:

| Key | Value | Ghi chú |
|---|---|---|
| `KIOTVIET_WEBHOOK_SECRET` | (chạy `adminCreateWebhookSecret` để gen) | Shared với KiotViet |
| `KIOTVIET_PULL_APIKEY_KVB-001` | (chạy `adminCreatePullApiKey` để gen) | 1 key per shop |
| `KIOTVIET_FOLDER_NAME` | `KiotViet_Webhooks_EcoSynTech` | Optional, default OK |

Quick way:
1. Mở `52_KiotVietWebhook.gs` trong editor
2. Chọn function `adminCreateWebhookSecret` → **Run** → xem **Execution log** → copy secret
3. Edit function `adminCreatePullApiKey`, sửa `SHOP_ID = "KVB-001"` thành shopId của khách → **Run** → copy key

## Bước 4 — Deploy Web App

**Deploy → New deployment → Type: Web app**:
- Execute as: **Me (CEO_THUAN)**
- Who has access: **Anyone with link**
- → Click **Deploy** → copy `<exec-url>` (https://script.google.com/macros/s/.../exec)

⚠ Mỗi lần sửa code phải tạo **New version** trong deployment, KHÔNG đổi URL.

## Bước 5 — Smoke test

Apps Script editor → chọn `adminSmokeTest` → **Run**.

→ Mở Google Drive → folder `KiotViet_Webhooks_EcoSynTech` → check file `kiotviet-KVB-DEMO-orders` có 1 dòng test.

## Bước 6 — Đăng ký webhook trên KiotViet

⚠ KiotViet có nhiều gói. Webhook chỉ available ở gói **Premium / Custom**. Verify với KiotViet sales trước khi promise khách.

Trong KiotViet:
- **Cài đặt → Webhook / API → Thêm webhook**
- URL: `<exec-url>?kvWebhook=1&shopId=KVB-001&secret=<KIOTVIET_WEBHOOK_SECRET>`
- Events: `order.created`, `order.update`, `invoice.created`, `invoice.update` (chọn theo KiotViet)
- Phương thức: POST JSON
- Lưu

## Bước 7 — Cấu hình POS Cafe

POS Cafe → **Cài đặt → Tích hợp KiotViet**:
- Mode: **Webhook realtime**
- Shop ID: `KVB-001`
- Pull API Key: `<key từ adminCreatePullApiKey>`
- GAS Endpoint: `<exec-url>` (KHÔNG kèm `?action=`, app tự thêm)
- Interval poll: 5 phút
- → **Test connection** → kỳ vọng `✓ 0 đơn (rỗng OK)` → **Lưu**

## Verify end-to-end

1. Bán 1 đơn trên KiotViet
2. Đợi tối đa 5 phút (hoặc tới poll interval đã set)
3. POS Cafe → tab **Đơn hàng** → đơn mới xuất hiện với prefix `KV-`
4. Dashboard cập nhật doanh thu
5. Tồn kho trừ tự động theo recipe (nếu product có recipe)

## Troubleshooting

| Triệu chứng | Nguyên nhân khả dĩ | Fix |
|---|---|---|
| Webhook KiotViet báo 200 nhưng Sheet trống | Secret sai | Re-check Script Properties |
| Smoke test fail "permission denied" | Chưa authorize Drive scope | Run lại function, accept OAuth prompt |
| POS Test connection báo `unauthorized` | Pull API Key sai | Copy lại key từ Script Properties |
| POS không thấy đơn nhưng Sheet có | `since` timestamp sai | Clear `localStorage.kv_last_sync_ts` trong POS DevTools |
| Đơn trùng lặp | `_kvOrderExists` cache stale | Restart deployment, refresh cache |

## Rollback

Nếu webhook gây vấn đề:
1. Trong KiotViet → tắt webhook (hoặc đổi URL về cũ)
2. Trong Apps Script → Deploy → **Manage deployments** → archive version mới
3. POS Cafe Settings → tắt "Webhook realtime", fallback sang **CSV daily**

POS Cafe LUÔN có CSV daily fallback → KHÔNG vỡ vận hành kể cả khi GAS/Webhook down.

## Hard rules đã áp dụng

- KHÔNG hardcode secret (đọc từ Script Properties)
- Auth shared secret + per-shop pull key
- Idempotent: dedupe theo Code trước khi append
- Append-only Sheet (không update/delete) → audit trail clean
- Audit log trong sheet `kiotviet-_system-audit` cho mọi auth fail
- Cell limit 50k chars → details_json bị truncate 49k để an toàn

## ⚠ Pre-go-live checklist

- [ ] Verify schema payload KiotViet (Notifications[].Action / .Data[]) với docs.kiotapi.com mới nhất
- [ ] Chạy `adminSmokeTest` PASS
- [ ] Webhook KiotViet trỏ đúng `<exec-url>?kvWebhook=1&shopId=...&secret=...`
- [ ] POS Cafe test connection PASS
- [ ] Bán 1 đơn thật trên KiotViet → đợi 5 phút → POS thấy đơn
- [ ] Bán đơn thứ 2 → POS chỉ thấy đơn 2, KHÔNG duplicate đơn 1 (idempotent OK)
- [ ] Tắt GAS deployment → POS vẫn hoạt động bình thường (non-blocking OK)
- [ ] Bật lại GAS → poll tiếp tục, không miss đơn
