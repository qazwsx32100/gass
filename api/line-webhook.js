import crypto from 'node:crypto';
import { callAiWithFailover } from './_ai-rotator.js';
import { sendJson } from './_auth.js';
import { fetchWithTimeout } from './_fetch.js';
import { getOptimizedSystemPrompt, classifyQueryComplexity } from './_knowledge-base.js';
import { recordLineAiChat, fetchLineAiLogs } from './_line-ai-logger.js';
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
 * 智慧解析多輪對話中的訂單關鍵要素 (地址、電話、規格數量、樓層電梯)
 */
export function extractOrderEntities(messages = [], currentText = '') {
  // 將最新輸入與歷史紀錄按「由新到舊」順序排列，確保最新提供的資訊具備最高優先級，歷史資訊絕不漏失
  const revHistory = [...messages].reverse().map(m => m.content || m.text || '');
  const allTextsList = [currentText, ...revHistory].filter(Boolean);
  const combined = allTextsList.join('\n');

  // 1. 電話 (新 -> 舊)
  let phone = null;
  for (const txt of allTextsList) {
    const phoneMatch = txt.match(/(09\d{2}[-\s]?\d{3}[-\s]?\d{3}|02[-\s]?\d{4}[-\s]?\d{4}|09\d{8})/);
    if (phoneMatch) {
      phone = phoneMatch[0].replace(/\s+/g, '');
      break;
    }
  }

  // 2. 規格與數量 (新 -> 舊)
  let spec = null;
  let quantity = 1;
  for (const txt of allTextsList) {
    const specMatch = txt.match(/(20|16|10|4)\s*(公斤|kg|KG)|大桶|小桶/i);
    if (specMatch) {
      spec = specMatch[0];
      const qtyMatch = txt.match(/([一二三兩四1-4])\s*桶/);
      if (qtyMatch) {
        const qStr = qtyMatch[1];
        quantity = (qStr === '一' || qStr === '1') ? 1 : (qStr === '二' || qStr === '兩' || qStr === '2') ? 2 : (qStr === '三' || qStr === '3') ? 3 : (qStr === '四' || qStr === '4') ? 4 : 1;
      }
      break;
    }
  }

  // 3. 樓層與電梯 (新 -> 舊)
  let floor = null;
  for (const txt of allTextsList) {
    const floorMatch = txt.match(/([1-9一二三四五六七八九十])\s*樓/);
    if (floorMatch) {
      floor = floorMatch[0];
      break;
    }
  }
  const hasElevator = /有電梯|電梯大樓|電梯/.test(combined);
  const noElevator = /沒電梯|無電梯|爬樓梯|走樓梯/.test(combined);
  let elevatorInfo = null;
  if (noElevator) elevatorInfo = '無電梯';
  else if (hasElevator) elevatorInfo = '有電梯';

  // 4. 地址 (新 -> 舊，支援路/街/巷/弄/段/號/樓與對話前綴脫敏)
  let address = null;
  const taiwanAddrRegex = /((?:(?:新北市|台北市))?(?:(?:三重|新莊|蘆洲|板橋|中和|永和)區?)?[^\s,，。:：\n]+?(?:路|街|大道|巷|弄)(?:[一二三四五六七八九十\d]+段)?(?:\d+巷)?(?:\d+弄)?\s*\d+(?:-\d+)?號(?:之\d+)?(?:\s*[1-9\d一二三四五六七八九十]+樓)?)/;
  for (const txt of allTextsList) {
    const addrMatch = txt.match(taiwanAddrRegex);
    if (addrMatch) {
      address = addrMatch[0]
        .trim()
        .replace(/^(我家在|抱歉更正一下地址，?|更正為|改送到|改送|換送到|送去|送到|請送|送|在|住|地址是|麻煩送|請幫我送)+/, '')
        .trim();
      break;
    }
  }

  const missing = [];
  if (!address) missing.push('配送地址');
  if (!floor) missing.push('樓層');
  if (!spec) missing.push('瓦斯規格與數量');
  if (!phone) missing.push('聯絡電話');

  return {
    phone,
    spec: spec ? `${spec} × ${quantity}桶` : null,
    floor: floor ? (elevatorInfo ? `${floor} (${elevatorInfo})` : floor) : (elevatorInfo || null),
    address,
    missing,
    isComplete: Boolean(phone && spec && (address || floor))
  };
}

/**
 * 格式化訂單狀態要素上下文提示詞
 */
/**
 * 建立同步至調度中心 (/api/line-orders/pending) 之預備叫貨單結構 (Step 6 雙向閉環)
 */
export function buildLinePendingOrderPayload(extracted, userText = '', lineUserId = '') {
  if (!extracted || !extracted.isComplete) return null;
  const specText = String(extracted.spec || '20kg × 1桶');
  const qtyMatch = specText.match(/×\s*(\d+)桶/);
  const quantity = qtyMatch ? Number(qtyMatch[1]) || 1 : 1;
  return {
    action: 'capture',
    phone: extracted.phone || '',
    address: extracted.address || '',
    floor: extracted.floor || '',
    spec: specText,
    quantity,
    rawText: String(userText || '').trim(),
    lineUserId: String(lineUserId || '').trim(),
    customerName: 'LINE 智慧擷取客戶',
  };
}

