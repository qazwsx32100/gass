'use strict';

/**
 * 👑 盛隆瓦斯 四語 AI 語音助理服務 (CommonJS 版本)
 * 支援國語、台語、越南文、英文
 */

const SUPPORTED_VOICE_LANGUAGES = {
  ZH_TW: {
    code: 'zh-TW',
    shortCode: 'zh',
    name: '國語/中文',
    ttsVoice: 'alloy',
    promptContext: '盛隆瓦斯、三重、蘆洲、重新路、正義北路、集美街、三和路、瓦斯、叫瓦斯、20公斤、16公斤、10公斤、4公斤、50公斤、電梯、爬樓梯、無電梯、押金、檢驗費',
    orderConfirmationPrefix: '已為您確認訂單內容：',
    askMissingPrefix: '為了盡快為您配送瓦斯，請問：'
  },
  TAIWANESE: {
    code: 'nan',
    shortCode: 'nan',
    name: '台語 (臺灣閩南語)',
    ttsVoice: 'nova',
    promptContext: '盛隆瓦斯、大桶瓦斯、小桶瓦斯、二桶、兩桶、一桶、梯仔樓、爬樓梯、有電梯、無電梯、正義北路、重新路、三重、蘆洲、叫瓦斯、多謝、甘謝、二十公斤、十六公斤、十公斤、四公斤、五階、三樓、電話',
    orderConfirmationPrefix: '已經共你確認訂單內容：',
    askMissingPrefix: '為著趕緊共你送瓦斯，請借問：'
  },
  VIETNAMESE: {
    code: 'vi',
    shortCode: 'vi',
    name: 'Tiếng Việt (越南文)',
    ttsVoice: 'shimmer',
    promptContext: 'Gas Thịnh Long, bình gas 20kg, bình gas 16kg, bình gas 10kg, bình gas 4kg, bình gas 50kg, 1 bình, 2 bình, hai bình, một bình, tầng, lầu, thang máy, thang bộ, Tam Trọng, Sanchong, Luzhou, số điện thoại, đổi bình, tiền cọc',
    orderConfirmationPrefix: 'Đã xác nhận đơn đặt gas của bạn:',
    askMissingPrefix: 'Để chúng tôi giao gas nhanh nhất cho bạn, vui lòng cung cấp:'
  },
  ENGLISH: {
    code: 'en',
    shortCode: 'en',
    name: 'English (英文)',
    ttsVoice: 'echo',
    promptContext: 'ShengLong Gas, gas cylinder, 20kg, 16kg, 10kg, 4kg, 50kg, Sanchong, Luzhou, Chongxin Road, Zhengyi North Road, elevator, stairs, walk-up, contact phone, deposit, safety inspection',
    orderConfirmationPrefix: 'Your gas order details are confirmed as follows:',
    askMissingPrefix: 'To deliver your gas as soon as possible, could you please provide:'
  }
};

async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: options.signal || controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function detectLanguage(text = '') {
  const str = String(text || '').trim();
  if (!str) return 'zh-TW';

  const vietnameseRegex = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]/i;
  const vietnameseExclusiveWords = /\b(bình gas|giao đến|thang máy|thang bộ|cảm ơn|xin chào|bao nhiêu tiền|đổi bình|chân thành|số điện thoại)\b/i;
  if (vietnameseRegex.test(str) || vietnameseExclusiveWords.test(str)) {
    return 'vi';
  }

  const englishWords = str.match(/\b[A-Za-z]{2,}\b/g) || [];
  const cjkChars = str.match(/[\u4e00-\u9fa5]/g) || [];
  if (englishWords.length >= 3 && englishWords.length > cjkChars.length) {
    return 'en';
  }

  const taiwaneseKeywords = /(大桶|小桶|梯仔樓|正手|倒手|甘謝|多謝|借問|啥物|阮|恁|這馬|這陣|送來遮|按呢|兩桶|二桶|無電梯|有電梯|爬樓梯|欲叫|欲愛|共我叫|送來遮)/;
  if (taiwaneseKeywords.test(str)) {
    return 'nan';
  }

  return 'zh-TW';
}

