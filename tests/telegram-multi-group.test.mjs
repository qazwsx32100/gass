import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatOrderText,
  getTelegramConfig,
  sendErrorAlert,
  sendOrderNotification,
  sendSystemReport
} from '../api/_telegram.js';
import telegramWebhookHandler from '../api/telegram-webhook.js';

test('Telegram: formatOrderText retains exact layout and fields', () => {
  const payload = {
    customerName: '陳先生',
    phone: '0912345678',
    address: '台北市信義區信義路五段7號',
    items: [
      { name: '20kg 瓦斯', quantity: 2 },
      { name: '16kg 瓦斯', quantity: 1 }
    ],
    discount: 50,
    total: 2400,
    note: '放門口即可'
  };

  const formatted = formatOrderText(payload);
  assert.match(formatted, /📦 \*【盛隆瓦斯 - 收到 LINE 新訂單】\*/);
  assert.match(formatted, /👤 \*客戶姓名\*：陳先生/);
  assert.match(formatted, /📞 \*聯絡電話\*：0912345678/);
  assert.match(formatted, /📍 \*配送地址\*：台北市信義區信義路五段7號/);
  assert.match(formatted, /⚡ \*叫貨規格\*：20kg 瓦斯 × 2, 16kg 瓦斯 × 1/);
  assert.match(formatted, /💰 \*應收金額\*：\$2400 \(已折抵 \$50\)/);
  assert.match(formatted, /📝 \*備註\*：放門口即可/);
});

test('Telegram: getTelegramConfig resolves multi-group chat IDs with fallback', () => {
  const originalEnv = { ...process.env };
  try {
    process.env.TELEGRAM_BOT_TOKEN = 'test_token_123';
    process.env.ADMIN_CHAT_ID = '-100fallback';
    process.env.TELEGRAM_ORDER_CHAT_ID = '-100order';
    process.env.TELEGRAM_ALERT_CHAT_ID = '-100alert';
    process.env.TELEGRAM_REPORT_CHAT_ID = '-100report';

    const config = getTelegramConfig();
    assert.equal(config.token, 'test_token_123');
    assert.equal(config.orderChatId, '-100order');
    assert.equal(config.alertChatId, '-100alert');
    assert.equal(config.reportChatId, '-100report');
    assert.equal(config.isConfigured, true);

    delete process.env.TELEGRAM_ORDER_CHAT_ID;
    const fallbackConfig = getTelegramConfig();
    assert.equal(fallbackConfig.orderChatId, '-100fallback');
  } finally {
    process.env = originalEnv;
  }
});

test('Telegram: sendOrderNotification dispatches to order group and report center with action buttons', async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  const requests = [];

  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    requests.push({ url, body });
    return {
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 1234 } })
    };
  };

  try {
    process.env.TELEGRAM_BOT_TOKEN = 'test_token';
    process.env.TELEGRAM_ORDER_CHAT_ID = '-100order_chat';
    process.env.TELEGRAM_REPORT_CHAT_ID = '-100report_chat';

    await sendOrderNotification({
      customerName: '林小姐',
      phone: '0988777666',
      address: '台北市大安區新生南路二段1號',
      items: [{ name: '20kg', quantity: 1 }],
      total: 850
    });

    assert.equal(requests.length, 2);
    const orderReq = requests.find(r => r.body.chat_id === '-100order_chat');
    const reportReq = requests.find(r => r.body.chat_id === '-100report_chat');

    assert.ok(orderReq, 'Order request sent to Order Chat');
    assert.ok(reportReq, 'Order request sent to Report Center');

    // 檢查按鈕包含 Google Maps 導航、歷史紀錄與接單確認
    const keyboard = orderReq.body.reply_markup.inline_keyboard;
    const navButtons = keyboard[0];
    const ackButtons = keyboard[1];

    assert.equal(navButtons[0].text, '🗺️ 地圖導航');
    assert.match(navButtons[0].url, /google\.com\/maps\/search/);
    assert.equal(navButtons[1].text, '📜 歷史紀錄');
    assert.match(navButtons[1].url, /\/api\/customer-history\?phone=0988777666/);

    assert.equal(ackButtons[0].text, '✅ 接單確認');
    assert.match(ackButtons[0].callback_data, /^act:ack_order:/);
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
  }
});

