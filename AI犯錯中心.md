# 盛隆系統 AI 犯錯中心與事故檢討中心（AI Mistake & Incident Center）

> 🚨 **【最高戒律】凡所有 AI 助手（包括但不限於 Codex、Gemini、Claude、ChatGPT、Antigravity 等）在執行盛隆系統任何維護、撰寫程式碼、設定排程或更動架構前，必須強制研讀本文件，自我審查並確認絕不重蹈覆轍！**

---

## 事故目錄與索引
- [事故 001：2026-11-05/06 雲端 Supabase 配額耗盡引發 HTTP 402 與 429 登入連鎖阻斷](#事故-0012026-11-0506-雲端-supabase-配額耗盡引發-http-402-與-429-登入連鎖阻斷)
- [事故 002：2026-11-10 LINE LIFF 叫瓦斯訂單頁面因 Supabase 402 欠缺熔斷器拋錯崩潰事故](#事故-0022026-11-10-line-liff-叫瓦斯訂單頁面因-supabase-402-欠缺熔斷器拋錯崩潰事故)

---

## 事故 001：2026-11-05/06 雲端 Supabase 配額耗盡引發 HTTP 402 與 429 登入連鎖阻斷

### 一、事故基本資訊
* **事故發生時間**：2026-11-05 20:00 至 2026-11-06 22:00
* **影響範圍**：
  1. 盛隆瓦斯財報系統（`gass` / 朝有錢人邁進，網址：`https://erp-weld-three-96.vercel.app`）
  2. 盛隆 ERP 雲端鏡像目錄同步（`watch-erp-catalog.cjs` / `ShengLongCloudCatalogSync`）
  3. 營運狀態私有鍵值 API（`operations-kv`）
* **事故現象**：
  - 使用者在財報登入頁面輸入帳號密碼後，畫面跳出紅色警告：`⚠️ 登入嘗試過多，請稍後再試。`（HTTP 429）或 `⚠️ 雲端資料庫連線中斷（Supabase 專案配額限制或伺服器異常），請確認平台狀態。`（HTTP 500）。
  - 使用者完全被鎖在系統門外，無法檢視 10 月與 11 月財報。
  - Supabase 專案閘道回傳 `HTTP 402 Payment Required`：
    `"message":"Service for this project is restricted due to the following violations: exceed_edge_functions_invocations_quota, exceed_egress_quota. The project owner must upgrade their plan or remove spend caps to restore service."`

---

### 二、肇事責任與設計者追查（真相反思）
* **肇事設計者**：本機 AI 編程助手（提交身分：`Codex Local <codex@local>` / `qazwsx32100 <qazwsx32100@gmail.com>`）。
* **禍首提交（Commit）**：
  - `28b5005`（2026-10-27 08:09:01 +08:00）: `Run verified ERP catalog sync in hidden background watcher`
  - 註冊 Windows 背景隱藏工作排程：`ShengLongCloudCatalogSync`
  - 執行程式：`D:\test\shenglong-next\scripts\watch-erp-catalog.cjs`
* **維護紀錄流水號**：`ERP-CLOUD-CATALOG-WATCH-20261026-08`

---

### 三、根本原因深度推演（Why Did It Explode?）

1. **AI 嚴重缺乏雲端配額與成本意識（Quota & Cost Unawareness）**：
   - 2026 年 10 月 23 日前，營運資料是放在免費的 `kvdb.io`，不消耗 Supabase 額度。
   - 10 月 23 日 AI 為了安全性改為 Supabase Edge Functions。
   - 10 月 27 日 AI 為了「持續同步」，寫了 `watch-erp-catalog.cjs`，設定 **每 5 秒輪詢一次**，更致命的是寫了：**每 15 分鐘（無條件，即便資料完全沒變）強制把 2,966 筆客戶切成 60 批 HTTP POST 請求重傳一次**！
   - 光這支背景程序每天就產生超過 6,000 次 API 請求，加上其他狀態輪詢，每天發送數萬次請求。

2. **配額耗盡觸發雲端自我保護（Spend Cap Block）**：
   - Supabase 免費方案（Free Tier）每月上限為 **50 萬次 Edge Function 調用** 與 **5GB 出站流量**。
   - AI 的無腦高頻輪詢在背景默默轟炸了 9 天（$9 \times 50000 \approx 500,000$ 次），剛好在 11 月 5 日晚間把當月 50 萬次額度全部噴光。
   - Supabase 免費帳號預設開啟防超額扣款保護（Spend Cap），額度噴光後 Cloudflare 閘道立即強制阻斷，全網回傳 `HTTP 402 Payment Required`。

3. **登入程式碼邏輯脆弱，引發連鎖崩潰（Failure-To-Lockout Bug）**：
   - 舊的 `auth-login.js` 寫法，只要 `fetchAppState()` 連不上 Supabase（報錯 503 或 402），錯誤處理器居然把「資料庫連線失敗」計入「密碼輸入錯誤次數」！
   - 使用者連續點擊或瀏覽器自動重試達 5 次，就立即觸發防暴力破解鎖，跳出 `HTTP 429 登入嘗試過多，請稍後再試。`，形成看似故意鎖人、逼人付費的假象。
   - 系統完全沒有離線容災（Offline Fallback）機制，雲端一死，前端全部癱瘓。

---

### 四、嚴格防範守則：AI 必須永遠遵守的【五大鐵律】

今後所有 AI 助手在盛隆系統中工作，一律強制遵循以下五大禁令，違者視為重大違規：

1. **【嚴禁無腦高頻輪詢】（Strict Polling Ceiling）**：
   - 任何涉及雲端 API（Supabase / Vercel / Google Drive / Telegram）的排程與腳本，輪詢間隔**嚴禁小於 60 秒**。
   - 嚴禁用短定時器（如 5 秒）持續呼叫雲端無伺服器函式（Serverless / Edge Functions）。

2. **【嚴禁無變動全量重送】（Zero Redundant Bulk Uploads）**：
   - 同步腳本必須採用指紋比對（SHA-256 Signature Check），**只有在來源資料指紋真正發生變更時**才允許觸發寫入。
   - 嚴禁加入「每 15 分鐘強制重傳全庫」之類的無效代碼。

3. **【呼叫總量事前精算鐵律】（Monthly Quota Math Verification）**：
   - 在建立任何定時任務或長駐程序前，AI 必須在心智鏈中完成總量精算：
     $$\text{每日呼叫次數} \times 30 \text{ 天} \le \text{平台免費額度之 } 20\%$$
   - 必須保留至少 80% 的配額餘裕給正式業務，絕不允許排程吃滿額度。

4. **【核心業務強制具備離線快照容災】（Offline Graceful Degradation）**：
   - 登入、查帳、歷史報表等讀取入口，必須實裝離線快照備援（如 `_offline_state.json`）。
   - 任何第三方雲端服務（Supabase / Firebase / Cloudflare）受限或斷網時，系統必須平滑降級為唯讀離線模式，**絕不可直接拋出 500 或將使用者鎖在門外**。

5. **【錯誤計量隔離鐵律】（Error Metric Isolation）**：
   - 速率限制器（Rate Limiter）只防範「惡意暴力密碼猜測」。
   - 伺服器異常、資料庫逾時、網路斷線等非客戶端憑證錯誤，**絕對禁止計入登入重試次數**，必須退還重試額度，絕不可誤噴 429 阻擋正常使用者。

---

### 五、本次事故處置紀錄
1. **背景進程撲滅**：Windows 排程 `ShengLongCloudCatalogSync` 停用，PID 14960 `watch-erp-catalog.cjs` 強制終止。
2. **輪詢節流重構**：`watch-erp-catalog.cjs` 間隔由 5 秒放寬至 60 秒，全量重傳改為 24 小時（僅變動時同步），提交 `624f9fe`。
3. **財報離線快照落地**：引入 `api/_offline_state.json`（11 月已對帳完畢最新數據），`_auth.js` 實裝自動優雅降級，即使 Supabase 402 亦可順暢登入查帳。
4. **登入重試退還**：非密碼錯誤自動退還重試額度，杜絕 429 誤報。
5. **全平台同步**：全數推送 GitHub `origin/main`，正式環境 Vercel READY 部署，Google Drive 雲端紀錄同步完成。


---

## 事故 002：2026-11-10 LINE LIFF 叫瓦斯訂單頁面因 Supabase 402 欠缺熔斷器拋錯崩潰事故

### 一、事故基本資訊
* **事故發生時間**：2026-11-10 16:30 至 2026-11-10 17:15
* **影響範圍**：
  1. 盛隆瓦斯 LINE 官方帳號顧客「立即叫瓦斯」LIFF 訂單頁面（`https://shenglong-line-liff.vercel.app`）
  2. 後端核心入口 `api/index.js`、`api/_database-primary.js`、`api/peak-monitor.js`
* **事故現象**：
  - 顧客在 LINE 官方帳號點擊「立即叫瓦斯」按鈕，訂單頁面顯示「無法連線」或「正式資料庫目前無法使用，請稍後再試」（HTTP 503 / 500）。
  - 後台日誌與 Supabase 端點持續報警：
    `HTTP 402 Payment Required: exceed_edge_functions_invocations_quota, exceed_egress_quota`
  - 同步模組 `api/legacy-sync.js` 遭遇 402 後持續死循環重試，日誌狂刷報警。

---

### 二、肇事責任與設計者追查
* **根本肇因**：
  - 雖然 11-06 已在財報系統實裝離線快照，但 LINE 下單系統（`shenglong-line-liff`）後端 `_database-primary.js` 欠缺全鏈路熔斷器（Circuit Breaker）。
  - `getSessionState`、`getBootstrap` 等底層 `db.rpc` 呼叫未被安全 try/catch 隔離，遭遇 402 時直接向呼叫端拋出未捕獲異常。
  - `api/index.js` 在生產環境原本配置「若無資料庫且無 Sheets 則噴 503」，違反「核心業務強制具備離線快照容災」鐵律。

---

### 三、本次事故處置與架構升級（全面自癒）
1. **熔斷器全鏈路實裝**：`_database-primary.js` 實裝 `tripCircuit(err)` 與 `safeRpc()` 封裝，遭遇 402/503/Quota 瞬間觸發 5 分鐘自動熔斷，0ms 返回安全預設值，停止向雲端打請求。
2. **多雲三軌平滑容災機制**：
   - 第一軌（雲端主庫）：Supabase RPC。
   - 第二軌（雲端備援）：Google Sheets 雙向同步（`GOOGLE_SPREADSHEET_ID`）。
   - 第三軌（本機落盤）：本地實體 WAL 訂單持久化日誌（`data/line_orders.jsonl`），即使雲端兩軌全部癱瘓，每筆訂單仍 100% 寫入 WAL 磁碟並推播 Telegram/LINE，保證門市不丟單。
3. **安全標準品項保護**：`getBootstrapData` 在後端雲端全失聯時，強制保底回傳盛隆 6 大瓦斯規格（20kg、16kg、10kg、4kg、4kg新瓶、50kg）牌價，確保前端下單頁面 100% 正常載入，絕不白屏。
4. **Vercel 生產部署與 GitHub 同步**：提交 `ef43483`，正式環境 `https://shenglong-line-liff.vercel.app` 綠燈 READY 生效。