function extractMultilingualOrderEntities(text = '', language = 'zh-TW') {
  const raw = String(text || '').trim();
  const detectedLang = language || detectLanguage(raw);

  let spec = null;
  let quantity = 1;
  let floor = null;
  let hasElevator = null;
  let phone = null;
  let address = null;

  const phoneMatch = raw.match(/(09\d{2}[-\s]?\d{3}[-\s]?\d{3}|02[-\s]?\d{4}[-\s]?\d{4}|09\d{8})/);
  if (phoneMatch) {
    phone = phoneMatch[0].replace(/[-\s]/g, '');
  }

  if (detectedLang === 'vi') {
    const viSpecMatch = raw.match(/bình\s*(?:gas\s*)?(20|16|10|4|50)\s*(?:kg)?|(20|16|10|4|50)\s*kg/i);
    if (viSpecMatch) {
      const kg = viSpecMatch[1] || viSpecMatch[2];
      spec = `${kg}kg`;
    }
    const viQtyMatch = raw.match(/([1-9]|một|hai|ba|bốn)\s*bình/i);
    if (viQtyMatch) {
      const q = viQtyMatch[1].toLowerCase();
      if (q === '1' || q === 'một') quantity = 1;
      else if (q === '2' || q === 'hai') quantity = 2;
      else if (q === '3' || q === 'ba') quantity = 3;
      else if (q === '4' || q === 'bốn') quantity = 4;
      else quantity = Number(q) || 1;
    }
  } else if (detectedLang === 'en') {
    const enSpecMatch = raw.match(/(20|16|10|4|50)\s*(?:kg|kilo)/i);
    if (enSpecMatch) {
      spec = `${enSpecMatch[1]}kg`;
    }
    const enQtyMatch = raw.match(/(\d+|one|two|three|four)\s*(?:(?:20|16|10|4|50)\s*(?:kg|kilo)\s*)?(?:tanks?|cylinders?|bottles?)|(?:tanks?|cylinders?)\s*(?:x|\*)\s*(\d+)/i);
    if (enQtyMatch) {
      const q = (enQtyMatch[1] || enQtyMatch[2]).toLowerCase();
      if (q === '1' || q === 'one') quantity = 1;
      else if (q === '2' || q === 'two') quantity = 2;
      else if (q === '3' || q === 'three') quantity = 3;
      else if (q === '4' || q === 'four') quantity = 4;
      else quantity = Number(q) || 1;
    }
  } else {
    const specMatch = raw.match(/(?:(?:20|16|10|4|50|二十|十六|十|四|五十)\s*(?:公斤|kg|KG)?)|大桶|小桶/i);
    if (specMatch) {
      const val = specMatch[0];
      if (/大桶/i.test(val)) spec = '20kg';
      else if (/小桶/i.test(val)) spec = '16kg';
      else if (/20|二十/.test(val)) spec = '20kg';
      else if (/16|十六/.test(val)) spec = '16kg';
      else if (/50|五十/.test(val)) spec = '50kg';
      else if (/10|十/.test(val)) spec = '10kg';
      else if (/4|四/.test(val)) spec = '4kg';
    }
    const qtyMatch = raw.match(/([一二三兩四1-4])\s*(桶|支|罐)/);
    if (qtyMatch) {
      const qStr = qtyMatch[1];
      if (qStr === '一' || qStr === '1') quantity = 1;
      else if (qStr === '二' || qStr === '兩' || qStr === '2') quantity = 2;
      else if (qStr === '三' || qStr === '3') quantity = 3;
      else if (qStr === '四' || qStr === '4') quantity = 4;
      else quantity = 1;
    }
  }

  if (detectedLang === 'vi') {
    const viFloorMatch = raw.match(/(?:tầng|lầu)\s*([1-9]|một|hai|ba|bốn|năm)/i);
    if (viFloorMatch) {
      floor = `${viFloorMatch[1]}樓`;
    }
    if (/có thang máy/i.test(raw)) hasElevator = true;
    if (/không có thang máy|thang bộ/i.test(raw)) hasElevator = false;
  } else if (detectedLang === 'en') {
    const enFloorMatch = raw.match(/(\d+)(?:st|nd|rd|th)?\s*floor|floor\s*(\d+)/i);
    if (enFloorMatch) {
      floor = `${enFloorMatch[1] || enFloorMatch[2]}樓`;
    }
    if (/elevator|lift/i.test(raw) && !/no elevator|without elevator/i.test(raw)) hasElevator = true;
    if (/no elevator|without elevator|stairs|walk-up/i.test(raw)) hasElevator = false;
  } else {
    const zhFloorMatch = raw.match(/([1-9一二三四五六七八九十])\s*樓/);
    if (zhFloorMatch) {
      floor = `${zhFloorMatch[1]}樓`;
    }
    if (/沒有電梯|沒電梯|無電梯|爬樓梯|走樓梯|梯仔樓/.test(raw)) hasElevator = false;
    else if (/有電梯|電梯大樓|搭電梯/.test(raw)) hasElevator = true;
  }

  let floorDesc = floor || null;
  if (floor) {
    if (hasElevator === true) floorDesc = `${floor} (有電梯)`;
    else if (hasElevator === false) floorDesc = `${floor} (無電梯)`;
  } else if (hasElevator !== null) {
    floorDesc = hasElevator ? '有電梯' : '無電梯';
  }

  if (detectedLang === 'vi') {
    const viAddrMatch = raw.match(/(?:số\s*\d+[^,，\n]+?(?:đường|phố)[^,，\n]+|(?:đường|phố)[^,，\n]+?số\s*\d+[^,，\n]*)/i);
    if (viAddrMatch) {
      address = viAddrMatch[0].trim();
    }
  } else if (detectedLang === 'en') {
    const enAddrMatch = raw.match(/(?:No\.?\s*\d+[^,\n]+?(?:Road|Street|Lane|Ave|Rd|St)[^,\n]*|(?:Road|Street|Lane|Ave|Rd|St)[^,\n]+?No\.?\s*\d+[^,\n]*)/i);
    if (enAddrMatch) {
      address = enAddrMatch[0].trim();
    }
  } else {
    let cleanAddrSource = raw;
    const deliveryPrefix = raw.match(/(?:送到|送去|送來|送至|地址在|住址在|地址是|住在|到)\s*(.*)/);
    if (deliveryPrefix && deliveryPrefix[1]) {
      cleanAddrSource = deliveryPrefix[1];
    }
    const addrMatch = cleanAddrSource.match(/((?:新北市|台北市|新北|台北)?(?:三重區|三重|蘆洲區|蘆洲|新莊區|新莊)?[^0-9\n,，]+?(?:路|街|大道)(?:[一二三四五六七八九十\d]+段)?(?:[\d\s一二三四五六七八九十-]+巷)?(?:[\d\s一二三四五六七八九十-]+弄)?[\d\s-]*號?)/);
    if (addrMatch) {
      address = addrMatch[0].trim();
    }
  }

  const missing = [];
  if (!spec) missing.push('瓦斯規格');
  if (!address) missing.push('配送地址');
  if (!floorDesc) missing.push('樓層(電梯/樓梯)');
  if (!phone) missing.push('聯絡電話');

  return {
    language: detectedLang,
    spec: spec ? `${spec} × ${quantity}桶` : null,
    specOnly: spec,
    quantity,
    floor: floorDesc,
    hasElevator,
    address,
    phone,
    missing,
    isComplete: Boolean(spec && address && floor && phone)
  };
}

