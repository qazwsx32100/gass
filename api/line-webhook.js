import crypto from 'node:crypto';
import { callAiWithFailover } from './_ai-rotator.js';
import { sendJson } from './_auth.js';
import { fetchWithTimeout } from './_fetch.js';
import { getOptimizedSystemPrompt, classifyQueryComplexity } from './_knowledge-base.js';
import { recordLineAiChat } from './_line-ai-logger.js';
import { sendTelegramMessage, getTelegramConfig } from './_telegram.js';

/**
 * 驗證 LINE 數位簽章 (Timing-Safe Equal 防時序攻擊)
 */
export function verifyLineSignature(bodyBuffer, signature, channelSecret) {
  if (!signature || !channelSecret) return false;
  try {
    const hash = crypto
      .createHmac('sha256', channelSecret)
      .update(bodyBuffer)
      .digest('base64');

    const hashBuf = Buffer.from(hash);
    const sigBuf = Buffer.from(signature);
    if (hashBuf.length !== sigBuf.length) return false;
    return crypto.timingSafeEqual(hashBuf, sigBuf);
  } catch {
    return false;
  }
}

/**
 * 透過 LINE Messaging API 回覆訊息
 */
async function replyLineMessage(replyToken, messages, channelAccessToken) {
  if (!replyToken || !channelAccessToken) return;

  const url = 'https://api.line.me/v2/bot/message/reply';
  const payload = {
    replyToken,
    messages: Array.isArray(messages) ? messages : [{ type: 'text', text: messages }]
  };

  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${channelAccessToken}`
    },
    body: JSON.stringify(payload)
  }, 8000);

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error('[LINE Webhook] 回覆失敗:', res.status, errText);
  }
}

/**
 * LINE Messaging API Webhook 端點 (Vercel Serverless Function)
 */
export default async function handler(req, res) {
  if (req.method === 'GET') {
    return sendJson(res, 200, { ok: true, message: '盛隆瓦斯 LINE AI Webhook 端點運行中' });
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { ok: false, message: 'Method Not Allowed' });
  }

  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const signature = req.headers['x-line-signature'];

  // 讀取 Raw Body 以便進行簽章驗證
  let rawBodyBuffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));

  // 若有設定 Channel Secret 則強制嚴格進行簽名校驗
  if (channelSecret) {
    if (!signature) {
      console.warn('[LINE Webhook] 拒絕未附帶簽章之請求');
      return sendJson(res, 401, { ok: false, message: 'Missing Signature' });
    }
    const isValid = verifyLineSignature(rawBodyBuffer, signature, channelSecret);
    if (!isValid) {
      console.warn('[LINE Webhook] 簽章驗證失敗');
      return sendJson(res, 401, { ok: false, message: 'Invalid Signature' });
    }
  }

  const events = req.body?.events || [];

  // 立刻回覆 200 給 LINE 平台避免超時，背景非同步處理訊息
  sendJson(res, 200, { ok: true, count: events.length });

  for (const event of events) {
    // 僅處理文字訊息事件
    if (event.type === 'message' && event.message?.type === 'text') {
      const userText = String(event.message.text || '').trim();
      const replyToken = event.replyToken;
      const userId = event.source?.userId;

      if (!userText || !replyToken) continue;

      try {
        console.log(`[LINE Webhook] 收到來自使用者 [${userId || '未知'}] 的訊息: "${userText}"`);

        const isOrderIntent = /叫瓦斯|訂瓦斯|送瓦斯|送一桶|送兩桶|瓦斯沒了|換瓦斯/i.test(userText);
        const complexityMode = classifyQueryComplexity(userText);
        const isExpert = complexityMode === 'expert';

        // 呼叫雲端 AI 輪調中心 (方案 B 智慧雙模分流 + 真・循環輪調 Round-Robin)
        const aiResult = await callAiWithFailover({
          prompt: userText,
          systemInstruction: getOptimizedSystemPrompt(userText, complexityMode),
          temperature: isExpert ? 0.3 : 0.6,
          preferredModel: 'gemini-3.8-flash',
          strategy: 'round-robin',
          mode: complexityMode
        });

        // 回覆給 LINE 使用者
        if (channelAccessToken) {
          await replyLineMessage(replyToken, [{
            type: 'text',
            text: aiResult.text
          }], channelAccessToken);
        } else {
          console.log('[LINE Webhook (Dry Run)]: LINE_CHANNEL_ACCESS_TOKEN 未設定，AI 回覆文字為:\n', aiResult.text);
        }

        // 自動持久化儲存 LINE AI 對話歷程 (非阻塞)
        recordLineAiChat({
          lineUserId: userId,
          userMessage: userText,
          aiReply: aiResult.text,
          aiResult,
          isOrderIntent,
          status: 'success',
          rawEvent: event
        }).catch(saveErr => {
          console.warn('[LINE Webhook] 儲存對話紀錄失敗 (非致命):', saveErr.message);
        });

        // 若訊息疑似叫瓦斯訂單，同步發送 Telegram 通知給師傅群組
        if (isOrderIntent) {
          const { orderChatId, isConfigured } = getTelegramConfig();
          if (isConfigured && orderChatId) {
            const tgMsg = `🔔 *【LINE 客服 - 叫瓦斯訊息提示】*\n\n👤 *客戶內容*：\n${userText}\n\n🤖 *AI 已自動回覆*：\n${aiResult.text.slice(0, 150)}...\n\n_請值班同仁注意是否有地址與訂購需求！_`;
            sendTelegramMessage(orderChatId, tgMsg).catch(() => {});
          }
        }
      } catch (err) {
        console.error('[LINE Webhook AI 處理失敗]:', err);
        const fallbackText = '您好，目前系統忙碌中，您的訊息已送達，專人將盡速為您服務！如需緊急送氣歡迎直接來電，謝謝您！';
        
        // 記錄異常與回退訊息
        recordLineAiChat({
          lineUserId: userId,
          userMessage: userText,
          aiReply: fallbackText,
          isOrderIntent: /叫瓦斯|訂瓦斯|送瓦斯|送一桶|送兩桶|瓦斯沒了|換瓦斯/i.test(userText),
          status: 'error',
          errorMessage: err.message,
          rawEvent: event
        }).catch(() => {});

        if (channelAccessToken) {
          await replyLineMessage(replyToken, [{
            type: 'text',
            text: fallbackText
          }], channelAccessToken).catch(() => {});
        }
      }
    }
  }
}
