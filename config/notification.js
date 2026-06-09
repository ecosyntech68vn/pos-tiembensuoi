// ============================================================================
// config/notification.js — Telegram bot báo doanh thu cuối ngày
// ============================================================================
window.NOTIFICATION = {
  telegram: {
    enabled: false,
    // Tạo bot qua @BotFather → lấy token
    bot_token: '',
    // chat_id cá nhân hoặc group (thêm bot vào group rồi xem chat_id qua getUpdates)
    chat_id: '',
    // Gửi cuối ngày lúc mấy giờ (24h, local)
    daily_send_hour: 22,
    daily_send_minute: 30,
  },
};