export function formatOrderStateContext(extracted) {
  if (!extracted || (!extracted.address && !extracted.floor && !extracted.spec && !extracted.phone)) {
    return '';
  }
  const missingPrompts = [];
  if (!extracted.address) missingPrompts.push('配送地址（路名、門牌）');
  if (!extracted.floor) missingPrompts.push('樓層（是否有電梯）');
  if (!extracted.spec) missingPrompts.push('瓦斯規格（20kg/16kg/10kg/4kg）與桶數');
  if (!extracted.phone) missingPrompts.push('聯絡電話');

  return `【📦 目前系統從對話中自動掌握之訂單要素】
- 配送地址：${extracted.address || '（尚未提供）'}
- 樓層狀況：${extracted.floor || '（尚未提供）'}
- 瓦斯規格：${extracted.spec || '（尚未提供）'}
- 聯絡電話：${extracted.phone || '（尚未提供）'}
${missingPrompts.length > 0
  ? `【⚠️ 待確認資訊】：目前僅缺少「${missingPrompts.join('、')}」，請在回答中親切向客戶確認缺少的項目即可，切勿重複詢問客戶已經說過的資料！`
  : '【🎉 訂單要素已齊全】：所有配送必備資料（地址、樓層、規格、電話）均已收集完畢！請以親切熱情的口吻為客戶總結訂單內容，告知師傅出車前會先致電通知，並提醒現場備妥現金付款與空桶交換！'
}`;
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

  const rawEvents = Array.isArray(req.body?.events) ? req.body.events : [];
  // 防禦批次攻擊：單次 Webhook 批次上限 10 筆，防範惡意偽造洪水攻擊耗盡算力
  const events = rawEvents.slice(0, 10);

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

        // 查詢該用戶最近的對話歷程以構建多輪上下文 (Context Memory)
        const historyMessages = [];
        let hadRecentOrderIntent = false;

        if (userId) {
          try {
            const historyRes = await fetchLineAiLogs({ userId, limit: 10 });
            if (historyRes?.ok && Array.isArray(historyRes.logs) && historyRes.logs.length > 0) {
              // fetchLineAiLogs 預設為時間倒序 (新 -> 舊)，需反轉為對話先後順序
              const pastLogs = [...historyRes.logs].reverse();
              for (const log of pastLogs) {
                if (log.is_order_intent) hadRecentOrderIntent = true;
                if (log.user_message) {
                  historyMessages.push({ role: 'user', content: log.user_message });
                }
                if (log.ai_reply) {
                  historyMessages.push({ role: 'assistant', content: log.ai_reply });
                }
              }
            }
          } catch (histErr) {
            console.warn('[LINE Webhook] 讀取對話歷程異常 (非致命):', histErr.message);
          }
        }

        const messages = [...historyMessages, { role: 'user', content: userText }];

        // 自動解析多輪對話中掌握之訂單要素 (地址、樓層、規格、電話)
        const extracted = extractOrderEntities(messages, userText);
        const orderStateContext = formatOrderStateContext(extracted);

        const currentIsOrder = /叫瓦斯|訂瓦斯|送瓦斯|送一桶|送兩桶|瓦斯沒了|換瓦斯/i.test(userText);
        // 若上一句在叫瓦斯且本句提供地址/樓層/電話，延續叫瓦斯意圖
        const isOrderIntent = currentIsOrder || (hadRecentOrderIntent && /(路|街|巷|弄|號|樓|電梯|電話|09\d{8})/i.test(userText));

        const complexityMode = classifyQueryComplexity(userText);
        const isExpert = complexityMode === 'expert';

        // 呼叫雲端 AI 輪調中心 (方案 B 智慧雙模分流 + 真・循環輪調 Round-Robin)
        const aiResult = await callAiWithFailover({
          prompt: userText,
          messages,
          systemInstruction: getOptimizedSystemPrompt(userText, complexityMode, orderStateContext),
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
            let tgMsg = '';
            if (extracted.isComplete) {
              if (process.env.SHENGLONG_SYNC_LINE_ORDERS === '1' || process.env.VERCEL) {
                const pendingPayload = buildLinePendingOrderPayload(extracted, userText, userId);
                if (pendingPayload) {
                  fetchWithTimeout('https://shenglong-next-phi.vercel.app/api/line-orders/pending', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(pendingPayload)
                  }, 3000).catch(() => {});
                }
              }
              tgMsg = `🎉 *【LINE 客服 - 完整訂單要素已齊全派工】*\n────────────────────────\n👤 *客戶電話*：\`${extracted.phone}\`\n📍 *配送地址*：${extracted.address || '未提供'} ${extracted.floor ? `(${extracted.floor})` : ''}\n⛽ *預訂規格*：${extracted.spec}\n💵 *收款方式*：現場現金\n\n💬 *客戶最新訊息*：\n「${userText}」\n\n🤖 *AI 已確認回覆*：\n${aiResult.text.slice(0, 150)}...\n────────────────────────\n_請值班同仁立即確認並備妥車趟！_`;
            } else {
              tgMsg = `🔔 *【LINE 客服 - 叫瓦斯訊息提示】*\n────────────────────────\n👤 *客戶內容*：\n${userText}\n\n🤖 *AI 已自動回覆*：\n${aiResult.text.slice(0, 150)}...\n────────────────────────\n_請值班同仁注意是否有地址與訂購需求！_`;
            }
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
