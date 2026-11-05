import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SUPPORTED_VOICE_LANGUAGES,
  detectLanguage,
  extractMultilingualOrderEntities,
  transcribeAudio,
  synthesizeSpeech,
  buildMultilingualConfirmationText
} from '../api/_voice-service.js';

import voiceAssistantHandler from '../api/voice-assistant.js';

test('👑 盛隆瓦斯 四語 AI 語音助理全鏈路單元與整合驗證', async (t) => {

  await t.test('1. 四大支援語系元數據完整性 (Metadata Integrity)', () => {
    assert.ok(SUPPORTED_VOICE_LANGUAGES.ZH_TW, '國語設定必須存在');
    assert.ok(SUPPORTED_VOICE_LANGUAGES.TAIWANESE, '台語設定必須存在');
    assert.ok(SUPPORTED_VOICE_LANGUAGES.VIETNAMESE, '越南文設定必須存在');
    assert.ok(SUPPORTED_VOICE_LANGUAGES.ENGLISH, '英文設定必須存在');

    assert.equal(SUPPORTED_VOICE_LANGUAGES.ZH_TW.code, 'zh-TW');
    assert.equal(SUPPORTED_VOICE_LANGUAGES.TAIWANESE.code, 'nan');
    assert.equal(SUPPORTED_VOICE_LANGUAGES.VIETNAMESE.code, 'vi');
    assert.equal(SUPPORTED_VOICE_LANGUAGES.ENGLISH.code, 'en');

    // 驗證瓦斯提示詞必須涵蓋在地關鍵字
    assert.ok(SUPPORTED_VOICE_LANGUAGES.ZH_TW.promptContext.includes('盛隆瓦斯'));
    assert.ok(SUPPORTED_VOICE_LANGUAGES.TAIWANESE.promptContext.includes('大桶瓦斯'));
    assert.ok(SUPPORTED_VOICE_LANGUAGES.VIETNAMESE.promptContext.includes('bình gas'));
    assert.ok(SUPPORTED_VOICE_LANGUAGES.ENGLISH.promptContext.includes('gas cylinder'));
  });

  await t.test('2. 智慧語言自動偵測 (detectLanguage)', () => {
    // 越南文偵測
    const viText1 = 'Tôi muốn đặt bình gas 20kg giao đến đường Chongxin cảm ơn';
    const viText2 = 'Cho hỏi đổi bình gas giá bao nhiêu tiền vậy';
    assert.equal(detectLanguage(viText1), 'vi', '越南文訂單應準確辨識為 vi');
    assert.equal(detectLanguage(viText2), 'vi', '越南文問答應準確辨識為 vi');

    // 英文偵測
    const enText = 'Hello I would like to order one 20kg gas tank please';
    assert.equal(detectLanguage(enText), 'en', '英文句子應準確辨識為 en');

    // 台語特徵詞彙偵測
    const nanText1 = '阮欲叫兩桶大桶瓦斯送去重新路無電梯多謝';
    const nanText2 = '請借問一桶二十公斤瓦斯這馬多少錢';
    assert.equal(detectLanguage(nanText1), 'nan', '台語訂單口語應準確辨識為 nan');
    assert.equal(detectLanguage(nanText2), 'nan', '台語問價口語應準確辨識為 nan');

    // 中文 (國語) 偵測
    const zhText = '請問明天早上送瓦斯有打折嗎？';
    assert.equal(detectLanguage(zhText), 'zh-TW', '中文句子應辨識為 zh-TW');
  });

  await t.test('3. 越南文 (Tiếng Việt) 訂單實體萃取驗證', () => {
    const raw = 'Tôi muốn đặt 2 bình gas 20kg giao đến số 88 đường Chongxin lầu 3 thang bộ, số điện thoại 0912345678';
    const entities = extractMultilingualOrderEntities(raw, 'vi');

    assert.equal(entities.language, 'vi');
    assert.equal(entities.spec, '20kg × 2桶');
    assert.equal(entities.quantity, 2);
    assert.equal(entities.floor, '3樓 (無電梯)');
    assert.equal(entities.hasElevator, false);
    assert.equal(entities.phone, '0912345678');
    assert.ok(entities.address.includes('88'), '地址應抓取到門牌號');
    assert.equal(entities.isComplete, true);

    const confirmText = buildMultilingualConfirmationText(entities);
    assert.ok(confirmText.includes('Đã ghi nhận đầy đủ thông tin'), '資訊齊全應回傳越南文覆誦');
    assert.ok(confirmText.includes('20kg × 2桶'));
  });

  await t.test('4. 英文 (English) 訂單實體萃取驗證', () => {
    const raw = 'Please deliver two 20kg tanks to No 120 Zhengyi North Road 4th floor no elevator, phone 0988776655';
    const entities = extractMultilingualOrderEntities(raw, 'en');

    assert.equal(entities.language, 'en');
    assert.equal(entities.spec, '20kg × 2桶');
    assert.equal(entities.quantity, 2);
    assert.equal(entities.floor, '4樓 (無電梯)');
    assert.equal(entities.hasElevator, false);
    assert.equal(entities.phone, '0988776655');
    assert.ok(entities.address.includes('120'), '地址應抓取到門牌號');
    assert.equal(entities.isComplete, true);

    const confirmText = buildMultilingualConfirmationText(entities);
    assert.ok(confirmText.includes('Order details recorded successfully'), '資訊齊全應回傳英文覆誦');
  });

  await t.test('5. 台語 (臺灣話) 訂單實體萃取驗證', () => {
    const raw = '阮欲叫一桶大桶瓦斯送到重新路四段50號3樓爬樓梯電話0911222333多謝';
    const entities = extractMultilingualOrderEntities(raw, 'nan');

    assert.equal(entities.language, 'nan');
    assert.equal(entities.spec, '20kg × 1桶');
    assert.equal(entities.quantity, 1);
    assert.equal(entities.floor, '3樓 (無電梯)');
    assert.equal(entities.phone, '0911222333');
    assert.equal(entities.isComplete, true);

    const confirmText = buildMultilingualConfirmationText(entities);
    assert.ok(confirmText.includes('瓦斯叫貨資料攏齊全矣'), '資訊齊全應回傳台語覆誦');
    assert.ok(confirmText.includes('現場請先攢好空桶換'));
  });

  await t.test('6. 中文 (國語) 訂單實體萃取與缺項防呆提示', () => {
    const incomplete = '我要叫兩桶20公斤瓦斯送到5樓有電梯';
    const entities = extractMultilingualOrderEntities(incomplete, 'zh-TW');
    assert.equal(entities.isComplete, false);
    assert.ok(entities.missing.includes('配送地址'));
    assert.ok(entities.missing.includes('聯絡電話'));

    const askText = buildMultilingualConfirmationText(entities);
    assert.ok(askText.includes('目前還缺少'), '缺項時應親切追問');
  });

  await t.test('7. 語音辨識 (transcribeAudio) 與語音合成 (synthesizeSpeech) Mock 整合', async () => {
    const dummyAudio = Buffer.from('RIFF....dummy_audio_bytes');
    const stt = await transcribeAudio({ audioBuffer: dummyAudio, mimeType: 'audio/m4a' });
    assert.ok(stt.ok);
    assert.ok(stt.transcript.length > 0);

    const tts = await synthesizeSpeech({ text: '盛隆瓦斯您好，很高興為您服務', language: 'zh-TW' });
    assert.ok(tts.ok);
    assert.ok(tts.audioBuffer instanceof Buffer);
    assert.ok(tts.audioBuffer.length > 0);
  });

  // 輔助函式：建立符合 sendJson 鏈式調用的 Mock Response
  function createMockResponse() {
    const res = {
      statusCode: 200,
      headers: {},
      body: null,
      setHeader(k, v) {
        this.headers[k] = v;
        return this;
      },
      status(code) {
        this.statusCode = code;
        return this;
      },
      end(data) {
        if (data) {
          try {
            this.body = JSON.parse(data);
          } catch {
            this.body = data;
          }
        }
        return this;
      }
    };
    return res;
  }

  await t.test('8. /api/voice-assistant 端點 GET 與 OPTIONS 驗證', async () => {
    const resOptions = createMockResponse();
    await voiceAssistantHandler({ method: 'OPTIONS' }, resOptions);
    assert.equal(resOptions.statusCode, 204);

    const resGet = createMockResponse();
    await voiceAssistantHandler({ method: 'GET' }, resGet);
    assert.ok(resGet.body.ok);
    assert.equal(resGet.body.supportedLanguages.length, 4);
  });

  await t.test('9. /api/voice-assistant 端點 parse_order 與 synthesize 動作驗證', async () => {
    const resParse = createMockResponse();
    await voiceAssistantHandler({
      method: 'POST',
      body: {
        action: 'parse_order',
        text: 'Tôi muốn đặt bình gas 20kg giao đến số 12 đường Chongxin lầu 2 có thang máy, số điện thoại 0912000111',
        language: 'vi'
      }
    }, resParse);

    assert.ok(resParse.body.ok);
    assert.equal(resParse.body.entities.language, 'vi');
    assert.equal(resParse.body.entities.spec, '20kg × 1桶');
    assert.ok(resParse.body.confirmationText.includes('Đã ghi nhận đầy đủ'));

    const resSynth = createMockResponse();
    await voiceAssistantHandler({
      method: 'POST',
      body: {
        action: 'synthesize',
        text: 'Hello, your ShengLong gas order has been received.',
        language: 'en'
      }
    }, resSynth);

    assert.ok(resSynth.body.ok);
    assert.ok(resSynth.body.audioBase64);
    assert.equal(resSynth.body.language, 'en');
  });
});