function normalizeAudioMimeType(mime = '') {
  const lower = String(mime || '').toLowerCase();
  if (lower.includes('webm')) return 'audio/webm';
  if (lower.includes('ogg')) return 'audio/ogg';
  if (lower.includes('wav')) return 'audio/wav';
  if (lower.includes('mp3') || lower.includes('mpeg')) return 'audio/mp3';
  if (lower.includes('m4a') || lower.includes('mp4') || lower.includes('aac')) return 'audio/mp4';
  return 'audio/mp4';
}

async function transcribeWithGemini({
  audioBuffer,
  mimeType = 'audio/m4a',
  apiKey = null
}) {
  const geminiKeys = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '')
    .split(',')
    .map(k => k.trim())
    .filter(Boolean);
  const key = apiKey || geminiKeys[0];
  if (!key || key.startsWith('mock-')) {
    throw new Error('未設定有效 GEMINI_API_KEY');
  }

  const model = process.env.GEMINI_VOICE_MODEL || process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const safeMime = normalizeAudioMimeType(mimeType);
  const base64Audio = audioBuffer.toString('base64');

  const systemInstruction = `你是盛隆瓦斯的專業語音助理。這是一段顧客用手機錄製叫瓦斯的語音訊息，語言可能是臺灣國語、臺灣閩南語（台語，如：叫瓦斯、二桶、梯仔樓、無電梯）、Tiếng Việt (越南文) 或 English (英文)。
請精確聽打顧客所說的內容，直接輸出聽到的原話文字，絕對不要加任何問候語、解釋、客套話或標籤說明。若聲音太小或只有雜音，請輸出空字串。`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  const payload = {
    contents: [
      {
        parts: [
          { text: systemInstruction },
          {
            inline_data: {
              mime_type: safeMime,
              data: base64Audio
            }
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 300
    }
  };

  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }, 15000);

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Gemini STT 辨識失敗 HTTP ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const transcript = (data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '').trim();
  const detected = detectLanguage(transcript);

  return {
    ok: true,
    provider: 'google-gemini',
    transcript,
    language: detected,
    rawResponse: data
  };
}

