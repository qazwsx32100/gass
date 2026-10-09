import { callAiWithFailover } from './_ai-rotator.js';
import { sendJson } from './_auth.js';

/**
 * 盛隆瓦斯雲端 AI 問答端點 (Vercel Serverless Function)
 * 支援:
 * 1. LINE Webhook 呼叫
 * 2. 外部系統 / 網頁前端問答
 * 3. 自動執行 Gemini 1 -> 2 -> 3 -> OpenAI 輪調與故障轉移
 */
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
  }

  try {
    const {
      prompt,
      messages = [],
      systemInstruction,
      temperature = 0.7,
      model = 'gemini-3.8-flash'
    } = req.body || {};

    if (!prompt && (!Array.isArray(messages) || messages.length === 0)) {
      return sendJson(res, 400, { ok: false, error: '請提供 prompt 或 messages 參數' });
    }

    const result = await callAiWithFailover({
      prompt,
      messages,
      systemInstruction,
      temperature,
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
