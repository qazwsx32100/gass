import { callAiWithFailover } from './_ai-rotator.js';
import { sendJson, getClientIp } from './_auth.js';
import { createBoundedRateLimiter } from './_rateLimit.js';

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

  try {
    const body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
    const {
      prompt,
      messages = [],
      systemInstruction,
      temperature = 0.7,
      model = 'gemini-3.8-flash'
    } = body;

    if (!prompt && (!Array.isArray(messages) || messages.length === 0)) {
      return sendJson(res, 400, { ok: false, error: '請提供 prompt 或 messages 參數' });
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

    const safeTemperature = Math.max(0, Math.min(1.0, Number(temperature) || 0.7));

    const result = await callAiWithFailover({
      prompt: prompt ? String(prompt).slice(0, MAX_PROMPT_LENGTH) : undefined,
      messages: Array.isArray(messages) ? messages : [],
      systemInstruction: systemInstruction ? String(systemInstruction).slice(0, 4000) : undefined,
      temperature: safeTemperature,
      preferredModel: model
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
