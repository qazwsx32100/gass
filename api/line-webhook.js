import crypto from 'node:crypto';
import { callAiWithFailover } from './_ai-rotator.js';
import { sendJson } from './_auth.js';
import { fetchWithTimeout } from './_fetch.js';
import { sendTelegramMessage, getTelegramConfig } from './_telegram.js';

const SYSTEM_PROMPT = `您是「盛隆瓦斯」的專屬 AI 智能客服小助手。
【基本資訊】
- 店名：盛隆瓦斯行
- 營業項目：家用與商用液化石油氣配送（傳統 20kg、16kg、4kg，以及新型安全防爆複合鋼瓶）
- 服務宗旨：準時配送、安全安檢、親切服務

【回覆準則】
1. 語氣：親切、熱心、專業、帶有台灣在地服務人情味。
2. 客戶想「叫瓦斯 / 訂瓦斯」時：
   - 請禮貌詢問「配送地址、樓層（是否有電梯）、所需公斤數（如 20kg / 16kg）與桶數」。
   - 告知師傅將盡速安排配送，並提醒可準備空桶交換。
3. 安全警示（重要）：
   - 若客戶提及「聞到瓦斯味」、「懷疑漏氣」，必須第一時間嚴肅提醒：
     「⚠️ 請立即關閉瓦斯鋼瓶開關、輕輕打開窗戶保持通風，切勿開關任何電燈與電器開關，並迅速移至戶外安全處！」
4. 複雜業務或人工客服：
   - 若客戶有特殊問題或查詢歷史帳款，請告知可於上班時間由專人為您服務。`;

/**
 * 驗證 LINE 數位簽章
 */
function verifyLineSignature(bodyBuffer, signature, channelSecret) {
  if (!signature || !channelSecret) return false;
  const hash = crypto
    .createHmac('sha256', channelSecret)
    .update(bodyBuffer)
    .digest('base64');
  return hash === signature;
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

  // 若有設定 Channel Secret 則進行簽名校驗
  if (channelSecret && signature) {
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

        // 呼叫雲端 AI 輪調中心 (Gemini 1 -> 2 -> 3 -> OpenAI 備援)
        const aiResult = await callAiWithFailover({
          prompt: userText,
          systemInstruction: SYSTEM_PROMPT,
          temperature: 0.6,
          preferredModel: 'gemini-2.5-flash'
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

        // 若訊息疑似叫瓦斯訂單，同步發送 Telegram 通知給師傅群組
        if (/叫瓦斯|訂瓦斯|送瓦斯|送一桶|送兩桶|瓦斯沒了|換瓦斯/i.test(userText)) {
          const { orderChatId, isConfigured } = getTelegramConfig();
          if (isConfigured && orderChatId) {
            const tgMsg = `🔔 *【LINE 客服 - 叫瓦斯訊息提示】*\n\n👤 *客戶內容*：\n${userText}\n\n🤖 *AI 已自動回覆*：\n${aiResult.text.slice(0, 150)}...\n\n_請值班同仁注意是否有地址與訂購需求！_`;
            sendTelegramMessage(orderChatId, tgMsg).catch(() => {});
          }
        }
      } catch (err) {
        console.error('[LINE Webhook AI 處理失敗]:', err);
        if (channelAccessToken) {
          await replyLineMessage(replyToken, [{
            type: 'text',
            text: '您好，目前系統忙碌中，您的訊息已送達，專人將盡速為您服務！如需緊急送氣歡迎直接來電，謝謝您！'
          }], channelAccessToken).catch(() => {});
        }
      }
    }
  }
}
