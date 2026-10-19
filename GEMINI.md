# 👑 盛隆瓦斯最高執行指令與開發準則 (ShengLong Core Directives)

> **最高決策者**：老闆 (Telegram ID: `8862712587`，唯一 SuperAdmin)  
> **指定雲端資料夾**：[Google 雲端維護紀錄資料夾](https://drive.google.com/drive/u/1/folders/1YT7yfMfVmiVic_vaIWf94Ei14wMa3FYM) (`1YT7yfMfVmiVic_vaIWf94Ei14wMa3FYM`)  
> **官方 GitHub 倉庫**：https://github.com/qazwsx32100/gass 與 https://github.com/qazwsx32100/shenglong-next  

---

## ⚡ 最高的執行指令 (Supreme Directives - 絕對優先遵守)

### 1. 🌐 全系統連動影響預判 (Cross-System Ripple & Impact Analysis)
* **核心鐵律**：做的所有東西，**都必須先試想、評估做了這件事情會不會動到其他系統**。
* **聯動考慮範圍**：所有連動到的系統皆在考慮範圍內，嚴禁單點盲目修改。範例如下：
  * **會員系統 ↔ 訂單系統**：修改會員資料結構、電話、統編或地址時，必須同步檢驗是否影響歷史訂單、新進即時訂單、地址解析、累計消費或會員折扣機制。
  * **訂單系統 ↔ 庫存 / 派單 / 司機 App**：訂單狀態或欄位變更，必須同步確認鋼瓶庫存扣減、司機外送派工推播、配送狀態回傳與雙向同步（如 `sync-stock.cjs`）。
  * **LINE Webhook / AI 客服 ↔ 官方知識庫 ↔ 訂單擷取**：客服提示詞、題庫或 API 變更，必須確認問答意圖命中率、訂單自動擷取管道與歷史對話快取。
  * **財務/應收 ↔ 報表 ↔ 結帳基準**：會計科目或收付款更動，必須確認結帳防護與歷史基準比對。
* **執行標準**：任何功能開發或代碼變更前，必須先在思考與計畫中完成「潛在受波及系統清單」與「相容性/連動防護計畫」。

### 2. 🧪 做的所有事情都必須先測試 (Mandatory Testing & Verification First)
* **核心鐵律**：做的**所有事情都必須先測試**，未經測試驗證絕對不允許交付或上線。
* **執行標準**：
  * **先跑測試或撰寫測試**：更動前檢視既有測試覆蓋範圍，或先建立測試案例（TDD/測試優先思維）。
  * **受波及模組全量驗證**：更動後必須執行相關單元測試與整合測試（如 `npm test`、`node --test tests/*.test.mjs`），驗證受連動影響的所有子系統。
  * **零回歸（Zero Regressions）**：確保所有測試全數通過（目前基準 198+ 通過），無任何副作用、無破壞性變更方可提交。

### 3. 📝 待增加 (Dynamic Expansion Reserved)
* 預留擴充槽位，後續若老闆下達新最高執行指令，隨時依序增補並嚴格落實。

---

## 🚨 強制執行 SOP（每做完一個改動必須執行）：

### 1. 📌 全局任務看板與待完成清單同步 (TODO Board)
* 啟動任務時：立即在 `docs/TODO.md` 登記為待辦或進行中。
* 完成任務時：打勾移入已驗收完成，並覆蓋複製至桌面鏡像：`C:\Users\懶\Desktop\盛隆瓦斯_進行中與待完成項目看板.md`。

### 2. 📚 知識庫與題庫全聯動同步鐵律 (Knowledge Base Full Sync Rule)
* 修改網頁、LINE AI 客服或題庫時，必須強制三方同步：
  1. `docs/GAS_CONSUMER_FAQ_300.md`
  2. `C:\Users\懶\Desktop\盛隆瓦斯_消費者常見問題300題知識庫.md`
  3. `api/_knowledge-base.js`
  4. 執行 `node --test tests/knowledge-base.test.mjs`。

### 3. ☁️ Google 雲端維護紀錄即時更新
* 每完成一項改動，更新 `docs/GOOGLE_DRIVE_RELEASE_RECORD.md` 與 `CHANGELOG.md`，輸出標準雲端日誌。

### 4. 🐙 GitHub 雙軌自動同步
* 提交 Git commit 並推送至 main 分支。

### 5. 🛡️ 雙守護進程與權限保護
* 保障 `sync-stock.cjs` 與 `advisor-bot.cjs` 運作，保護 Telegram ID `8862712587` 唯一 SuperAdmin 權限。

### 6. 📱 桌面 sl 目錄專屬規範 (Desktop sl Folder Rule)
* `C:\Users\懶\Desktop\sl` 專門且僅限存放 Android `.apk` 安裝包，嚴禁堆積文件或雜項。
