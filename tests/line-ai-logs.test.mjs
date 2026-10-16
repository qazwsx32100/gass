import test from 'node:test';
import assert from 'node:assert/strict';
import { recordLineAiChat, fetchLineAiLogs } from '../api/_line-ai-logger.js';

test('LineAiLogger: recordLineAiChat records and retrieves chat from fallback cache', async () => {
  const testUserId = `test-user-${Date.now()}`;
  const testMsg = '老闆請問20公斤瓦斯多少錢？';
  const testReply = '您好！20公斤瓦斯目前每桶定價850元，請問您的配送地址是哪邊呢？';

  await recordLineAiChat({
    lineUserId: testUserId,
    userMessage: testMsg,
    aiReply: testReply,
    aiResult: {
      accountName: 'qaz',
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      tokens: 120,
      latencyMs: 350,
      failoverCount: 0
    },
    isOrderIntent: false,
    status: 'success'
  });

  const res = await fetchLineAiLogs({ userId: testUserId });
  assert.equal(res.ok, true);
  assert.ok(Array.isArray(res.logs));
  assert.ok(res.logs.length >= 1);

  const found = res.logs.find(l => l.line_user_id === testUserId);
  assert.ok(found, 'Should find the recorded message');
  assert.equal(found.user_message, testMsg);
  assert.equal(found.ai_reply, testReply);
  assert.equal(found.model, 'gemini-3.8-flash');
  assert.equal(found.is_order_intent, false);
});

test('LineAiLogger: correctly filters orderIntent and search keywords', async () => {
  const uidOrder = `order-user-${Date.now()}`;
  const uidNormal = `normal-user-${Date.now()}`;

  await recordLineAiChat({
    lineUserId: uidOrder,
    userMessage: '我要送瓦斯到板橋中山路二段88號3樓',
    aiReply: '收到！馬上為您安排師傅配送20公斤瓦斯！',
    isOrderIntent: true
  });

  await recordLineAiChat({
    lineUserId: uidNormal,
    userMessage: '請問你們營業時間到幾點？',
    aiReply: '我們的營業時間為每日早上 07:00 至晚上 21:00 全年無休為您服務！',
    isOrderIntent: false
  });

  // Filter only orders
  const ordersOnly = await fetchLineAiLogs({ isOrderIntent: true });
  assert.equal(ordersOnly.ok, true);
  assert.ok(ordersOnly.logs.every(l => l.is_order_intent === true));

  // Search keyword
  const searchAddress = await fetchLineAiLogs({ search: '板橋中山路' });
  assert.equal(searchAddress.ok, true);
  assert.ok(searchAddress.logs.some(l => l.user_message.includes('板橋中山路')));
});

test('LineAiLogger: multi-turn context reconstruction preserves chronological message order', async () => {
  const multiUserId = `multi-user-${Date.now()}`;

  // Turn 1
  await recordLineAiChat({
    lineUserId: multiUserId,
    userMessage: '我家在三重正義北路100號',
    aiReply: '請問是幾樓呢？是否有電梯？',
    isOrderIntent: true
  });

  // Turn 2
  await recordLineAiChat({
    lineUserId: multiUserId,
    userMessage: '3樓沒有電梯',
    aiReply: '好的，3樓爬樓梯會為您試算樓層費，請問需要哪種規格的瓦斯？',
    isOrderIntent: true
  });

  const res = await fetchLineAiLogs({ userId: multiUserId, limit: 4 });
  assert.equal(res.ok, true);
  assert.equal(res.logs.length, 2);

  // 反轉為時間正序
  const chrono = [...res.logs].reverse();
  const messages = [];
  for (const log of chrono) {
    if (log.user_message) messages.push({ role: 'user', content: log.user_message });
    if (log.ai_reply) messages.push({ role: 'assistant', content: log.ai_reply });
  }

  // 加入最新第 3 輪
  messages.push({ role: 'user', content: '送一桶20公斤' });

  assert.equal(messages.length, 5);
  assert.equal(messages[0].content, '我家在三重正義北路100號');
  assert.equal(messages[1].content, '請問是幾樓呢？是否有電梯？');
  assert.equal(messages[2].content, '3樓沒有電梯');
  assert.equal(messages[3].content, '好的，3樓爬樓梯會為您試算樓層費，請問需要哪種規格的瓦斯？');
  assert.equal(messages[4].content, '送一桶20公斤');
});
