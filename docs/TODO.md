# 📌 盛隆瓦斯系統 - 全局任務看板與待完成項目清單 (TODO Board)

> **最高決策者**：老闆 (Telegram ID: `8862712587`，唯一 SuperAdmin)  
> **專案倉庫**：https://github.com/qazwsx32100/gass 與 https://github.com/qazwsx32100/shenglong-next  
> **指定雲端資料夾**：[Google 雲端維護紀錄資料夾](https://drive.google.com/drive/u/1/folders/1YT7yfMfVmiVic_vaIWf94Ei14wMa3FYM) (`1YT7yfMfVmiVic_vaIWf94Ei14wMa3FYM`)  
> **桌面即時鏡像**：`C:\Users\懶\Desktop\盛隆瓦斯_進行中與待完成項目看板.md`  
> **最後更新時間**：2026-10-16 14:36

---

## 🚀 一、 進行中項目 (In Progress)
> 當前正在實作、調試、或等待最後發布/配置驗證的任務

### 1. 移除 ERP 股東簡易預設密碼後門與客戶歷史查詢防枚舉加固 (Anti-Tampering & Data Enumeration Hardening)
- **狀態**：`[/]` 進行中
- **優先級**：`P0` (核心帳務防竄改與客戶個資防枚舉)
- **負責設備/端點**：`ERP 登入驗證 (api/auth-login.js, website/api/auth.js, src/db/storage.js)` ＆ `客戶歷史查詢 (api/_customer-history.js)` ＆ `排程備份驗證 (api/cron-daily-backup.js)`
- **老闆指示備註**：徹底移除 `1234` 與 `6789` 簡易預設密碼後門與明文比對，強制全面走 PBKDF2-SHA256 / HMAC-SHA256 高強度雜湊驗證，杜絕有心人士以股東名義猜測簡易密碼竄改帳目；同時為 `/api/customer-history` 加上 IP 頻率限制與最小電話/姓名查詢長度門檻，防止單字元模糊查詢撈出全店客戶訂單。

---

## ⏳ 二、 近期高優先待辦 (High Priority / Next Sprint)
> 已明確排定、準備啟動的核心重要工程

### 1. Google Search Console 索引與 Sitemap 提交
- **狀態**：`[x]` 已完成 (Googlebot 已成功排入索引隊列，Sitemap 已建立)
- **優先級**：`P0` (SEO 排行榜衝刺關鍵)
- **負責帳號**：`shenglonggas@gmail.com`
- **目標網址**：`https://shenglong-gas.vercel.app/`
- **完成項目**：
  - [x] 進入 Google Search Console，在最上方搜尋框輸入 `https://shenglong-gas.vercel.app/`
  - [x] 點擊「要求建立索引 (Request Indexing)」，強制 Googlebot 抓取最新「三重瓦斯」Title 與在地 Schema
  - [x] 左側選單進入「Sitemaps」，提交 `sitemap.xml`
- **成果**：所有權 100% 驗證完成，Google 搜尋生成式 AI (SGE) 權限已啟用，最新三重關鍵字權重正式進入 Google 索引核心排程。

### 2. LINE 訂單自動匯入舊進銷存系統 - 階段 2：雲端佇列端點與本地 Daemon 開發
- **狀態**：`[x]` 已完成 (雲端佇列端點與本地 Ingest Daemon 測試全數 100% 通過)
- **優先級**：`P0`
- **負責設備/端點**：`Vercel 雲端佇列 API (web/api/index.js)` ＆ `店面 Windows 常駐 Daemon (scripts/shenglong_order_ingest_daemon.py)`
- **估計花費時間**：1.5 個工作天
- **老闆指示備註**：以 FIFO 保證順序，斷網或關機時佇列安全保留，復電連網後自動補單，杜絕重複扣庫存。
- **完成項目**：
  - [x] 雲端新增 `GET /api?action=pending-ingest-orders` (驗證內部密鑰，讀取未匯入且未取消訂單)
  - [x] 雲端新增 `POST /api?action=mark-ingest-success` (更新 Sheets 狀態為已接單，回填舊系統單號至 O/P/Q 欄)
  - [x] 開發本地常駐程式 `shenglong_order_ingest_daemon.py` (支援 Windows UTF-8/cp950 防護、電話比對客戶、防重入 Idempotency Key、寫入 `dbo.gas_oders`、`music='T'` 觸發店面電腦響鈴)
  - [x] 串接 Telegram 入單成功即時推播通知 (含舊進銷存單號、規格數量、金額與導航)
  - [x] 完成 Node.js API 測試 (22 項) 與 Python 單元及實體 SQL Server 連線測試 (3 項) 100% 綠燈
- **關聯文件**：
  - 專案報告書：[`LINE_訂單自動匯入舊進銷存系統_專案計畫報告書.md`](file:///c:/Gass/LINE_訂單自動匯入舊進銷存系統_專案計畫報告書.md)
  - 本地 Daemon：[`scripts/shenglong_order_ingest_daemon.py`](file:///c:/Gass/scripts/shenglong_order_ingest_daemon.py)
  - 測試套件：[`tests/test_order_ingest_daemon.py`](file:///c:/Gass/tests/test_order_ingest_daemon.py)

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

### 1. LINE 訂單自動匯入舊進銷存系統 - 階段 1：資料庫結構逆向分析
- **完成日期**：2026/10/13
- **負責設備/端點**：`店面主力 Windows 主機 (SQL Server ShengLong_Inspection / gas_station_ShengLong)`
- **老闆指示備註**：完成全庫 50 張表與訂單主表 `dbo.gas_oders`（234,769 筆）、客戶表 `dbo.customers`（3,903 筆）之 34 欄位完整逆向對齊。確認舊系統為單一寬表設計（`oder_50kg`~`oder_4kg` 同一列寫入，無獨立明細表）、主鍵 `oder_id` 為 `IDENTITY(1,1)` 自動配號、內建 `discount` 折讓與 `tip` 樓層費欄位、`deliver = '稍後輸入'` 待派工狀態與 `music = 'T'` 店面響鈴觸發機制。
- **關聯詳細記錄**：[`LINE_訂單自動匯入舊進銷存系統_專案計畫報告書.md#43-模組-c舊系統資料庫欄位對齊與逆向工程`](file:///c:/Gass/LINE_訂單自動匯入舊進銷存系統_專案計畫報告書.md)

### 2. 系統監控看板整合「🤖 AI 客服輪調中心」獨立分頁旗艦版 (選項 B 深度監控)
- **完成日期**：2026/10/13
- **負責設備/端點**：`Next.js 營運主控台 (/system-status)` ＆ `AI 輪調 API (/api/ai-status)` ＆ `AiRotatorDashboard.tsx`
- **老闆指示備註**：依老闆拍板之「選項 B（頂部獨立分頁切換＋豐富深度資訊）」，於系統健康看板頂部建立「🖥️ 主機與核心五大支柱監控」與「🤖 AI 客服輪調中心」雙分頁；AI 輪調中心涵蓋 6 大核心 KPI 儀表卡、4 層動態故障轉移拓撲圖、4 組 AI 帳號（qaz / 無名 / 神燈 / OpenAI 兜底）即時配額水位與 429 冷卻倒數、一鍵全節點連線測速 (Ping)、模擬 429 限流演練、即時輪調問答實測沙盒與審計日誌。
- **關聯詳細記錄**：[`AiRotatorDashboard.tsx`](file:///c:/shenglong-next/app/components/AiRotatorDashboard.tsx)、[`SystemStatusView.tsx`](file:///c:/shenglong-next/app/components/SystemStatusView.tsx)、[`route.ts`](file:///c:/shenglong-next/app/api/ai-status/route.ts)

### 2. GitHub Actions 遠端觸發端點與環境部署自動建置
- **完成日期**：2026/10/13
- **負責設備/端點**：`Vercel 雲端 API (/api/trigger-github-workflow)` ＆ `GitHub Actions (.github/workflows/)` ＆ `本機環境 (.env)`
- **老闆指示備註**：自動擷取本機 Git 憑證管理員內建之 `qazwsx32100` 授權 Token (含 `repo` 與 `workflow` 權限)，自動寫入 `c:\Gass\.env` 與 `c:\shenglong-next\.env`，並於倉庫根目錄 `.github/workflows/` 部署 `sync-members.yml` 與 `inspect-backup.yml` 工作流，10 項單元測試 100% 通過。
- **關聯詳細記錄**：[`api/trigger-github-workflow.js`](file:///c:/Gass/api/trigger-github-workflow.js)、[`.github/workflows/sync-members.yml`](file:///c:/Gass/.github/workflows/sync-members.yml)

### 2. 全維度安全性與 API 穩定度 8 大角度深度壓力測試與邊界補強 (Multi-Angle Security & Stability QA)
- **完成日期**：2026/10/13
- **負責設備/端點**：`全站 API (api/, website/api/)` ＆ `單元測試 (tests/multi-angle-security-and-stability.test.mjs)`
- **老闆指示備註**：從「邊界極端負載與原型污染防禦、高頻突發併發與記憶體上限保護、JWT 偽造與權限穿透矩陣、方法容錯與敏感金鑰零外洩、CORS/HSTS 安全標頭審查、LINE Webhook 端到端簽章強制檢核、CMS 未授權寫入攔截、多層反向代理真實 IP 辨識」8 大角度完成 16 項深度測試；同步補強 `createToken` 自訂效期支援與 `ai-chat` Null Byte 控制字元入口攔截，全庫 190 項單元測試 100% 綠燈通過（耗時僅 3.5s）。
- **關聯詳細記錄**：[`docs/GOOGLE_DRIVE_RELEASE_RECORD.md#20261013---全維度安全性與-api-穩定度-8-大角度深度測試`](file:///c:/Gass/docs/GOOGLE_DRIVE_RELEASE_RECORD.md)

### 2. 網頁與雲端 API 全方位安全防禦機制重大升級 (Web & API Security Hardening)
- **完成日期**：2026/10/13
- **負責設備/端點**：`官方網站 (website/)` ＆ `雲端 API (api/, website/api/)` ＆ `Vercel 安全設定 (vercel.json)` ＆ `單元測試 (tests/web-and-api-security.test.mjs)`
- **老闆指示備註**：落實全端防暴力破解 (Rate Limiting)、DOM XSS 輸入過濾、防 AI 額度盜刷、LINE 客戶對話隱私授權保護、時序安全比對與 HSTS/CSP/COOP/CORP 嚴格安全標頭，9 項專屬安全測試與全庫 174 項單元測試 100% 綠燈通過。
- **關聯詳細記錄**：[`docs/GOOGLE_DRIVE_RELEASE_RECORD.md#20261013---網頁與雲端-api-全方位安全防禦機制升級`](file:///c:/Gass/docs/GOOGLE_DRIVE_RELEASE_RECORD.md)

### 2. LINE AI 客服真・循環輪調 (Round-Robin) 與智慧雙模分流 (Hybrid Router) 全面實作
- **完成日期**：2026/10/12
- **負責設備/端點**：`Vercel (/api/_ai-rotator.js, /api/line-webhook.js, /api/_knowledge-base.js)` ＆ `單元測試 (tests/ai-rotator.test.mjs)`
- **老闆指示備註**：老闆親自裁定採用「方案 B 智慧雙模分流」+「真輪調」。簡單問題（查價、叫單、營業時間）以 Flash 輕量秒回（0.5s）；複雜疑難（爐具故障、熱水器忽冷忽熱、漏氣排險、異常耗量）自動升級條理化專家推理模式（Temperature 0.3 診斷指導）。3 組 Google 帳號（qaz、無名、神燈）以原子指標循環輪替（Round-Robin），徹底均分請求壓力，遇 429 容錯並由 OpenAI 兜底。
- **關聯詳細記錄**：[`docs/GOOGLE_DRIVE_RELEASE_RECORD.md#20261012---line-ai-真輪調與雙模分流`](file:///c:/Gass/docs/GOOGLE_DRIVE_RELEASE_RECORD.md)

### 2. LINE AI 智慧客服全面優化與 20 大分類 300 題知識庫動態檢索系統
- **完成日期**：2026/10/12
- **負責設備/端點**：`Vercel (/api/line-webhook.js)` ＆ `知識庫模組 (api/_knowledge-base.js)` ＆ `單元測試 (tests/knowledge-base.test.mjs)`
- **老闆指示備註**：300 題官方知識庫深度注入 AI Prompt，盛隆營業政策（電話 02-2972-5559、現金手寫發票、08:00~21:00、無退殘氣等）硬核約束，漏氣最高安全指引第一優先。
- **關聯詳細記錄**：[`docs/GOOGLE_DRIVE_RELEASE_RECORD.md#20261012---line-ai-智慧客服全面升級`](file:///c:/Gass/docs/GOOGLE_DRIVE_RELEASE_RECORD.md)

### 2. LINE AI 客服對話歷程自動持久化儲存、視覺化看板與多端調閱系統
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
