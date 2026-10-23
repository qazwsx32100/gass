import { callAiWithFailover } from './_ai-rotator.js';
import { sendJson, getClientIp } from './_auth.js';
import { createBoundedRateLimiter } from './_rateLimit.js';
import { getOptimizedSystemPrompt, classifyQueryComplexity } from './_knowledge-base.js';
import { extractOrderEntities, formatOrderStateContext } from './line-webhook.js';
import { recordLineAiChat } from './_line-ai-logger.js';

// 限制公開 AI 詢答頻率：單一 IP 每分鐘最多 12 次請求，保護老闆付費 API 配額不被刷爆
const aiChatRateLimiter = createBoundedRateLimiter({
  windowMs: 60 * 1000,
  maxEntries: 5000
});

const MAX_PROMPT_LENGTH = 1500;
const MAX_MESSAGES_COUNT = 10;
const MAX_TOTAL_CHARS = 3000;

/**
 * 盛隆瓦斯雲端 AI 問答端點 (Vercel Serverless Function)
 * 支援:
 * 1. LINE Webhook 呼叫
 * 2. 外部系統 / 網頁前端問答
 * 3. 自動執行 Gemini 1 -> 2 -> 3 -> OpenAI 輪調與故障轉移
 * 4. 具備 IP 限流與 Payload 防刷安全機制
 */
export default async function handler(req, res) {
  // CORS 與安全標頭設定
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
  }

  // IP 速率限制檢查
  const clientIp = getClientIp(req) || 'unknown';
  const isLimited = aiChatRateLimiter.check([{ key: `ai_chat:${clientIp}`, max: 12 }]);
  if (isLimited) {
    res.setHeader('Retry-After', '60');
    return sendJson(res, 429, {
      ok: false,
      error: 'AI 詢問頻率過高，為保障服務品質請稍候 1 分鐘後再試。'
    });
  }

  let body;
  try {
    body = typeof req.body === 'object' && req.body !== null ? req.body : JSON.parse(req.body || '{}');
  } catch (_parseErr) {
    return sendJson(res, 400, { ok: false, error: '請求內容非合法 JSON 格式，請檢核後重試。' });
  }

  // 拒絕原型鏈污染 (Prototype Pollution) 惡意屬性
  if (body && typeof body === 'object') {
    if (Object.prototype.hasOwnProperty.call(body, '__proto__') || Object.prototype.hasOwnProperty.call(body, 'constructor')) {
      try { delete body.__proto__; } catch {}
      try { delete body.constructor; } catch {}
    }
  }

  try {
    const {
      prompt,
      messages = [],
      systemInstruction,
      temperature = 0.7,
      model = 'gemini-3.8-flash'
    } = body || {};

    if (!prompt && (!Array.isArray(messages) || messages.length === 0)) {
      return sendJson(res, 400, { ok: false, error: '請提供 prompt 或 messages 參數' });
    }

    // 攔截非法 Null Byte 控制字元注入，防止消耗上游配額
    if (prompt && /\x00/.test(String(prompt))) {
      return sendJson(res, 400, {
        ok: false,
        error: '提問內容包含非法控制字元 (Null Byte)，請重新輸入。'
      });
    }

    // 防範巨型 Payload 惡意消耗老闆的 Token 額度
    if (prompt && String(prompt).length > MAX_PROMPT_LENGTH) {
      return sendJson(res, 400, {
        ok: false,
        error: `提問內容過長（上限 ${MAX_PROMPT_LENGTH} 字元），請精簡後重試。`
      });
    }

    if (Array.isArray(messages)) {
      if (messages.length > MAX_MESSAGES_COUNT) {
        return sendJson(res, 400, {
          ok: false,
          error: `對話歷程長度超出限制（最多 ${MAX_MESSAGES_COUNT} 則）。`
        });
      }

      const totalChars = messages.reduce((acc, m) => acc + String(m?.content || m?.text || '').length, 0);
      if (totalChars > MAX_TOTAL_CHARS) {
        return sendJson(res, 400, {
          ok: false,
          error: `對話總長度超出上限（最多 ${MAX_TOTAL_CHARS} 字元）。`
        });
      }
    }

    const userQuery = prompt
      ? String(prompt).trim()
      : (Array.isArray(messages) && messages.length > 0
          ? String(messages[messages.length - 1]?.content || messages[messages.length - 1]?.text || '').trim()
          : '');

    // 自動與 LINE AI 客服對齊：若未帶 systemInstruction，動態組裝盛隆官方知識庫與訂單要素上下文
    let finalSystemInstruction = systemInstruction;
    let complexityMode = 'fast';

    if (!finalSystemInstruction) {
      complexityMode = classifyQueryComplexity(userQuery);
      const extracted = extractOrderEntities(messages, userQuery);
      const orderStateContext = formatOrderStateContext(extracted);
      finalSystemInstruction = getOptimizedSystemPrompt(userQuery, complexityMode, orderStateContext);
    }

    const isExpert = complexityMode === 'expert';
    const safeTemperature = temperature !== undefined
      ? Math.max(0, Math.min(1.0, Number(temperature) || 0.7))
      : (isExpert ? 0.3 : 0.6);

    const result = await callAiWithFailover({
      prompt: prompt ? String(prompt).slice(0, MAX_PROMPT_LENGTH) : undefined,
      messages: Array.isArray(messages) ? messages : [],
      systemInstruction: finalSystemInstruction ? String(finalSystemInstruction).slice(0, 32000) : undefined,
      temperature: safeTemperature,
      preferredModel: model || 'gemini-3-flash-preview',
      strategy: 'round-robin',
      mode: complexityMode
    });

    const isOrderIntent = /叫瓦斯|訂瓦斯|送瓦斯|送一桶|送兩桶|瓦斯沒了|換瓦斯/i.test(userQuery);

    // 非阻塞持久化記錄至 AI 對話歷史中心（讓老闆隨時在看板查閱官網即時問答）
    recordLineAiChat({
      lineUserId: `web:${clientIp}`,
      userName: '官網訪客',
      userMessage: userQuery,
      aiReply: result.text,
      aiResult: result,
      isOrderIntent,
      status: 'success'
    }).catch(err => {
      console.warn('[LineAiLogger] 官網 AI 對話記錄非致命錯誤:', err.message);
    });

    return sendJson(res, 200, {
      ok: true,
      reply: result.text,
      meta: {
        accountName: result.accountName,
        provider: result.provider,
        model: result.model,
        tokens: result.tokens,
        latencyMs: result.latencyMs,
        failoverCount: result.failoverCount,
        totalDurationMs: result.totalDurationMs
      }
    });
  } catch (err) {
    console.error('[API /api/ai-chat Error]:', err);
    return sendJson(res, err.status || 500, {
      ok: false,
      error: err.message || 'AI 服務暫時無法回應，請稍後再試'
    });
  }
}
