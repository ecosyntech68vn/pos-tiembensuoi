// ============================================================================
// telegram-bot.js — Daily revenue digest to Telegram chat
// Pattern reused from EcoSynTech GAS V10.3
// ============================================================================
(function (global) {
  'use strict';

  const STORAGE_KEY = 'ecosyntech-pos.telegram-config';

  function getConfig() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch (e) { return {}; }
  }
  function setConfig(cfg) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg || {}));
  }

  async function send(text) {
    const cfg = getConfig();
    if (!cfg.bot_token || !cfg.chat_id) throw new Error('Telegram chưa cấu hình');
    const url = `https://api.telegram.org/bot${cfg.bot_token}/sendMessage`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: cfg.chat_id, text, parse_mode: 'HTML' }),
    });
    if (!r.ok) throw new Error('Telegram send fail: ' + r.status);
    return await r.json();
  }

  async function sendDailyDigest(branchId) {
    const shop = Models.getShop();
    const today = new Date();
    const todayStats = Models.dailyRevenue(branchId, today);
    const yest = Models.yesterdayStats(branchId);
    const best = Models.bestSellers(branchId, Utils.startOfDay(today), Utils.endOfDay(today), 5);
    const lowStock = Models.lowStockWithRunRate(branchId, 30);
    const anomalies = Models.detectAnomalies(branchId);

    const deltaPct = yest.revenue > 0 ? Math.round((todayStats.revenue - yest.revenue) * 100 / yest.revenue) : (todayStats.revenue > 0 ? 100 : 0);
    const deltaIcon = deltaPct >= 0 ? '📈' : '📉';
    const deltaSign = deltaPct >= 0 ? '+' : '';

    const lines = [];
    lines.push(`<b>📊 Báo cáo ${Utils.fmtDateTime(Date.now()).split(' ')[0]} — ${shop.name}</b>`);
    lines.push(`💰 Doanh thu: <b>${Utils.formatVND(todayStats.revenue)}</b> (${deltaIcon} ${deltaSign}${deltaPct}% vs hôm qua)`);
    lines.push(`📦 ${todayStats.orders} đơn`);
    lines.push(`💵 Mặt: ${Utils.formatVND(todayStats.cash)} · QR: ${Utils.formatVND(todayStats.qr)} · Thẻ: ${Utils.formatVND(todayStats.card)}`);

    if (best.length) {
      lines.push('');
      lines.push('<b>🏆 Top bán chạy:</b>');
      best.forEach((b, i) => lines.push(`${i + 1}. ${b.product_name} (${b.qty})`));
    }

    if (lowStock.length) {
      lines.push('');
      lines.push('<b>⚠ Cảnh báo tồn kho:</b>');
      lowStock.slice(0, 5).forEach((l) => {
        const days = l.days_left != null ? `~${l.days_left} ngày` : 'cạn';
        lines.push(`• ${l.name}: còn ${l.stock_current} ${l.unit} (${days})`);
      });
    }

    if (anomalies.length) {
      lines.push('');
      lines.push('<b>🔔 Bất thường:</b>');
      anomalies.slice(0, 3).forEach((a) => lines.push(`${a.icon} ${a.title}: ${a.detail}`));
    } else {
      lines.push('');
      lines.push('✅ Không phát hiện bất thường.');
    }

    return await send(lines.join('\n'));
  }

  /** Build GAS cron payload format. GAS-side template:
   *  1. Tạo Trigger time-based 22h hằng ngày.
   *  2. doGet handler POST tới Telegram API với body từ POS push (lưu vào Sheet).
   *  3. Hoặc dùng UrlFetchApp.fetch(...) trực tiếp trong GAS.
   */
  function gasCronInstructionTemplate(botToken, chatId) {
    return `// ===== EcoSynTech POS — GAS Daily Digest Cron =====
// Đặt trong project GAS đã setup sync. Tạo Time Trigger 22h hằng ngày → chạy hàm sendDailyDigest()
function sendDailyDigest() {
  var sheet = SpreadsheetApp.getActive().getSheetByName('orders');
  if (!sheet) return;
  var today = Utilities.formatDate(new Date(), 'GMT+7', 'yyyy-MM-dd');
  var rows = sheet.getDataRange().getValues();
  var head = rows[0];
  var idxCreated = head.indexOf('created_at');
  var idxTotal = head.indexOf('total');
  var idxStatus = head.indexOf('status');
  var revenue = 0, count = 0;
  for (var i = 1; i < rows.length; i++) {
    var ts = new Date(rows[i][idxCreated]);
    var d = Utilities.formatDate(ts, 'GMT+7', 'yyyy-MM-dd');
    if (d === today && rows[i][idxStatus] === 'paid') {
      revenue += Number(rows[i][idxTotal]) || 0;
      count++;
    }
  }
  var msg = '📊 Báo cáo ngày ' + today + '\\n' +
            '💰 Doanh thu: ' + revenue.toLocaleString('vi-VN') + 'đ\\n' +
            '📦 ' + count + ' đơn';
  UrlFetchApp.fetch('https://api.telegram.org/bot${botToken}/sendMessage', {
    method: 'post',
    payload: { chat_id: '${chatId}', text: msg, parse_mode: 'HTML' }
  });
}`;
  }

  /** Send to a specific shop's telegram config (per-shop, V2.4) — non-blocking */
  async function sendForShop(shop, text) {
    if (!shop || !shop.telegram_notify_enabled || !shop.telegram_bot_token || !shop.telegram_chat_id) return null;
    const url = `https://api.telegram.org/bot${shop.telegram_bot_token}/sendMessage`;
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: shop.telegram_chat_id, text, parse_mode: 'HTML' }),
      });
      return r.ok ? await r.json() : null;
    } catch (e) {
      console.warn('[telegram] sendForShop fail', e.message);
      return null;
    }
  }

  /** Notify shop owner when an order auto-paid via Sepay */
  async function notifyOrderPaid(shop, order, sepayTx) {
    const tableLabel = order.table_number ? `Bàn ${order.table_number}` : 'Quầy';
    const txId = (sepayTx && (sepayTx.id || sepayTx.reference_number || sepayTx.bank_brand_name)) || '';
    const lines = [
      `<b>✅ Đơn ${order.order_no}</b>`,
      `🏷 ${tableLabel}`,
      `💰 <b>${Utils.formatVND(order.total)}</b>`,
      `💳 Sepay${txId ? ' #' + txId : ''}`,
      `⏰ ${Utils.fmtDateTime(Date.now())}`,
    ];
    return await sendForShop(shop, lines.join('\n'));
  }

  global.TelegramBot = { getConfig, setConfig, send, sendDailyDigest, gasCronInstructionTemplate, sendForShop, notifyOrderPaid };
})(window);