async function transcribeWithWhisper({
  audioBuffer,
  mimeType = 'audio/m4a',
  apiKey = process.env.OPENAI_API_KEY,
  languageHint = null
}) {
  if (!apiKey || apiKey.startsWith('mock-')) {
    throw new Error('未設定有效 OPENAI_API_KEY');
  }

  const prompt = [
    SUPPORTED_VOICE_LANGUAGES.ZH_TW.promptContext,
    SUPPORTED_VOICE_LANGUAGES.TAIWANESE.promptContext,
    SUPPORTED_VOICE_LANGUAGES.VIETNAMESE.promptContext,
    SUPPORTED_VOICE_LANGUAGES.ENGLISH.promptContext
  ].join(', ');

  const formData = new FormData();
  const blob = new Blob([audioBuffer], { type: mimeType });
  const filename = mimeType.includes('m4a') ? 'audio.m4a' : mimeType.includes('ogg') ? 'audio.ogg' : 'audio.mp3';
  formData.append('file', blob, filename);
  formData.append('model', 'whisper-1');
  formData.append('prompt', prompt);
  if (languageHint) {
    formData.append('language', languageHint);
  }

  const res = await fetchWithTimeout('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`
    },
    body: formData
  }, 15000);

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Whisper STT 辨識失敗 HTTP ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const transcript = String(data.text || '').trim();
  const detected = detectLanguage(transcript);

  return {
    ok: true,
    provider: 'openai-whisper',
    transcript,
    language: detected,
    rawResponse: data
  };
}

