import { fetchWithTimeout } from './_fetch.js';

/**
 * 取得 Telegram 環境設定
 * 支援分流群組：
 * 1. TELEGRAM_REPORT_CHAT_ID: 匯報中心（全域通知 + 一鍵排錯）
 * 2. TELEGRAM_ORDER_CHAT_ID: 訂單群組（僅限新訂單 + 導航/撥號/接單按鈕）
 * 3. TELEGRAM_ALERT_CHAT_ID: 回報群組（僅限錯誤/異常告警 + 一鍵排錯按鈕）
 */
export const getTelegramConfig = () => {
  const token = process.env.TELEGRAM_BOT_TOKEN || '';
  const fallbackChatId = process.env.ADMIN_CHAT_ID || process.env.TELEGRAM_CHAT_ID || '';

  const reportChatId = process.env.TELEGRAM_REPORT_CHAT_ID || fallbackChatId;
  const orderChatId = process.env.TELEGRAM_ORDER_CHAT_ID || fallbackChatId;
  const alertChatId = process.env.TELEGRAM_ALERT_CHAT_ID || fallbackChatId;

  return {
    token,
    reportChatId,
    orderChatId,
    alertChatId,
    isConfigured: Boolean(token && (reportChatId || orderChatId || alertChatId))
  };
};

/**
 * 發送基礎 Telegram 訊息
 */
export const sendTelegramMessage = async (chatId, text, { replyMarkup = null, parseMode = 'Markdown' } = {}) => {
  const { token } = getTelegramConfig();
  if (!token || !chatId) return null;

  try {
    const payload = {
      chat_id: chatId,
      text,
      parse_mode: parseMode
    };
    if (replyMarkup) {
      payload.reply_markup = replyMarkup;
    }

    const response = await fetchWithTimeout(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }, 5000);

    const data = await response.json();
    return data;
  } catch (error) {
    console.warn(`[Telegram] Send message to ${chatId} failed:`, error.message);
    return null;
  }
};

/**
 * 原地編輯 Telegram 訊息（排錯完成後更新原訊息）
 */
export const editTelegramMessage = async (chatId, messageId, text, { replyMarkup = null, parseMode = 'Markdown' } = {}) => {
  const { token } = getTelegramConfig();
  if (!token || !chatId || !messageId) return null;

  try {
    const payload = {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: parseMode
    };
    if (replyMarkup) {
      payload.reply_markup = replyMarkup;
    }

    const response = await fetchWithTimeout(`https://api.telegram.org/bot${token}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }, 5000);

    return await response.json();
  } catch (error) {
    console.warn(`[Telegram] Edit message ${messageId} in ${chatId} failed:`, error.message);
    return null;
  }
};

/**
 * 格式化訂單文字（100% 保留原有格式樣板）
 */
export const formatOrderText = (orderPayload) => {
  const itemsText = (orderPayload.items || []).map((i) => `${i.name} × ${i.quantity}`).join(', ');
  const discountText = orderPayload.discount > 0 ? ` (已折抵 $${orderPayload.discount})` : '';
  const taipeiTime = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });

  return `📦 *【盛隆瓦斯 - 收到 LINE 新訂單】*
────────────────────────
👤 *客戶姓名*：${orderPayload.customerName || '未填寫'}
📞 *聯絡電話*：${orderPayload.phone || '未填寫'}
📍 *配送地址*：${orderPayload.address || '未填寫'}
⚡ *叫貨規格*：${itemsText || '未選擇規格'}
💰 *應收金額*：$${orderPayload.total || 0}${discountText}
📝 *備註*：${orderPayload.note || '無'}
⏰ *下單時間*：${taipeiTime}
────────────────────────`;
};

export const getAppBaseUrl = () => {
  return (process.env.APP_BASE_URL || process.env.ERP_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://erp-weld-three-96.vercel.app')).replace(/\/$/, '');
};

/**
 * 發送新訂單推播
 * 1. 推播至【訂單群】（附帶導航、歷史紀錄、接單按鈕）
 * 2. 同步推播至【匯報中心】
 */
export const sendOrderNotification = async (orderPayload) => {
  const { orderChatId, reportChatId } = getTelegramConfig();
  const text = formatOrderText(orderPayload);
  const orderId = orderPayload.orderId || `ord_${Date.now()}`;
  const baseUrl = getAppBaseUrl();

  const phone = orderPayload.phone || '';
  const customerName = orderPayload.customerName || '';
  const historyUrl = `${baseUrl}/api/customer-history?phone=${encodeURIComponent(phone)}&name=${encodeURIComponent(customerName)}`;

  // 第一排按鈕：地圖導航 + 查看歷史明細
  const navRow = [];
  if (orderPayload.address) {
    navRow.push({
      text: '🗺️ 地圖導航',
      url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(orderPayload.address)}`
    });
  }
  navRow.push({
    text: '📜 歷史紀錄',
    url: historyUrl
  });

  // 第二排按鈕：接單確認
  const ackRow = [
    {
      text: '✅ 接單確認',
      callback_data: `act:ack_order:${orderId}`
    }
  ];

  const replyMarkup = { inline_keyboard: [navRow, ackRow] };

  const promises = [];
  const targetChats = new Set();

  if (orderChatId) targetChats.add(orderChatId);
  if (reportChatId) targetChats.add(reportChatId);

  for (const chatId of targetChats) {
    promises.push(sendTelegramMessage(chatId, text, { replyMarkup }));
  }

  return Promise.allSettled(promises);
};

