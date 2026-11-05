import fs from 'node:fs';
import path from 'node:path';

const filePath = path.resolve(process.cwd(), 'api/line-webhook.js');
let content = fs.readFileSync(filePath, 'utf8');

// 1. 頂部加入 _voice-service.js 匯入
if (!content.includes('_voice-service.js')) {
  const importTarget = "import { sendTelegramMessage, getTelegramConfig } from './_telegram.js';";
  const importReplacement = `import { sendTelegramMessage, getTelegramConfig } from './_telegram.js';
import {
  SUPPORTED_VOICE_LANGUAGES,
  detectLanguage,
  extractMultilingualOrderEntities,
  transcribeAudio,
  synthesizeSpeech,
  downloadLineAudio,
  buildMultilingualConfirmationText
} from './_voice-service.js';`;
  content = content.replace(importTarget, importReplacement);
}

// 2. 擴充 message 處理條件支援 text 與 audio
const oldLoopCondition = "if (event.type === 'message' && event.message?.type === 'text') {";
const newLoopCondition = `if (event.type === 'message' && (event.message?.type === 'text' || event.message?.type === 'audio')) {
      const isVoice = event.message.type === 'audio';
      const replyToken = event.replyToken;
      const userId = event.source?.userId;
      if (!replyToken) continue;

      let userText = '';
      let detectedLang = 'zh-TW';

      if (isVoice) {
        try {
          console.log(\`[LINE Webhook] 收到語音訊息 (ID: \${event.message.id})，正在下載並辨識...\`);
          const audioBuffer = await downloadLineAudio(event.message.id, channelAccessToken);
          const sttResult = await transcribeAudio({ audioBuffer, mimeType: 'audio/m4a' });
          userText = String(sttResult.transcript || '').trim();
          detectedLang = sttResult.language || detectLanguage(userText);
          console.log(\`[LINE Webhook] 語音轉文字完成 [\${detectedLang}]: "\${userText}"\`);
        } catch (audioErr) {
          console.error('[LINE Webhook] 語音辨識失敗:', audioErr.message);
          userText = '（客戶傳送了一段語音訊息，但語音辨識服務暫時無法解析）';
        }
      } else {
        userText = String(event.message.text || '').trim();
        detectedLang = detectLanguage(userText);
      }

      if (!userText) continue;`;

// 檢查並替換
if (content.includes(oldLoopCondition)) {
  // 將原本的 userText, replyToken, userId 定義替換掉
  const blockToReplace = `if (event.type === 'message' && event.message?.type === 'text') {
      const userText = String(event.message.text || '').trim();
      const replyToken = event.replyToken;
      const userId = event.source?.userId;

      if (!userText || !replyToken) continue;`;
  
  if (content.includes(blockToReplace)) {
    content = content.replace(blockToReplace, newLoopCondition);
  } else {
    // 考慮換行符號不同
    content = content.replace(/\r\n/g, '\n');
    const unixBlock = blockToReplace.replace(/\r\n/g, '\n');
    content = content.replace(unixBlock, newLoopCondition);
  }
}

// 3. 在 prompt 處理中加入多語系語言提示 (若非 zh-TW)
const promptInjectionTarget = "const isExpert = complexityMode === 'expert';";
const promptInjectionCode = `const isExpert = complexityMode === 'expert';

        // 多語系指令注入 (中/英/台/越)
        let multiLangDirective = '';
        if (detectedLang === 'vi') {
          multiLangDirective = '\\n\\n【🌐 語言指令】：客戶使用越南文 (Tiếng Việt)，請務必使用親切自然的越南文回答，金額與規格請嚴格遵守官方標準！';
        } else if (detectedLang === 'nan') {
          multiLangDirective = '\\n\\n【🌐 語言指令】：客戶使用台語 (臺灣閩南語)，請用親切在地台語口吻（台語漢字）回答，金額與規格請嚴格遵守官方標準！';
        } else if (detectedLang === 'en') {
          multiLangDirective = '\\n\\n【🌐 語言指令】：Customer speaks English. Please respond strictly in polite and clear English conforming to official pricing!';
        }`;

if (!content.includes('multiLangDirective') && content.includes(promptInjectionTarget)) {
  content = content.replace(promptInjectionTarget, promptInjectionTarget + '\n\n        ' + promptInjectionCode);
  // 在 systemInstruction 加上 multiLangDirective
  content = content.replace(
    'getOptimizedSystemPrompt(userText, complexityMode, orderStateContext)',
    'getOptimizedSystemPrompt(userText, complexityMode, orderStateContext) + multiLangDirective'
  );
}

// 4. 回覆給 LINE 使用者時，若為語音，前綴加上辨識標註
const replyLineTarget = "await replyLineMessage(replyToken, [{\n            type: 'text',\n            text: aiResult.text\n          }], channelAccessToken);";
const replyLineReplacement = `const finalText = isVoice 
            ? \`🎙️ 【盛隆 AI 語音辨識 (\${detectedLang})】\\n「\${userText}」\\n\\n\${aiResult.text}\`
            : aiResult.text;

          await replyLineMessage(replyToken, [{
            type: 'text',
            text: finalText
          }], channelAccessToken);`;

if (content.includes("text: aiResult.text")) {
  content = content.replace(
    "text: aiResult.text",
    "text: (typeof isVoice !== 'undefined' && isVoice) ? `🎙️ 【盛隆 AI 語音辨識 (${detectedLang})】\\n「${userText}」\\n\\n${aiResult.text}` : aiResult.text"
  );
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ 成功升級 api/line-webhook.js 支援四語 (中/英/台/越) 語音！');