async function transcribeAudio({
  audioBuffer,
  mimeType = 'audio/m4a',
  apiKey = process.env.OPENAI_API_KEY,
  languageHint = null
}) {
  if (!audioBuffer || audioBuffer.length === 0) {
    throw new Error('音訊資料為空，無法進行語音辨識');
  }

  if (process.env.NODE_ENV === 'test' || apiKey === 'mock-key' || (apiKey && apiKey.startsWith('mock-'))) {
    const mockText = '我要叫一桶20公斤瓦斯送到三重區重新路四段12號3樓無電梯電話0912345678';
    return {
      ok: true,
      provider: 'mock-whisper',
      transcript: mockText,
      language: detectLanguage(mockText),
      duration: 3.5
    };
  }

  const geminiKeyAvailable = Boolean((process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '').trim());
  const openaiKeyAvailable = Boolean(apiKey && !apiKey.startsWith('mock-'));

  // 1. 若有 Gemini Key，優先嘗試 Gemini 多模態語音轉錄（支援國/台/英/越，額度充沛、免 429）
  if (geminiKeyAvailable) {
    try {
      return await transcribeWithGemini({ audioBuffer, mimeType });
    } catch (geminiErr) {
      console.warn('[Voice STT] Gemini 轉錄失敗，嘗試 fallback 至 Whisper:', geminiErr.message);
    }
  }

  // 2. 若 Gemini 不可用或失敗，嘗試 OpenAI Whisper
  if (openaiKeyAvailable) {
    try {
      return await transcribeWithWhisper({ audioBuffer, mimeType, apiKey, languageHint });
    } catch (whisperErr) {
      console.warn('[Voice STT] Whisper 轉錄失敗:', whisperErr.message);
      // 若尚未嘗試過 Gemini（例如先前因 apiKey 優先），再試一次 Gemini
      if (geminiKeyAvailable) {
        try {
          return await transcribeWithGemini({ audioBuffer, mimeType });
        } catch (retryGeminiErr) {
          console.warn('[Voice STT] Gemini 二次轉錄失敗:', retryGeminiErr.message);
        }
      }
      throw whisperErr;
    }
  }

  throw new Error('目前未配置可用的語音辨識 API Key (Gemini 或 Whisper)');
}