test('Customer History API: returns customer history HTML and JSON format', async () => {
  const customerHistoryHandler = (await import('../api/customer-history.js')).default;

  // 測試 HTML 輸出
  let htmlOutput = '';
  const mockHtmlRes = {
    setHeader: () => mockHtmlRes,
    status: () => mockHtmlRes,
    end: (content) => { htmlOutput = content; }
  };
  await customerHistoryHandler({ method: 'GET', url: '/api/customer-history?phone=0912345678&name=王大明' }, mockHtmlRes);
  assert.match(htmlOutput, /盛隆瓦斯/);
  assert.match(htmlOutput, /王大明/);
  assert.match(htmlOutput, /歷史訂單紀錄清單/);

  // 測試 JSON 格式輸出
  let jsonOutput = null;
  const mockJsonRes = {
    setHeader: () => mockJsonRes,
    status: () => mockJsonRes,
    end: (content) => { jsonOutput = JSON.parse(content); }
  };
  await customerHistoryHandler({ method: 'GET', url: '/api/customer-history?phone=0912345678&name=王大明&format=json' }, mockJsonRes);
  assert.equal(jsonOutput.ok, true);
  assert.ok(Array.isArray(jsonOutput.orders));
});

test('Telegram: sendErrorAlert sends troubleshooting buttons to alert group and report center', async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  const requests = [];

  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    requests.push({ url, body });
    return {
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 5678 } })
    };
  };

  try {
    process.env.TELEGRAM_BOT_TOKEN = 'test_token';
    process.env.TELEGRAM_ALERT_CHAT_ID = '-100alert_chat';
    process.env.TELEGRAM_REPORT_CHAT_ID = '-100report_chat';

    await sendErrorAlert({
      title: 'Google Drive 備份中斷',
      error: new Error('Google Drive quota exceeded'),
      source: 'Cron 每日備份',
      errorType: 'backup',
      actionId: 'bk_999'
    });

    assert.equal(requests.length, 2);
    const alertReq = requests.find(r => r.body.chat_id === '-100alert_chat');
    assert.ok(alertReq);

    const keyboard = alertReq.body.reply_markup.inline_keyboard;
    assert.equal(keyboard[0][0].text, '🔄 一鍵重試備份');
    assert.equal(keyboard[0][0].callback_data, 'act:retry_backup:bk_999');
    assert.equal(keyboard[0][1].text, '🩺 測試 Drive 連線');
    assert.equal(keyboard[1][0].text, '✅ 標記已排除 (Resolve)');
    assert.equal(keyboard[1][0].callback_data, 'act:resolve:bk_999');
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
  }
});

test('Telegram: sendSystemReport dispatches to report center', async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  const requests = [];

  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    requests.push({ url, body });
    return { ok: true, json: async () => ({ ok: true }) };
  };

  try {
    process.env.TELEGRAM_BOT_TOKEN = 'test_token';
    process.env.TELEGRAM_REPORT_CHAT_ID = '-100report_chat';

    await sendSystemReport({
      title: '每日排程備份成功',
      content: '備份狀態正常'
    });

    assert.equal(requests.length, 1);
    assert.equal(requests[0].body.chat_id, '-100report_chat');
    assert.match(requests[0].body.text, /每日排程備份成功/);
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
  }
});

test('Telegram: webhook handler processes ack_order callback and resolves error callback', async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  const calls = [];

  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ url, body });
    return {
      ok: true,
      json: async () => ({ ok: true })
    };
  };

  try {
    process.env.TELEGRAM_BOT_TOKEN = 'test_token';

    // 模擬點擊「標記排除」
    const mockReq = {
      method: 'POST',
      body: {
        callback_query: {
          id: 'cb_123',
          data: 'act:resolve:err_001',
          from: { username: 'testadmin', first_name: 'Alex' },
          message: {
            chat: { id: -100999 },
            message_id: 4321,
            text: '🚨 【盛隆系統 - 異常告警】'
          }
        }
      }
    };

    let responseData = null;
    const mockRes = {
      setHeader: () => mockRes,
      status: () => mockRes,
      end: (d) => { responseData = JSON.parse(d); }
    };

    await telegramWebhookHandler(mockReq, mockRes);
    assert.equal(responseData.ok, true);
    assert.equal(responseData.action, 'error_resolved');

    // 驗證發送 answerCallbackQuery
    const answerCall = calls.find(c => c.url.includes('answerCallbackQuery'));
    assert.ok(answerCall);

    // 驗證原地更新 editMessageText
    const editCall = calls.find(c => c.url.includes('editMessageText'));
    assert.ok(editCall);
    assert.match(editCall.body.text, /✅ \*【異常已排除】\*/);
    assert.match(editCall.body.text, /Alex/);
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
  }
});
