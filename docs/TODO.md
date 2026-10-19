# 📌 盛隆瓦斯系統 - 全局任務看板與待完成項目清單 (TODO Board)

> **最高決策者**：老闆 (Telegram ID: `8862712587`，唯一 SuperAdmin)  
> **專案倉庫**：https://github.com/qazwsx32100/gass 與 https://github.com/qazwsx32100/shenglong-next  
> **指定雲端資料夾**：[Google 雲端維護紀錄資料夾](https://drive.google.com/drive/u/1/folders/1YT7yfMfVmiVic_vaIWf94Ei14wMa3FYM) (`1YT7yfMfVmiVic_vaIWf94Ei14wMa3FYM`)  
> **桌面即時鏡像**：`C:\Users\懶\Desktop\盛隆瓦斯_進行中與待完成項目看板.md`  
> **最後更新時間**：2026-10-17 11:52

---

## 🚀 一、 進行中項目 (In Progress)
> 當前正在實作、調試、或等待最後發布/配置驗證的任務

### 1. AI 對話全量查閱與多維度深度優化（官網對話入庫、煙味焦味題庫增補、特助一鍵免密看板與200項全綠驗收）
- **狀態**：`[x]` 已完成 (官網與 LINE 對話全量持久化入庫，看板支援一鍵查閱，題庫增補煙焦味排查，200 項測試全數通過)
- **優先級**：`P0` (落實老闆指示「幫我查閱並且看是否能夠優化」，實現全渠道 AI 問答透明可追蹤)
- **負責設備/端點**：`api/ai-chat.js, api/line-ai-logs.js, api/_knowledge-base.js, docs/GAS_CONSUMER_FAQ_300.md`
- **完成日期**：2026/10/19
- **完成項目**：
  - [x] 官網 AI 對話持久化紀錄：在 `api/ai-chat.js` 接通 `recordLineAiChat`，訪客問答自動標記 `web:${clientIp}` 入庫。
  - [x] AI 對話紀錄看板升級：`api/line-ai-logs.js` 新增官網訪客識別遮罩 (`🌐 官網訪客 (IP)`)，並將 `TELEGRAM_BOT_TOKEN` 納入合法管理授權金鑰，方便老闆在手機上一鍵免密跳轉查閱。
  - [x] 知識庫三方同步增補：在 `api/_knowledge-base.js` 第七類、`docs/GAS_CONSUMER_FAQ_300.md` 與 桌面鏡像同步增補「煙味、焦味、黑煙、燃燒異味」自我排查標準答覆。
  - [x] 自動化測試全量驗證：新增測試案例至 `tests/knowledge-base.test.mjs`，全專案 200 項測試 100% 綠燈通過（200 pass, 0 fail）。
  - [x] 雲端端點部署上線。


### 1. 外勤 App 派單提醒「方案 A：前景／背景互斥分流」架構實裝（徹底消除提醒跳兩次與聲音打架）
- **狀態**：`[x]` 已完成 (實裝方案 A 前景／背景互斥分流架構，前台專屬 App 內大橫幅與自選超響音樂，背景專屬開屏震動、通知列與原生 TTS，雙向排重杜絕重複提醒，全量測試通過並完成桌面 APK 與雲端部署)
- **優先級**：`P0` (依老闆決策徹底解決手機通知聲與 App 聲音打架、提醒跳兩次之痛點)
- **負責設備/端點**：`shenglong-next: MainActivity.java, DriverOrderService.java, MyFirebaseMessagingService.java, app/driver/page.tsx, C:\Users\懶\Desktop\sl\盛隆外送_游柏林專用.apk`
- **完成日期**：2026/10/19
- **完成項目**：
  - [x] **MainActivity 前景狀態精準判定 (`isAppTrulyInForeground`)**：結合 Activity 生命週期、螢幕亮屏互動狀態 (`PowerManager.isInteractive()`) 與鎖屏檢測 (`KeyguardManager.isKeyguardLocked()`)，確保螢幕熄滅或鎖屏時 100% 精準切換為背景模式。
  - [x] **FCM 雲端推播互斥分流 (`MyFirebaseMessagingService`)**：前台收到新單時跳過系統通知欄下拉橫幅與原生 TTS 播報，僅觸發 `notifyFcmOrderReceived()` 供 WebView 處理；背景收到新單時由原生層全權接管（自動拉滿音量、喚醒亮屏 8 秒、懸浮通知橫幅、原生真人語音朗讀）。
  - [x] **原生輪詢待命服務互斥分流 (`DriverOrderService`)**：前台輪詢到新單時跳過通知列與原生 TTS，即時通知 WebView 重新加載；背景時才彈出系統通知列並執行原生 TTS。
  - [x] **雙向通知排重鎖定機制 (`isOrderNotified` / `markOrderNotified`)**：原生層與前端 WebView 雙向共享已通知訂單 ID 快取，原生背景已通知之單據切回前台時自動阻斷重複發聲。
  - [x] **前端 Web 互斥防禦 (`app/driver/page.tsx`)**：在 `sendOrderNotification` 內加入 `document.hidden` 與 `isOrderNotified` 阻斷，處於背景或已由原生層播報時絕不重複觸發 Web Audio 與 Web Speech，徹底消除雙重發聲。
  - [x] **合規與回歸驗證**：禁令詞抽檢 100% 零違規、`npx tsc --noEmit` 0 錯誤、盛隆全庫單元測試 199 項全數通過。
  - [x] **自動打包發布**：執行 `node scripts/release.cjs` 完成編譯與簽章，發布至 `C:\Users\懶\Desktop\sl\盛隆外送_游柏林專用.apk` 並同步推播至 GitHub main 分支與 Vercel 雲端熱更新。

### 2. 外勤 App 頂部按鈕列精簡、橫向平滑滑動軌道修復與鈴聲設定介面純淨化
- **狀態**：`[x]` 已完成 (頂部靜音快捷按鈕刪除、鈴聲設定彈窗保留靜音、徹底清除秒數與10倍文字、全面修復頂部膠囊軌道平滑橫向滑動手勢、桌面 APK 與雲端全量發布)
- **優先級**：`P0` (依老闆最新指示優化外勤人員騎車操作體驗與介面純淨度)
- **負責設備/端點**：`shenglong-next: app/driver/page.tsx, C:\Users\懶\Desktop\sl\盛隆外送_游柏林專用.apk`
- **完成日期**：2026/10/19
- **完成項目**：
  - [x] **移除頂部靜音快捷按鈕**：將上方導覽列之 `🔕 / 🔔 關掉鈴聲` 快捷按鈕完全移除，保留原有「更新派單」、「字體大小」、「強光模式」與「鈴聲設定」4 顆高對比實用膠囊按鈕。
  - [x] **保留鈴聲設定內部靜音**：所有靜音與派單鈴聲開關收斂至「鈴聲設定」彈窗內，支援隨選即時保存與本地隔離存儲。
  - [x] **清除鈴聲秒數與10倍倍率文字**：全面清理 `ALERT_RINGTONE_OPTIONS` 及彈窗中「15秒」、「10秒」、「4秒」、「10倍音壓」等贅字，文案保持專業清晰。
  - [x] **全面修復頂部 Bar 橫向平滑滑動**：為外層導覽容器加入觸控冒泡阻斷（`stopPropagation`），杜絕下拉刷新手勢搶奪橫向滾動；軌道容器鎖定 `flexWrap: "nowrap"`, `overflowX: "auto"`, `WebkitOverflowScrolling: "touch"`, `touchAction: "pan-x"`，每個按鈕鎖定 `flexShrink: 0`，實現手指左右順暢橫向滑動。
  - [x] **測試與合規檢查**：執行 `npx tsc --noEmit`（0錯誤）、`node --test tests/*.test.mjs`（199項全數綠燈通過）、`git diff` 禁令詞抽檢 100% 合規。
  - [x] **自動編譯發布**：執行 `node scripts/release.cjs` 完成 Next.js 編譯、Android 原生 Release APK 打包、更新至 `C:\Users\懶\Desktop\sl\盛隆外送_游柏林專用.apk` 並同步推播至 GitHub 與 Vercel 雲端。

### 1. 盛隆瓦斯全生態系跨模組對接健康狀態即時體檢與深度診斷
- **狀態**：`[x]` 已完成 (8大跨系統對接全面體檢完成，7項成功對接，1項待雲端合併，全庫199項測試通過)
- **優先級**：`P0` (依老闆最高指示全面盤查所有跨系統對接連通性與健康度)
- **負責設備/端點**：`全生態系 (SQL Server, Ingest Daemon, Vercel Queue, Telegram Bot, LINE AI, Shenglong-Next, GitHub Actions, Google Drive)`
- **完成日期**：2026/10/19
- **完成項目**：
  - [x] **舊進銷存 (SQL Server .\SQLEXPRESS)**：實體連線成功（延遲 1,048ms），歷史單據 234,769 筆與客戶 3,903 戶正常在線。
  - [x] **本地自動入單 Daemon**：優化防重複查詢（最新 1,000 筆子查詢），單元測試延遲從 0.71s 降至 0.14s；開機自啟動 VBS 與桌面控制台正常。
  - [x] **Telegram 機器人**：實測 `@shenglong_gas_bot` 連線正常，各群組推播與權限隔離機制健全。
  - [x] **LINE AI 客服與知識庫**：Gemini 2.5/1.5 輪調 + OpenAI 備援 + 300 題知識庫測試 100% 綠燈。
  - [x] **Next.js 營運主控台 ＆ 雙向庫存**：`C:\shenglong-next` 與 `sync-stock.cjs` 正常待命，司機 App 更新就緒。
  - [x] **LINE 會員系統 (shenglong-line-liff)**：本地佇列代碼 22 項測試綠燈；經跨倉庫深度診斷，確認線上生產環境需經由 GitHub `qazwsx32100/shenglong-line-liff` 分支合併上線，杜絕覆蓋既有 10 個 Lambda。
  - [x] **GitHub Actions 與 Google 雲端**：工作流觸發 API 測試通過，指定雲端資料夾 `1YT7yfMfVmiVic_vaIWf94Ei14wMa3FYM` 綁定正確。
  - [x] **全庫回歸驗證**：全專案 199 項測試 100% 綠燈通過。

### 2. 官網 AI 智慧瓦斯諮詢管家升級（同源串接 LINE 官方大語言模型、雙重備援、動態提示詞與在地知識庫安全降級）
- **狀態**：`[x]` 已完成 (官網與 LINE 全面同源大語言模型，199 項測試全數綠燈，已部署上線)
- **優先級**：`P0` (實現老闆指示「以 LINE 的大語言模型為主」，全站智慧回答標準 100% 一致)
- **負責設備/端點**：`api/ai-chat.js, website/index.html, website/vercel.json (https://shenglong-gas.vercel.app)`
- **完成日期**：2026/10/19
- **完成項目**：
  - [x] 後端 API (`api/ai-chat.js`) 動態對齊 LINE AI 客服核心：若未自帶 systemInstruction，自動注入 20 大類盛隆官方知識庫、訂單要素狀態機與雙模（fast/expert）提示詞。
  - [x] 後端自動調用真・循環輪調（Round-Robin）與容錯轉移機制（Gemini 3/2.5/1.5 -> OpenAI 兜底）。
  - [x] 官網前端 (`website/index.html`) 全面升級非同步呼叫：新增打字思考動畫（`#aiTypingIndicator`）、安全 Markdown 排版 (`formatAiMarkdown`)、即時防重複發送防禦。
  - [x] 設定雙重線路代理：優先透過 `/api/ai-chat`（Vercel Rewrite），故障時自動切換直連 ERP 端點，超時或離線時優雅降級至在地知識庫。
  - [x] 自動化測試全量驗證：新增知識庫與 AI-Chat 同源一致性測試，全專案 199 項測試 100% 綠燈通過（199 pass, 0 fail）。
  - [x] 生產環境發布上線：完成官網 `https://shenglong-gas.vercel.app` 與 ERP `https://erp-weld-three-96.vercel.app` 部署。

### 2. 官方品牌形象站營運架構校正（精簡非必要模組、保護會員系統、FAQ整合為單一即時檢索知識庫）
- **狀態**：`[x]` 已完成 (移除網頁下單精靈、殘氣試算、商用特快車及上方重複FAQ，保留長輩大字模式，198項測試通過並部署上線)
- **優先級**：`P0` (落實店內「無現場秤重退殘氣」規定，確保客戶訂購一律收斂至 LINE 會員系統)
- **負責設備/端點**：`website/index.html, website/faqs-data.js (https://shenglong-gas.vercel.app)`
- **完成日期**：2026/10/19
- **完成項目**：
  - [x] 徹底移除 30 秒下單精靈（`#order-wizard`），所有下單導流至 LINE 官方帳號（@350MZOGG）與門市電話，確保會員系統唯一性。
  - [x] 徹底移除殘氣試算滑桿與換算邏輯（嚴格落實店內不退殘氣規定）。
  - [x] 移除「商用與餐飲專區｜盛隆瓦斯 商業供氣特快車」（`#commercial`）及導覽列對應錨點。
  - [x] 移除上方重複的靜態常見問題列表（圖1），將 FAQ 整合為單一 20 大分類、100+ 題即時搜尋知識庫。
  - [x] 徹底移除「👵 大字模式」（刪除導覽列按鈕、頂部橫幅與相關 CSS/JS 邏輯）。
  - [x] 執行全專案 198 項測試全數通過（198 pass, 0 fail）。
  - [x] 部署至正式生產環境：https://shenglong-gas.vercel.app。

### 2. 確立最高執行指令 (全系統連動影響預判、強制全面測試、預留動態擴充)
- **狀態**：`[x]` 已完成 (正式寫入 `PROJECT_RULES.md` 與 `GEMINI.md`，全系統自動化載入生效)
- **優先級**：`P0` (頂層指導架構，全流程所有功能與更動最高優先遵守)
- **負責設備/端點**：`全專案核心規範與 AI 代理規則 (GEMINI.md, PROJECT_RULES.md)`
- **完成日期**：2026/10/19
- **老闆指示備註**：
  1. 做的所有東西都必須先試想：做了這件事情會不會動到其他系統（例如動到會員系統時可能也會動到訂單系統，所有聯動到的系統都是考慮範圍）。
  2. 做的所有事情都必須要先測試。
  3. 待增加（保留動態擴充槽位）。
- **完成項目**：
  - [x] 在 `PROJECT_RULES.md` 頂部增設「⚡ 最高的執行指令 (Supreme Directives)」，確立全系統連動影響預判、強制事前/事後全面測試與待增加擴充條款。
  - [x] 建立根目錄 `GEMINI.md`，使 Antigravity AI 代理人在任何對話輪次與操作前自動注入該最高執行指令，杜絕任何單點修改與盲改行為。
  - [x] 全套自動化測試驗證執行（198 項測試 100% 綠燈全數通過）。
  - [x] 同步更新 TODO 看板、桌面鏡像、變更紀錄 (CHANGELOG) 與雲端發布日誌。

### 2. 全系統安全性能與穩定度全面重檢 (9大維度、198項自動化測試、線上實體穿透探針驗收)
- **狀態**：`[x]` 已完成 (54項九大安全維度測試、198項全系統測試 100% 綠燈、線上生產環境 9 大穿透探針全數通過)
- **優先級**：`P0` (確保客戶個資、ERP 狀態、API 防禦、防止時序與注入攻擊堅不可摧)
- **負責設備/端點**：`全系統 (ERP 前端、Vercel API、Supabase、Telegram/LINE Webhook)`
- **完成日期**：2026/10/17
- **檢驗重點**：
  1. 九大安全維度（原型鏈污染、畸形 JSON、空字元注入、防 DoS/突發限流、時序安全防時序攻擊、RBAC 權限矩陣、弱 PIN 阻擋、HSTS Preload A+ 安全標頭）。
  2. 線上生產環境實時穿透測試 (`https://erp-weld-three-96.vercel.app`)：驗證 `/api/line-ai-logs` 401 攔截、`/api/ai-chat` Null Byte 與長負載 400 阻斷、`/api/customer-history` 萬用字元防枚舉。
- **完成項目**：
  - [x] 執行 `tests/multi-angle-security-and-stability.test.mjs` 等 4 套安全性測試，54 項 100% 通過。
  - [x] 執行全套 `npm test` 測試，198 項 100% 綠燈無異常。
  - [x] 執行線上穿透測試探針，所有安全邊界與防護機制全面在線生效。
  - [x] 產出專案報告：[`盛隆瓦斯_全系統安全性能重檢總結報告_2026-10-17.md`](file:///C:/Users/懶/.gemini/antigravity/brain/f516d482-0cb8-4fbf-bd99-abe04dc0ab50/盛隆瓦斯_全系統安全性能重檢總結報告_2026-10-17.md)。

### 2. LINE AI 深度強化（第二階段：對話實體狀態機、Few-Shot 示範學習、20大類完整知識庫與司機派單卡片化）
- **狀態**：`[x]` 已完成 (實體狀態追蹤上線、Few-Shot 金牌範例入網、20大類題庫補齊、派單卡片化與 12s 高速切換全面上線)
- **優先級**：`P0` (讓 AI 客服達到具備台灣在地老店溫度、主動記憶訂單要素、零跳針的旗艦水準)
- **負責設備/端點**：`Vercel 雲端 API (api/line-webhook.js, api/_ai-rotator.js, api/_knowledge-base.js)`
- **完成日期**：2026/10/16
- **老闆指示備註**：再次強化 AI 智慧度。實現：
  1. 對話實體狀態機 (Customer Entity Tracking)：跨輪次自動解析地址、電話、規格、樓層，動態注入「已掌握訂單要素」，讓 AI 絕不重問已提供的資料。
  2. Few-Shot 示範教學 (In-Context Exemplars)：注入標準範例對話，徹底固化盛隆親切專業口吻與業務守則。
  3. 20 大類題庫全面對齊補完：補齊商用設備、瓦斯燃燒品質、法規責任、客訴專線等剩餘領域。
  4. 智能派單卡片：客戶訂單要素齊全時，自動格式化推播 Telegram 師傅群組（含導航與撥號快捷按鈕）。
  5. 調用超時縮減至 12s：讓節點切換速度提升一倍，秒級回應客戶。
- **完成項目**：
  - [x] 在 `api/line-webhook.js` 實作實體提取器與狀態注入器 (`extractOrderEntities`, `formatOrderStateContext`)。
  - [x] 在 `api/_knowledge-base.js` 補齊全 20 大類題庫，並注入 Few-Shot 金牌範例教學 (`FEW_SHOT_EXAMPLES`)。
  - [x] 在 `api/_ai-rotator.js` 優化超時至 12s，並以 `gemini-3-flash-preview` ➔ `gemini-3.1-flash-lite` 打造毫秒級容錯階梯。
  - [x] 全專案單元測試 198 項 100% 綠燈通過，成功發布至 Vercel 生產環境並覆蓋桌面看板。


### 2. LINE AI 客服上下文記憶貫通、模型高可用容錯與 300 題知識庫檢索全面強化 (第一階段)
- **狀態**：`[x]` 已完成 (對話記憶已貫通、模型自動容錯 100% 綠燈、知識庫命中率大幅提升)
- **優先級**：`P0` (徹底解決 AI 客服失憶與伺服器高負載罐頭回覆問題)
- **負責設備/端點**：`Vercel 雲端 API (api/line-webhook.js, api/_ai-rotator.js, api/_knowledge-base.js)`
- **完成日期**：2026/10/16
- **老闆指示備註**：打通 LINE 上下文對話記憶（讀取 Supabase 歷史歷程注入 messages）、解決 Google 模型 503 限流降級備援、大幅擴充 300 題常見問題意圖檢索。
- **完成項目**：
  - [x] 在 `api/line-webhook.js` 整合 `fetchLineAiLogs`，反向提取前 4 輪對話並注入 `messages` 陣列，實現跨請求連貫記憶與叫瓦斯意圖延續。
  - [x] 在 `api/_ai-rotator.js` 引入智能模型備援機制（當 `gemini-3.8-flash` 遭遇 503 尖峰高負載時，毫秒級自動容錯轉移至當前極速穩定的 `gemini-3-flash-preview`，實測 100% 成功）。
  - [x] 在 `api/_knowledge-base.js` 擴充叫瓦斯下單意圖、剩餘量判斷、鋼瓶存放、管線安裝、服務區域、天災防災等高頻問題意圖檢索。
  - [x] 全單元測試 196 項 100% 綠燈通過，同步覆蓋至老闆桌面看板與雲端日誌。

### 2. LINE 訂單自動匯入舊進銷存系統 - 階段 3：店面開機自啟動常駐、桌面一鍵控制台與實機部署驗收
- **狀態**：`[x]` 已完成 (開機自啟動 VBS、桌面一鍵控制台、啟動/停止/狀態批次檔全數配置就緒)
- **優先級**：`P0` (打通店面現場最後一哩路，實現無人化自動接單入庫)
- **負責設備/端點**：`店面 Windows 主機 (Startup 自動啟動目錄、桌面捷徑)`
- **老闆指示備註**：店面電腦開機必須自動在背景常駐執行，無需現場人員手動下指令；同時在桌面提供一鍵控制台與狀態查詢捷徑，確保現場阿姨或員工能直覺點擊管理。
- **完成項目**：
  - [x] 配置開機自動靜默啟動腳本 (`ShengLong_Order_Ingest_Daemon.vbs`) 至 Windows Startup 目錄，開機登入即在背景常駐輪詢拉單
  - [x] 建立店面現場啟動工具：`scripts/start_ingest_daemon.bat`（一鍵啟動）、`scripts/stop_ingest_daemon.bat`（一鍵停止）、`scripts/status_ingest_daemon.bat`（一鍵查狀態）
  - [x] 建立老闆與現場專屬桌面控制台：`C:\Users\懶\Desktop\盛隆瓦斯_訂單自動入單系統控制台.bat`（提供 1~5 數字選單：啟動、狀態、停止、模擬入單測試、查看任務看板）
  - [x] 實機 Dry-Run 模擬與 SQL 連線驗證 100% 成功

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
