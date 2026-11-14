const fs = require('fs');

const newLog = `## [2026-11-14 15:30] - 🚀 司機端訂單卡片移除冗餘精簡狀態標籤 (第 5 行) [ver: 20261114_1530_driver_card_remove_chips_row]
- **背景與老闆決策**：
  - 老闆指示：「精簡狀態標籤 這先不用 其他幫我做」。
- **落實與優化細節**：
  1. **移除第 5 行冗餘資訊標籤列 (Chips)**：
     - 自 app/driver/page.tsx 完全移除第 5 行標籤列（含支數運費標籤、樓層費標籤、現場備桶回報標籤、同路段順路標籤等），進一步縮減卡片垂直高度至 ~120px - 140px。
  2. **其他 5 大排版功能全量保持與生效**：
     - 第 1 行：狀態膠囊 + 派單時間 ＋ 右上角（超過 150 天挑桶黃框 ＋ 桶子規格綠框 ＋ 瓦斯價格）。
     - 第 2 行：純路名門牌地址大字 + 大門定點標記/距離。
     - 第 3 行：客戶名稱 ＋ 門牌附註備註（C、備1、單 等）同行整齊陳列。
     - 第 4 行：📞 其他電話： 專屬讀取市話與手機（支援直撥） ＆ 📝 訂單備註： ＆ 歷史欠款。
     - 底部列：選項 A 緊湊雙側佈局（左側：導航/電話/回報，右側：一鍵接單/送達收款）。
- **全端驗證與生產部署**：
  - 專屬測試 tests/driver-compact-card-and-customer-remarks.test.mjs (8/8 PASS)。
  - 全套外勤回歸測試 (22/22 PASS)。
  - Next.js 最佳化生產建置通過，GitHub 雙軌推送，Vercel Production 生效。
`;

const todoItem = '- [x] 2026-11-14 【司機端訂單卡片移除冗餘精簡狀態標籤 (第 5 行)】依老闆指示移除卡片第 5 行冗餘標籤列，卡片高度降至 ~120px-140px，更加俐落；完整保留第 1 行挑桶黃框與規格綠框、第 2 行純地址、第 3 行客戶與門牌備註(C/備1/單)、第 4 行其他電話(直撥)與訂單備註，以及選項 A 底部按鈕（shenglong-next bc4ed19）\\n';

// 1. Update docs/TODO.md
let todoContent = fs.readFileSync('docs/TODO.md', 'utf8');
todoContent = todoItem + todoContent;
const markPos = todoContent.indexOf('## [2026-11-14 14:15]');
if (markPos !== -1) {
  todoContent = todoContent.slice(0, markPos) + newLog + '\n---\n\n' + todoContent.slice(markPos);
}
fs.writeFileSync('docs/TODO.md', todoContent, 'utf8');
console.log('docs/TODO.md updated');

// 2. Update CHANGELOG.md
let changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
changelog = newLog + '\n---\n\n' + changelog;
fs.writeFileSync('CHANGELOG.md', changelog, 'utf8');
console.log('CHANGELOG.md updated');

// 3. Update docs/GOOGLE_DRIVE_RELEASE_RECORD.md
let driveRec = fs.readFileSync('docs/GOOGLE_DRIVE_RELEASE_RECORD.md', 'utf8');
driveRec = newLog + '\n---\n\n' + driveRec;
fs.writeFileSync('docs/GOOGLE_DRIVE_RELEASE_RECORD.md', driveRec, 'utf8');
console.log('docs/GOOGLE_DRIVE_RELEASE_RECORD.md updated');

// 4. Mirror to Desktop
const desktopPath = 'C:\\Users\\懶\\Desktop\\盛隆瓦斯_進行中與待完成項目看板.md';
try {
  fs.writeFileSync(desktopPath, todoContent, 'utf8');
  console.log('Desktop mirror updated successfully');
} catch (e) {
  console.log('Desktop mirror error:', e.message);
}