async function synthesizeSpeech({
  text = '',
  language = 'zh-TW',
  voice = null,
  apiKey = process.env.OPENAI_API_KEY
}) {
  const content = String(text || '').trim();
  if (!content) throw new Error('文字內容為空，無法合成語音');

  const langKey = language === 'vi' ? 'VIETNAMESE' : language === 'en' ? 'ENGLISH' : language === 'nan' ? 'TAIWANESE' : 'ZH_TW';
  const targetVoice = voice || SUPPORTED_VOICE_LANGUAGES[langKey]?.ttsVoice || 'alloy';

  if (!apiKey || apiKey.startsWith('mock-') || process.env.NODE_ENV === 'test') {
    const mockWavHeader = Buffer.alloc(44);
    mockWavHeader.write('RIFF', 0);
    mockWavHeader.writeUInt32LE(36, 4);
    mockWavHeader.write('WAVE', 8);
    mockWavHeader.write('fmt ', 12);
    mockWavHeader.writeUInt32LE(16, 16);
    mockWavHeader.writeUInt16LE(1, 20); // PCM
    mockWavHeader.writeUInt16LE(1, 22); // Mono
    mockWavHeader.writeUInt32LE(16000, 24); // 16kHz
    mockWavHeader.writeUInt32LE(32000, 28);
    mockWavHeader.writeUInt16LE(2, 32);
    mockWavHeader.writeUInt16LE(16, 34);
    mockWavHeader.write('data', 36);
    mockWavHeader.writeUInt32LE(0, 40);

    return {
      ok: true,
      provider: 'mock-tts',
      audioBuffer: mockWavHeader,
      mimeType: 'audio/wav',
      language,
      voice: targetVoice,
      durationMs: 3000
    };
  }

  const res = await fetchWithTimeout('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'tts-1',
      input: content.slice(0, 1000),
      voice: targetVoice,
      response_format: 'mp3'
    })
  }, 12000);

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`OpenAI TTS 合成失敗 HTTP ${res.status}: ${errText}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const audioBuffer = Buffer.from(arrayBuffer);

  return {
    ok: true,
    provider: 'openai-tts',
    audioBuffer,
    mimeType: 'audio/mp3',
    language,
    voice: targetVoice,
    durationMs: Math.max(2000, Math.round((content.length / 5) * 1000))
  };
}

function buildMultilingualConfirmationText(entities) {
  const { language, spec, floor, address, phone, missing } = entities;

  if (missing.length > 0) {
    if (language === 'vi') {
      const viMissing = missing.map(m => m === '配送地址' ? 'địa chỉ giao hàng' : m === '瓦斯規格' ? 'loại bình gas (20kg/16kg/10kg)' : m === '樓層(電梯/樓梯)' ? 'số tầng (có thang máy hay không)' : 'số điện thoại liên hệ').join(', ');
      return `Chào bạn! Để giao gas đến nhanh nhất, xin vui lòng cho biết thêm: ${viMissing}. Xin cảm ơn!`;
    }
    if (language === 'en') {
      const enMissing = missing.map(m => m === '配送地址' ? 'delivery address' : m === '瓦斯規格' ? 'gas cylinder size (20kg/16kg/10kg)' : m === '樓層(電梯/樓梯)' ? 'floor & elevator info' : 'contact phone number').join(', ');
      return `Hello! To ensure fast delivery, please provide the remaining details: ${enMissing}. Thank you!`;
    }
    if (language === 'nan') {
      const nanMissing = missing.map(m => m === '配送地址' ? '送貨地址' : m === '瓦斯規格' ? '瓦斯大細桶' : m === '樓層(電梯/樓梯)' ? '幾樓有電梯無' : '電話號碼').join('、');
      return `你好！為著趕緊共你送瓦斯去，請借問閣欠：${nanMissing}。多謝你！`;
    }
    return `您好！為了盡速為您安排配送，目前還缺少：${missing.join('、')}，請告訴我們以便盡快安排師傅出車，謝謝！`;
  }

  if (language === 'vi') {
    return `🎉 Đã ghi nhận đầy đủ thông tin đơn gas của bạn:\n• Loại gas: ${spec}\n• Địa chỉ: ${address}\n• Tầng: ${floor}\n• Số điện thoại: ${phone}\n\nNhân viên giao gas sẽ gọi điện trước khi đến. Vui lòng chuẩn bị sẵn vỏ bình gas cũ để đổi. Vui lòng bấm [Xác nhận đặt hàng] bên dưới để hoàn tất!`;
  }
  if (language === 'en') {
    return `🎉 Order details recorded successfully:\n• Cylinder: ${spec}\n• Address: ${address}\n• Floor: ${floor}\n• Phone: ${phone}\n\nOur driver will call before delivery. Please have your empty cylinder ready for exchange. Please click [Confirm Order] below to proceed!`;
  }
  if (language === 'nan') {
    return `🎉 瓦斯叫貨資料攏齊全矣！\n• 瓦斯規格：${spec}\n• 送貨地址：${address}\n• 樓層電梯：${floor}\n• 聯絡電話：${phone}\n\n師傅出車進前會先敲電話共你講，現場請先攢好空桶換喔！請點擊下底【確認送出】就完成囉，甘謝！`;
  }
  return `🎉 為您確認瓦斯訂購資料：\n• 規格數量：${spec}\n• 配送地址：${address}\n• 樓層電梯：${floor}\n• 聯絡電話：${phone}\n\n師傅出車前會先電話通知，現場請備妥空桶交換與現金付款。請點擊下方【確認送出】以正式為您派工！`;
}

async function downloadLineAudio(messageId, channelAccessToken) {
  if (!messageId || !channelAccessToken) {
    throw new Error('缺少 messageId 或 LINE Channel Access Token');
  }

  const url = `https://api-data.line.me/v2/bot/message/${messageId}/content`;
  const res = await fetchWithTimeout(url, {
    headers: {
      'Authorization': `Bearer ${channelAccessToken}`
    }
  }, 10000);

  if (!res.ok) {
    throw new Error(`下載 LINE 音訊失敗 HTTP ${res.status}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

module.exports = {
  SUPPORTED_VOICE_LANGUAGES,
  detectLanguage,
  extractMultilingualOrderEntities,
  transcribeAudio,
  transcribeWithGemini,
  synthesizeSpeech,
  buildMultilingualConfirmationText,
  downloadLineAudio,
  fetchWithTimeout,
  normalizeAudioMimeType
};
