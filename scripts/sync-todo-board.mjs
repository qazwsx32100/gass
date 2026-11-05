import fs from 'node:fs';
import path from 'node:path';

const todoPath = path.resolve(process.cwd(), 'docs/TODO.md');
const desktopPath = 'C:\\Users\\懶\\Desktop\\盛隆瓦斯_進行中與待完成項目看板.md';

let content = fs.readFileSync(todoPath, 'utf8');

const newSection = `### 0. 盛隆瓦斯 四語 AI 語音助理與多語系語音下單系統 (中/英/台/越 STT + NLU + TTS 雙向閉環)
- **狀態**：\`[ ]\` 進行中 (依老闆最高決策指令「我要做 AI 語音，要有中文、英文、台語、越南文，讓客人可以直接語音問AI問題、下訂單，接收/送出 中/英/台/越 語音」，全面啟動盛隆四語 AI 語音體系：
  1. **多語系語音識別 (STT)**：支援中文 (zh-TW)、英文 (en)、越南文 (vi-VN)、臺灣閩南語 (nan/台語)，整合雙引擎容錯架構與在地瓦斯專用提示詞 (Prompt Injection)。
  2. **多語系大腦決策 (NLU)**：自動偵測語言、對接盛隆 300 題官方知識庫與標準成本定價、多輪語音訂單要素（規格、數量、地址、樓層、電話）智慧擷取。
  3. **多語系語音合成 (TTS)**：依據客人語系動態合成自然流暢的中、英、越、台語音檔。
  4. **LINE 官方帳號語音雙向閉環**：Webhook 深度整合 \`message.type === 'audio'\`，客人傳語音訊息秒級回覆「語音訊息＋文字確認卡片」。
  5. **下單防呆確認機制**：語音下單嚴格落實覆誦確認與防呆卡片，杜絕外送師傅爬樓梯白跑。
  6. **神聖黑盒子與成本守護**：嚴格遵守舊 ERP 黑盒子零更動鐵律，恪守官方標準成本、運費與定價標準。
  7. **全量測試驗證**：建立端到端多語系單元測試與模擬驗證，確保既有 351+ 測試零回歸)
- **優先級**：P0 (老闆最高決策指令)
- **開始日期**：2026/11/05

---
`;

if (!content.includes('四語 AI 語音助理')) {
  // 插入在第 9 行 (第一個 --- 之後)
  const marker = '---\n';
  const pos = content.indexOf(marker);
  if (pos !== -1) {
    content = content.slice(0, pos + marker.length) + '\n' + newSection + '\n' + content.slice(pos + marker.length);
  }
  fs.writeFileSync(todoPath, content, 'utf8');
}

try {
  fs.writeFileSync(desktopPath, content, 'utf8');
  console.log('✅ 成功同步 TODO.md 與桌面看板鏡像！');
} catch (e) {
  console.log('⚠️ 桌面鏡像同步失敗:', e.message);
}
