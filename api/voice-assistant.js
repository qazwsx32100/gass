/**
 * 👑 盛隆瓦斯 四語 AI 語音助理端點 (Voice Assistant API)
 * 支援中、英、台、越 雙向語音互動 (STT + NLU + TTS)
 */

import { sendJson } from './_auth.js';
import { callAiWithFailover } from './_ai-rotator.js';
import { getOptimizedSystemPrompt } from './_knowledge-base.js';
import {
  SUPPORTED_VOICE_LANGUAGES,
  detectLanguage,
  extractMultilingualOrderEntities,
  transcribeAudio,
  synthesizeSpeech,
  buildMultilingualConfirmationText
} from './_voice-service.js';

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method === 'GET') {
    return sendJson(res, 200, {
      ok: true,
      service: '盛隆瓦斯四語 AI 語音助理 API',
      supportedLanguages: Object.values(SUPPORTED_VOICE_LANGUAGES).map(l => ({
        code: l.code,
        name: l.name
      }))
    });
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
  }

  try {
    const { action = 'voice_chat', audioBase64, mimeType, text, language, lineUserId } = req.body || {};

    // 1. 純語音轉文字 (STT)
    if (action === 'transcribe') {
      if (!audioBase64) {
        return sendJson(res, 400, { ok: false, error: '缺少 audioBase64 參數' });
      }
      const audioBuffer = Buffer.from(audioBase64, 'base64');
      const sttResult = await transcribeAudio({ audioBuffer, mimeType: mimeType || 'audio/m4a' });
      return sendJson(res, 200, {
        ok: true,
        transcript: sttResult.transcript,
        language: sttResult.language,
        provider: sttResult.provider
      });
    }

    // 2. 多語系訂單實體擷取 (Parse Order)
    if (action === 'parse_order') {
      const input = String(text || '').trim();
      if (!input) {
        return sendJson(res, 400, { ok: false, error: '缺少 text 參數' });
      }
      const entities = extractMultilingualOrderEntities(input, language);
      const confirmationText = buildMultilingualConfirmationText(entities);
      return sendJson(res, 200, {
        ok: true,
        entities,
        confirmationText
      });
    }

    // 3. 純語音合成 (TTS)
    if (action === 'synthesize') {
      const input = String(text || '').trim();
      if (!input) {
        return sendJson(res, 400, { ok: false, error: '缺少 text 參數' });
      }
      const targetLang = language || detectLanguage(input);
      const ttsResult = await synthesizeSpeech({ text: input, language: targetLang });
      return sendJson(res, 200, {
        ok: true,
        audioBase64: ttsResult.audioBuffer.toString('base64'),
        mimeType: ttsResult.mimeType,
        language: ttsResult.language,
        durationMs: ttsResult.durationMs
      });
    }

    // 4. 端到端語音問答與語音下單 (End-to-End Voice Chat & Order)
    let userText = String(text || '').trim();
    let detectedLang = language || null;

    // 若傳入語音 base64，先轉為文字
    if (audioBase64) {
      const audioBuffer = Buffer.from(audioBase64, 'base64');
      const sttResult = await transcribeAudio({ audioBuffer, mimeType: mimeType || 'audio/m4a' });
      userText = sttResult.transcript;
      detectedLang = sttResult.language;
    }

    if (!userText) {
      return sendJson(res, 400, { ok: false, error: '請提供音訊 (audioBase64) 或文字 (text)' });
    }

    if (!detectedLang) {
      detectedLang = detectLanguage(userText);
    }

    // 解析訂單要素
    const entities = extractMultilingualOrderEntities(userText, detectedLang);
    const hasOrderIntent = Boolean(entities.spec || entities.address || entities.floor || entities.phone);

    let replyText = '';

    if (hasOrderIntent) {
      // 訂單意圖：生成多語系覆誦確認與防呆卡片
      replyText = buildMultilingualConfirmationText(entities);
    } else {
      // 諮詢意圖：對接 300 題知識庫
      let langInstruction = '';
      if (detectedLang === 'vi') {
        langInstruction = 'Khách hàng sử dụng Tiếng Việt. Bạn hãy trả lời hoàn toàn bằng Tiếng Việt một cách thân thiện, chính xác theo bảng giá và quy chuẩn an toàn của Gas Thịnh Long.';
      } else if (detectedLang === 'nan') {
        langInstruction = '客人講台語 (臺灣閩南語)。請你用親切道地的台語漢字（如：你好、大桶瓦斯、按呢、多謝、請借問）溫柔回答，恪守盛隆瓦斯官方標準定價。';
      } else if (detectedLang === 'en') {
        langInstruction = 'The customer is speaking English. Please respond strictly in polite and professional English based on ShengLong Gas official knowledge base and standard pricing.';
      } else {
        langInstruction = '客人使用繁體中文。請以親切專業口吻回答，恪守盛隆瓦斯官方標準定價。';
      }

      const baseSystemPrompt = getOptimizedSystemPrompt();
      const voiceSystemPrompt = `${baseSystemPrompt}\n\n【🌐 多語系即時切換指令】：\n${langInstruction}`;

      const aiResponse = await callAiWithFailover({
        prompt: userText,
        systemInstruction: voiceSystemPrompt,
        temperature: 0.5
      });
      replyText = aiResponse.reply || '您好！盛隆瓦斯很高興為您服務。';
    }

    // 語音合成回傳
    const ttsResult = await synthesizeSpeech({
      text: replyText,
      language: detectedLang
    });

    return sendJson(res, 200, {
      ok: true,
      transcript: userText,
      language: detectedLang,
      isOrderIntent: hasOrderIntent,
      entities,
      replyText,
      audioBase64: ttsResult.audioBuffer ? ttsResult.audioBuffer.toString('base64') : null,
      audioMimeType: ttsResult.mimeType || 'audio/mp3',
      audioDurationMs: ttsResult.durationMs || 3000
    });

  } catch (err) {
    console.error('[Voice Assistant API Error]:', err);
    return sendJson(res, 500, {
      ok: false,
      error: '語音處理發生異常: ' + (err.message || String(err))
    });
  }
}