/**
 * 發送錯誤/異常告警推播
 * 1. 推播至【回報群】（附帶一鍵排錯按鈕）
 * 2. 同步推播至【匯報中心】（附帶一鍵排錯按鈕）
 */
export const sendErrorAlert = async ({
  title = '系統異常告警',
  error,
  source = 'ERP API',
  errorType = 'general', // 'backup' | 'sync' | 'auth' | 'general'
  actionId = Date.now().toString()
}) => {
  const { alertChatId, reportChatId } = getTelegramConfig();
  const errorMessage = error instanceof Error ? error.message : String(error || '未知錯誤');
  const taipeiTime = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });

  const text = `🚨 *【盛隆系統 - ${title}】*
────────────────────────
⚠️ *錯誤來源*：${source}
📝 *異常訊息*：\`${errorMessage.slice(0, 300)}\`
⏰ *發生時間*：${taipeiTime}
────────────────────────
💡 *可點擊下方按鈕進行排錯與排除：*`;

  // 依錯誤類型生成排錯按鈕
  const keyboard = [];

  if (errorType === 'backup') {
    keyboard.push([
      { text: '🔄 一鍵重試備份', callback_data: `act:retry_backup:${actionId}` },
      { text: '🩺 測試 Drive 連線', callback_data: 'act:test_drive' }
    ]);
  } else if (errorType === 'sync') {
    keyboard.push([
      { text: '🔄 重新同步資料', callback_data: `act:force_sync:${actionId}` },
      { text: '🧹 清除快取', callback_data: 'act:clear_cache' }
    ]);
  } else {
    keyboard.push([
      { text: '🩺 執行系統健檢', callback_data: 'act:diag_system' }
    ]);
  }

  // 共通排除按鈕
  keyboard.push([
    { text: '✅ 標記已排除 (Resolve)', callback_data: `act:resolve:${actionId}` }
  ]);

  const replyMarkup = { inline_keyboard: keyboard };

  const promises = [];
  const targetChats = new Set();

  if (alertChatId) targetChats.add(alertChatId);
  if (reportChatId) targetChats.add(reportChatId);

  for (const chatId of targetChats) {
    promises.push(sendTelegramMessage(chatId, text, { replyMarkup }));
  }

  return Promise.allSettled(promises);
};

/**
 * 發送綜合日報 / 系統狀態至【匯報中心】
 */
export const sendSystemReport = async ({
  title = '系統營運日報',
  content = '',
  _reportType = 'daily'
}) => {
  const { reportChatId } = getTelegramConfig();
  if (!reportChatId) return null;

  const taipeiTime = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
  const text = `🏢 *【盛隆匯報中心 - ${title}】*
────────────────────────
${content}
────────────────────────
⏰ *回報時間*：${taipeiTime}`;

  const keyboard = [
    [
      { text: '🩺 系統健檢', callback_data: 'act:diag_system' },
      { text: '💾 立即備份', callback_data: `act:retry_backup:${Date.now()}` }
    ]
  ];

  return sendTelegramMessage(reportChatId, text, {
    replyMarkup: { inline_keyboard: keyboard }
  });
};
