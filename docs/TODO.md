# 📌 盛隆瓦斯系統 - 全局任務看板與待完成項目清單 (TODO Board)

> **最高決策者**：老闆 (Telegram ID: `8862712587`，唯一 SuperAdmin)  
> **專案倉庫**：https://github.com/qazwsx32100/gass 與 https://github.com/qazwsx32100/shenglong-next  
> **指定雲端資料夾**：[Google 雲端維護紀錄資料夾](https://drive.google.com/drive/u/1/folders/1YT7yfMfVmiVic_vaIWf94Ei14wMa3FYM) (`1YT7yfMfVmiVic_vaIWf94Ei14wMa3FYM`)  
> **桌面即時鏡像**：`C:\Users\懶\Desktop\盛隆瓦斯_進行中與待完成項目看板.md`  
> **最後更新時間**：2026-10-11 12:40

---

## 🚀 一、 進行中項目 (In Progress)
> 當前正在實作、調試、或等待最後發布/配置驗證的任務

### 1. GitHub Actions 遠端觸發端點與環境部署
- **狀態**：`[/]` 進行中 (程式與單元測試 100% 通過，待 Commit 推播與 Vercel 變數設置)
- **優先級**：`P1`
- **負責設備/端點**：`Vercel 雲端 API (/api/trigger-github-workflow)` ＆ `GitHub Actions`
- **估計花費時間**：10 ~ 15 分鐘 (完成 Git 提交與 Vercel PAT 填寫即可全線就緒)
- **老闆指示備註**：後台管理端可安全非阻塞調用 GitHub Actions 執行會員同步或備份檢測，PAT 金鑰嚴禁外洩。
- **關聯文件**：
  - 端點程式：[`api/trigger-github-workflow.js`](file:///c:/Gass/api/trigger-github-workflow.js)
  - 單元測試：[`tests/trigger-github-workflow.test.mjs`](file:///c:/Gass/tests/trigger-github-workflow.test.mjs)
  - 環境範例：[`.env.example`](file:///c:/Gass/.env.example)

---

## ⏳ 二、 近期高優先待辦 (High Priority / Next Sprint)
> 已明確排定、準備啟動的核心重要工程

### 1. LINE 訂單自動匯入舊進銷存系統 - 階段 1：資料庫結構逆向分析
- **狀態**：`[ ]` 待辦 (等待排定執行)
- **優先級**：`P0` (核心營運自動化)
- **負責設備/端點**：`店面主力 Windows 主機 (SQL Server 127.0.0.1:1000)`
- **估計花費時間**：1 個工作天 (在店面主機執行一次唯讀結構分析腳本)
- **老闆指示備註**：打通線上叫瓦斯到店面系統的最後一哩路，省去人工看 Telegram 抄單鍵單。採用主動拉單 (Pull-Agent)，免開對外 Port、免固定 IP。
- **具體任務**：
  - [ ] 執行 SQL 結構分析腳本，確認訂單主檔表名 (例如 `dbo.orders`) 與明細檔表名
  - [ ] 確認商品代號對照表 (50kg / 20kg / 16kg / 4kg 等)
  - [ ] 確認優惠折讓處理欄位 (單獨折扣欄位或負數品項)
- **關聯文件**：
  - 專案報告書：[`LINE_訂單自動匯入舊進銷存系統_專案計畫報告書.md`](file:///c:/Gass/LINE_訂單自動匯入舊進銷存系統_專案計畫報告書.md)

### 2. LINE 訂單自動匯入舊進銷存系統 - 階段 2：雲端佇列端點與本地 Daemon 開發
- **狀態**：`[ ]` 待辦 (待階段 1 確認後啟動)
- **優先級**：`P0`
- **負責設備/端點**：`Vercel 雲端佇列 API` ＆ `店面 Windows 背景 Service`
- **估計花費時間**：2 個工作天
- **老闆指示備註**：以 FIFO 保證順序，斷網或關機時佇列安全保留，復電連網後自動補單，杜絕重複扣庫存。
- **具體任務**：
  - [ ] 雲端新增 `GET /api?action=pending-ingest-orders`
  - [ ] 雲端新增 `POST /api?action=mark-ingest-success`
  - [ ] 開發本地常駐程式 `shenglong_order_ingest_daemon.py` (每 5 秒輪詢拉單寫入 SQL)
  - [ ] 串接 Telegram 入單成功即時推播通知
- **關聯文件**：
  - 專案報告書：[`LINE_訂單自動匯入舊進銷存系統_專案計畫報告書.md`](file:///c:/Gass/LINE_訂單自動匯入舊進銷存系統_專案計畫報告書.md)

### 3. FAQ 300 題知識庫深度注入 LINE Webhook AI 回覆引擎
- **狀態**：`[ ]` 待辦
- **優先級**：`P1`
- **負責設備/端點**：`Vercel 雲端 API (/api/line-webhook.js)` ＆ `AI Prompt / RAG`
- **估計花費時間**：2 ~ 3 小時
- **老闆指示備註**：300 題官方知識庫已完成，需將盛隆營業政策（無退殘氣、無電梯樓層費、手寫發票等）與安全緊急指引完全融入 AI，避免模型脫稿幻覺。
- **具體任務**：
  - [ ] 建立知識庫快選檢索機制或 System Prompt 模組化切片
  - [ ] 實測漏氣緊急問答、各規格瓦斯用途與計費方式比對
- **關聯文件**：
  - 知識庫文件：[`docs/GAS_CONSUMER_FAQ_300.md`](file:///c:/Gass/docs/GAS_CONSUMER_FAQ_300.md)
  - Webhook 程式：[`api/line-webhook.js`](file:///c:/Gass/api/line-webhook.js)

---

## 📋 三、 中長期優化與願景庫 (Backlog)
> 次要優化、硬體補強或中長期擴充規劃

### 1. 店面主力主機小型不斷電系統 (UPS) 評估與配置
- **狀態**：`[ ]` 規劃中
- **優先級**：`P2`
- **負責設備/端點**：`店面實體硬體設備`
- **估計花費時間**：硬體採購約 1 ~ 2 天，安裝 15 分鐘
- **老闆指示備註**：預算約 NT$ 1,500 ~ 2,500，防止台電突發跳電造成 SQL Server 寫入中斷或硬碟損毀。
- **關聯文件**：
  - 專案報告書 2.2 節：[`LINE_訂單自動匯入舊進銷存系統_專案計畫報告書.md`](file:///c:/Gass/LINE_訂單自動匯入舊進銷存系統_專案計畫報告書.md)

### 2. 司機外勤 App 功能擴充 (回收鋼瓶與現場收款回填)
- **狀態**：`[ ]` 規劃中
- **優先級**：`P2`
- **負責設備/端點**：`Android 外勤司機 App (游柏林 / 小龍 / 通用版)`
- **估計花費時間**：1 ~ 2 個工作天
- **老闆指示備註**：外勤完成配送後，加強現場空瓶檢查與現金/轉帳即時註記功能。
- **關聯文件**：
  - 下載導引頁：[`src/pages/DownloadDriver.jsx`](file:///c:/Gass/src/pages/DownloadDriver.jsx)

---

## ✅ 四、 近期已驗收完成 (Recently Completed)
> 近期完成之重要項目，標註完成時間、負責設備與詳細發布紀錄

### 1. LINE AI 客服對話歷程自動持久化儲存、視覺化看板與多端調閱系統
- **完成日期**：2026/10/11
- **負責設備/端點**：`Supabase (public.line_ai_logs)` ＆ `Vercel (/api/line-ai-logs)` ＆ `Telegram (@shenlong_advisor_bot)`
- **老闆指示備註**：所有客戶與 AI 客服的對話完整留存、統計 token/耗時與叫瓦斯意圖，支援瀏覽器綠色氣泡看板與 Telegram `/line` 查閱。
- **關聯詳細記錄**：[`docs/GOOGLE_DRIVE_RELEASE_RECORD.md#20261011---line-ai-客服對話歷程自動持久化儲存`](file:///c:/Gass/docs/GOOGLE_DRIVE_RELEASE_RECORD.md)

### 2. 消費者常見問題 300 題完整知識庫與 20 大分類官方文件建立
- **完成日期**：2026/10/11
- **負責設備/端點**：`docs/GAS_CONSUMER_FAQ_300.md` ＆ 老闆桌面備份
- **老闆指示備註**：涵蓋漏氣應急、爐具熱水器故障、規格價格、安檢法規與盛隆專屬政策（02-2972-5559、現金手寫發票等）。
- **關聯詳細記錄**：[`docs/GOOGLE_DRIVE_RELEASE_RECORD.md#20261011---消費者常見問題-300-題`](file:///c:/Gass/docs/GOOGLE_DRIVE_RELEASE_RECORD.md)

### 3. 全端 AI 自動輪調系統 (Port 3333) 與 3 組付費帳號容災監控中心
- **完成日期**：2026/10/11
- **負責設備/端點**：`本地主機 (tools/gemini-rotator)` ＆ `Vercel (/api/ai-status)`
- **老闆指示備註**：整合 3 組 Google 付費帳號 (qaz/無名/神燈) + 1 組 OpenAI 備援，支援故障自動轉移與負載分攤，全面切換為官方最新 `gemini-3.8-flash`。
- **關聯詳細記錄**：[`docs/GOOGLE_DRIVE_RELEASE_RECORD.md#20261011---全端-ai-自動輪調系統`](file:///c:/Gass/docs/GOOGLE_DRIVE_RELEASE_RECORD.md)

### 4. 翡翠綠鋼瓶純白去背冷啟動畫面 (Splash Screen) ＆ 司機專屬下載頁改版
- **完成日期**：2026/10/09
- **負責設備/端點**：`Android Release APK` ＆ `Vercel (/download-driver)`
- **老闆指示備註**：游柏林、小龍與通用版 APK 簽章完成並置於桌面與公開下載頁，冷啟動畫面純淨高質感。
- **關聯詳細記錄**：[`docs/GOOGLE_DRIVE_RELEASE_RECORD.md#20261009-下午---外觀與-app-體驗全面升級`](file:///c:/Gass/docs/GOOGLE_DRIVE_RELEASE_RECORD.md)
