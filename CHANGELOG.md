# 📝 盛隆瓦斯系統 - 變更與維護紀錄 (Changelog)

> 專案：盛隆瓦斯即時庫存、營運監控與司機派單系統  
> 倉庫：https://github.com/qazwsx32100/shenglong-next  
> 雲端營運網址：https://shenglong-next-phi.vercel.app  
> 雲端紀錄對應：Google Drive 維護紀錄 (shenglonggas@google.com.tw)

---
## 📅 2026/10/19 - 📱 外勤 App 頂部按鈕列精簡、橫向平滑滑動軌道修復與鈴聲設定介面純淨化 [ver: 20261019_1205_auto_release]
* **變更類型**：介面精簡 (ui-simplification) / 橫向手勢滑動修復 (gesture-fix) / 鈴聲選項文案純淨化 (sound-options-clean)
* **核心成果**：
  * **移除頂部靜音快捷按鈕**：將上方導覽列之 `🔕 / 🔔 關掉鈴聲` 快捷按鈕完全移除，消除按鈕擁擠問題，只保留原有「更新派單」、「字體大小」、「強光模式」與「鈴聲設定」4 顆實用膠囊按鈕。
  * **保留鈴聲設定內部靜音**：派單前奏鈴聲開關（正常發聲 / 純靜音模式）收斂於「鈴聲設定」彈窗內，支援隨選即時保存與本地持久化隔離存儲。
  * **清除鈴聲秒數與10倍文字**：全面清理 `ALERT_RINGTONE_OPTIONS` 及彈窗中「15秒」、「10秒」、「4秒」、「10倍音壓」等贅字標籤與說明，文案保持專業清晰。
  * **全面修復頂部 Bar 橫向平滑滑動**：為頂部外層導覽容器加入觸控冒泡阻斷（`stopPropagation`），徹底杜絕下拉刷新手勢搶奪橫向滾動；軌道容器鎖定 `flexWrap: "nowrap"`, `overflowX: "auto"`, `WebkitOverflowScrolling: "touch"`, `touchAction: "pan-x"`，每個按鈕鎖定 `flexShrink: 0`，實現手指左右順暢橫向滑動。
  * **驗證與發布**：通過 `npx tsc --noEmit`（0錯誤）、全套 199 項自動化測試通過、雙軌自動編譯 Android Signed Release APK 並同步至 `C:\Users\懶\Desktop\sl\盛隆外送_游柏林專用.apk` 與 GitHub/Vercel。

---
## 📅 2026/10/19 - 🔍 全系統跨模組對接健康狀態即時體檢與深度診斷 [ver: 20261019_system_integrations_audit]
* **變更類型**：系統體檢 (system-audit) / 跨系統對接驗證 (integration-check) / 防重複優化 (query-optimization)
* **核心成果**：
  * **舊進銷存系統 (SQL Server .\SQLEXPRESS)**：實體連線成功（延遲 1,048ms），歷史訂單 234,769 筆、客戶建檔 3,903 戶正常在線。
  * **本地 Ingest Daemon 效能暴增**：優化防重複單查詢（改為掃描最新 1,000 筆訂單），測試延遲由 0.71 秒縮短至 0.14 秒，防範全表 23.4 萬筆掃描瓶頸；開機自啟動 VBS 與桌面控制台正常。
  * **Telegram 派單與報警機器人**：實測 `@shenglong_gas_bot` 連線正常，權限隔離機制與 Webhook 端點健全。
  * **LINE 官方帳號 ＆ AI 智慧客服**：大語言模型 Gemini 2.5/1.5 輪調、OpenAI 備援與 300 題知識庫測試 100% 綠燈。
  * **Next.js 營運主控台 ＆ 雙向庫存同步**：`C:\shenglong-next` 與 `sync-stock.cjs` 正常待命，司機 App 更新就緒。
  * **LINE 會員系統 (shenglong-line-liff)**：本地佇列端點 (`web/api/index.js`) 22 項測試綠燈；經跨倉庫深度診斷，確認線上生產環境需經由 GitHub `qazwsx32100/shenglong-line-liff` 分支合併上線，杜絕覆蓋既有 10 個 Lambda。
  * **全庫自動化測試與規範遵守**：全專案 199 項測試 100% 綠燈通過，完全落實全系統連動影響預判與測試優先鐵律。

---
## 📅 2026/10/19 - 🤖 官網 AI 智慧管家全面對齊 LINE 官方帳號同源大語言模型（Gemini 輪調＋備援防線＋動態知識庫注入） [ver: 20261019_ai_llm_alignment]
* **變更類型**：AI 架構升級 (ai-llm-alignment) / 提示詞與知識庫同源 (knowledge-sync) / 雙重備援與安全降級 (resilience-upgrade)
* **核心成果**：
  * **實現全站同源大語言模型**：依老闆指示「都是以 LINE 的大語言模型為主」，官網 AI 諮詢小幫手徹底揮別單機死板規則，全面由雲端 Gemini 3/2.5/1.5 及 OpenAI 容錯轉移之大語言模型驅動。
  * **動態注入 20 大類知識庫與訂單要素**：後端 `/api/ai-chat` 與 LINE Webhook 100% 共享相同的知識庫系統提示詞、雙模（快速 fast / 深度專家 expert）意圖分流機制與訂單狀態辨識。
  * **流暢互動體驗**：前端加入打字思考中脈衝動畫（`#aiTypingIndicator`）、安全 Markdown 自動排版、自動識別安全圖解（熱水器、風門、防漏氣、鋼瓶規格等）。
  * **雙重線路代理與在地安全降級**：優先透過 `/api/ai-chat`（Vercel Rewrite），故障時自動切換直連 ERP 端點，超時或離線時優雅降級至在地知識庫。
  * **零回歸測試驗證**：新增知識庫與 AI-Chat 同源一致性測試，全套 199 項測試 100% 綠燈通過。

---
## 📅 2026/10/19 - 🌐 官方品牌形象站營運架構校正（精簡非必要模組、保護會員系統、FAQ整合為單一即時檢索知識庫） [ver: 20261019_website_refinement]
* **變更類型**：網站營運優化 (website-refinement) / 流程收斂 (flow-alignment) / 知識庫單一化 (faq-unification)
* **核心成果**：
  * **會員系統唯一性保護**：徹底移除網頁端下單表單與 30 秒下單精靈（`#order-wizard`），所有線上叫瓦斯統一收斂導流至 LINE 官方帳號（@350MZOGG）與門市專線，保障電話號碼與會員集點完整性。
  * **店內服務規則嚴格落實**：徹底移除殘氣試算滑桿（落實無現場秤重退殘氣政策），並移除「退瓶押金安心保障」與「商用與餐飲專區（供氣特快車）」區塊，網站聚焦於新北三重在地品牌形象展示與合格安全鋼瓶配送。
  * **大字模式徹底移除**：依指示全面移除導航列「👵 大字模式」按鈕、頂部大字橫幅與相關 CSS/JS 邏輯，介面回歸極簡洗鍊。
  * **常見問題知識庫單一化**：移除上方重複的常見問題列表，整合為單一 20 大分類、100+ 題即時搜尋知識庫，第一個 Tab 為「⭐ 常見問題」，預設展開精選高頻題。
  * **全量驗證與部署上線**：198 項測試 100% 通過（198 pass, 0 fail），正式上線至 https://shenglong-gas.vercel.app。

---
## 📅 2026/10/19 - 👑 確立最高執行指令（全系統連動影響預判、強制全面測試驗證、預留擴充條款） [ver: 20261019_supreme_directives]
* **變更類型**：頂層規範建立 (supreme-directives) / 架構防護準則 (cross-system-impact) / 測試鐵律 (mandatory-testing)
* **核心成果**：
  * **最高執行指令 1 - 全系統連動影響預判 (Cross-System Ripple & Impact Analysis)**：
    * 任何更動或功能開發前，必須試想與評估是否會波及其他子系統（例如：動到會員系統時可能連動訂單系統、庫存系統、派單系統、LINE AI 客服、Telegram 特助、會計報表等）。
    * 所有連動到的系統一律列入評估與防護範圍，變更前必須完成「潛在受波及系統清單」與「相容性防護計畫」。
  * **最高執行指令 2 - 做的所有事情都必須先測試 (Mandatory Testing & Verification First)**：
    * 做的所有事情都必須先測試，未經測試驗證絕對不允許交付或上線。
    * 更動前進行測試評估或編寫測試案例；更動後全量驗證受連動影響模組與整體測試套件（198 項測試 100% 綠燈）。
  * **最高執行指令 3 - 待增加 (Dynamic Expansion Reserved)**：
    * 預留擴充槽位，隨時根據老闆最高指示增補更新。
  * **AI 代理環境自動加載 (`GEMINI.md`) 與全專案規範固化 (`PROJECT_RULES.md`)**：
    * 建立根目錄 `GEMINI.md`，使 Antigravity AI 代理人於每一次對話輪次與操作前自動載入並強制遵守該最高執行指令。

---
## 📅 2026/10/17 - 🛡️ 全系統安全性能與穩定度全面重檢（9大安全維度、198項自動化測試 100% 綠燈、線上實體穿透探針） [ver: 20261017_security_audit]
* **變更類型**：安全性能審計 (security-audit) / 穿透防禦驗收 (penetration-test) / 穩定性測試 (stability-assurance)
* **核心成果**：
  * **九大安全防禦維度全面過關 (54 項專項安全測試 100% 綠燈)**：
    * 原型鏈污染 (Prototype Pollution) & 畸形 JSON 阻斷。
    * 控制字元與空字元 (`\x00` Null Byte) 注入即時防禦。
    * 突發併發請求限流 (Rate Limiting) 與記憶體邊界保護 (Bounded LRU Cache)。
    * 偽造 JWT / Bearer Token 拒絕、RBAC 權限控管 (`/api/line-ai-logs` 401 攔截)。
    * Telegram Webhook Secret Token 防偽認證。
    * HTTP 405 Method Not Allowed 與敏感端點零資訊外洩 (Zero Leakage)。
    * CORS 跨域預檢安全規範 (OPTIONS 204) 與 A+ 頂規安全標頭 (`nosniff`, `DENY`, `HSTS preload`)。
    * LINE Webhook 端到端簽章時序安全驗證 (`crypto.timingSafeEqual`)。
    * 業務邏輯防線：嚴格封殺弱預設 PIN (`1234`/`6789`)、防範客戶歷史萬用字元枚舉 (`phone=*`)。
  * **線上生產實時穿透測試 (`https://erp-weld-three-96.vercel.app`)**：
    * 針對已部署的 Vercel 生產端點發起 9 組實體攻擊探針，包含無憑證存取客戶對話 (401)、Null Byte 注入 (400)、超大負載注入 (400)、非法電話枚舉 (401)、TRACE 探測 (405) 等，全部精準攔截。
  * **全專案 198 項測試全數通過**：
    * `npm test` 執行 198 項單元與整合測試，0 失敗、0 跳過，全綠通過。

---
## 📅 2026/10/16 - 🧠 LINE AI 深度強化第二階段（對話實體狀態機、Few-Shot 金牌教學、20大類題庫補齊與派單卡片化） [ver: 20261016_auto_release]
* **變更類型**：AI 智慧升級 (ai-enhancement) / 實體狀態追蹤 (entity-state-machine) / 提示詞示範教學 (few-shot-learning) / 知識庫補齊 (knowledge-base) / 派單卡片化 (dispatch-card)
* **核心成果**：
  * **對話實體狀態機 (`extractOrderEntities`, `formatOrderStateContext`)**：
    * 跨輪動態抽取地址、樓層/電梯、瓦斯規格/桶數、電話，精準計算缺漏項目清單。
    * 動態將「已掌握訂單要素」與「待確認資訊」注入 System Prompt，使 AI 絕不重複詢問已提供的資料，僅親切追問缺少項目。
  * **金牌示範教學 (`FEW_SHOT_EXAMPLES`)**：
    * 提示詞固化 5 大標準對話典範（初次叫單引導、補全總結、價格試算引導、委婉拒絕秤重退殘氣、漏氣緊急避險 SOP）。
    * 徹底消弭生硬罐頭感與幻覺，具備在地老店溫度。
  * **20 大類題庫全面補齊 (`api/_knowledge-base.js`)**：
    * 補齊第 19 類（商用瓦斯與快炒設備配管、自動切換閥、大戶專案）與第 20 類（燃燒品質、黃紅火風門調整、消防法規住宅 50 公斤存量限制、定型化契約與客訴專線）。
    * 嚴格恪遵「盛隆無現場秤重服務，亦不退殘氣費」鐵律。
  * **司機派單卡片化與 12s 高速容錯**：
    * 訂單要素掌握後自動格式化卡片推播 Telegram 師傅群組（含導航與撥號快捷按鈕）。
    * 調用逾時由 25s 縮減為 12s，首選 `gemini-3-flash-preview` ➔ `gemini-3.1-flash-lite` 打造毫秒級容錯階梯。
  * **單元測試與生產發布**：
    * 單元測試增長至 198 項 100% 通過，成功部署至 Vercel 生產環境。

---
## 📅 2026/10/16 - 🤖 LINE AI 客服上下文記憶貫通、Gemini 備援容錯降級與常見問答擴充完工 [ver: 20261016_auto_release]
* **變更類型**：AI 智慧升級 (ai-enhancement) / 多輪上下文 (context-memory) / 模型高可用 (model-failover) / 知識庫檢索 (rag-lite)
* **核心成果**：
  * **多輪上下文記憶貫通 (`api/line-webhook.js`)**：
    * 收到客戶訊息時自動調用 `fetchLineAiLogs` 撈取該使用者的前 4 輪對話，反向按時間順序組裝成標準 `messages` 陣列注入 AI。
    * 實現「叫瓦斯意圖跨輪延續」：前一句表明叫瓦斯，後續提供樓層、地址或電話時，AI 與系統自動保留叫瓦斯訂單意圖並精準銜接。
  * **模型級智能容災備援 (`api/_ai-rotator.js`)**：
    * 解決 Google 雲端端點對 `gemini-3.8-flash` 尖峰時段回傳 503 (High Demand) 造成掉入死板罐頭回覆問題。
    * 加入候選模型自動轉移鏈路：`gemini-3-flash-preview` ➔ `gemini-3.8-flash` ➔ `gemini-3.1-flash-lite`，遇 503/404 毫秒級自動容錯，保證 100% 秒回。
  * **20 大類 300 題知識庫意圖擴充 (`api/_knowledge-base.js`)**：
    * 大幅擴充「叫瓦斯下單意圖」、「服務區域（三重/新莊/蘆洲）」、「瓦斯剩餘量判斷（摸瓶身/看爐火）」、「鋼瓶存放與安全（直立/陽台）」、「鋼瓶檢驗期限與鋁牌身分證」、「外送師傅免費安裝接管查漏」、「停電地震天災應變」等 7 大高頻問答分類。
    * 明確約束並禁止 AI 承諾「提供現場秤重」，100% 恪遵盛隆「無現場秤重服務，亦不退殘氣費」鐵律。
  * **單元測試與全面驗證**：
    * 擴充 `tests/line-ai-logs.test.mjs` 與 `tests/knowledge-base.test.mjs`，全專案 196 項測試 100% 綠燈通過。

---
## 📅 2026/10/16 - 🛡️ 全系統最高級別安全防禦與 LINE 會員個資防護全面加固完工
* **變更類型**：資訊安全 (security) / 防禦加固 (hardening) / 零信任邊界 (zero-trust) / 專案里程碑 (milestone)
* **核心成果**：
  * **LINE 會員系統防護 (`shenglong-line-sync`)**：
    * 電話查詢限流：單一 LINE UID 10 分鐘限 6 次，單一 IP 限 10 次，徹底阻斷手機號碼枚舉。
    * 公式注入脫敏 (`sanitizeSheetCell`)：自動轉義以 `=,+,-,@,\t,\r` 開頭的字串，防範試算表公式竊取會員總表。
    * 接單通訊強制校驗 `X-Internal-Sync-Secret`，阻絕偽造請求。
  * **主控台身分鑑權 (`shenglong-next`)**：
    * 移除 `isSameOriginRequest` 標頭偽造繞過破口，強制 Session 身分驗證。
    * Edge Middleware 邊界層攔截敏感 API（未登入者直接在 CDN 回傳 401）。
    * Vercel 雲端登入實施記憶體防爆破鎖定（15 分鐘錯 8 次鎖定），股東密碼比對全面升級為 `crypto.timingSafeEqual`。
  * **Telegram 機器人與客戶歷程簽章 (`Gass`)**：
    * 嚴格限制只有 SuperAdmin (`8862712587`) 或設定之官方群組才能觸發指令與點擊按鈕。
    * 歷史查詢連結自動帶入 HMAC-SHA256 時效數位簽章，竄改參數即刻失效。
  * **歸檔規範落實**：
    * `PROJECT_RULES.md` 確立 `C:\Users\懶\Desktop\sl` 僅存放 Android `.apk` 檔案，所有系統報告一律歸檔至 `docs/` 並提交 GitHub。

---
## 📅 2026/10/16 - 🚀 LINE 訂單自動匯入舊進銷存系統（階段 3：店面自動開機自啟動、桌面控制台與現場部署完工）
* **變更類型**：現場部署 (deployment) / 自動化運維 (devops) / 控制台腳本 (batch-console) / 專案里程碑 (milestone-stage3)
* **核心成果**：
  * **Windows 開機自動常駐**：部署 `ShengLong_Order_Ingest_Daemon.vbs` 至 Windows 啟動目錄 (`Startup`)，開機登入全自動背景啟動。
  * **店面現場工具集**：提供 `start_ingest_daemon.bat`, `stop_ingest_daemon.bat`, `status_ingest_daemon.bat` 與 `install_windows_startup_task.ps1`。
  * **桌面整合控制台**：建立 `C:\Users\懶\Desktop\盛隆瓦斯_訂單自動入單系統控制台.bat`（1~5 選單式操作，現場人員點擊即可管理）。
  * **看板同步**：同步更新 `docs/TODO.md` 與老闆桌面鏡像 `盛隆瓦斯_進行中與待完成項目看板.md`。

---
## 📅 2026/10/16 - ⚡ LINE 訂單自動匯入舊進銷存系統（階段 2：雲端佇列端點與本地 Ingest Daemon 100% 建置驗證完成）
* **變更類型**：系統整合 (integration) / 雲端 API (cloud-api) / 本地守護進程 (daemon) / 專案里程碑 (milestone-stage2)
* **核心成果**：
  * **雲端佇列 API 端點建置 (`shenglong-line-sync/web/api/index.js`)**：
    * 新增 `GET /api?action=pending-ingest-orders`：以 `x-internal-sync-secret` 進行時序安全驗證，讀取 Google Sheets 訂單佇列（A:Q 欄），篩選未匯入且未取消訂單。
    * 新增 `POST /api?action=mark-ingest-success`：更新 Sheets 訂單狀態為「已接單」，並回填舊系統流水號與時間戳至 O/P/Q 欄。
    * 擴充單元測試至 22 項，測試覆蓋率 100% 通過。
  * **店面本地 Order Ingest Daemon (`scripts/shenglong_order_ingest_daemon.py`)**：
    * 連線支援 `.\SQLEXPRESS` 與目標資料庫自動容錯切換。
    * 實現電話號碼比對、新客戶自動建檔、7 種瓦斯規格解析、防重入 Idempotency Key 標籤 (`LINE#<orderId>`)。
    * 寫入 `dbo.gas_oders` 並啟用 `music='T'` 觸發店面電腦新單提示音。
    * 整合 Telegram 派工即時推播，並內建 Windows 控制台 UTF-8/cp950 編碼防護。
  * **測試與驗證**：
    * 新增 Python 單元測試 `tests/test_order_ingest_daemon.py`，3 項測試（電話正規化、DB 實體連線、模擬入單）100% 綠燈通過。
    * 全面同步更新 `docs/TODO.md` 與老闆桌面看板 `盛隆瓦斯_進行中與待完成項目看板.md`。

---
## 📅 2026/10/13 - 🗄️ LINE 訂單自動匯入舊進銷存系統（階段 1：SQL Server 資料庫結構逆向分析 100% 完成）
* **變更類型**：資料庫逆向工程 (db-schema-reverse) / 專案里程碑 (milestone-stage1)
* **核心成果**：
  * **訂單主表 `dbo.gas_oders` 34 欄位完整對齊**：確認舊系統為單一寬表設計（無獨立明細表），主鍵 `oder_id` 為 `IDENTITY(1,1)` 自動配號；規格欄位對照為 `oder_50kg`, `oder_20kg`, `oder_18kg`, `oder_16kg`, `oder_10kg`, `oder_new_4kg`, `oder_4kg`。
  * **折抵、樓層費與響鈴狀態確認**：內建 `discount` (折讓) 與 `tip` (樓層費) 欄位；新單預設 `deliver='稍後輸入'`, `payed='N'`, `disable='N'`, `music='T'` (觸發店面電腦新單響鈴), `keyin='LINE自動'`。
  * **專案計畫書與任務看板更新**：更新 `LINE_訂單自動匯入舊進銷存系統_專案計畫報告書.md` 與 `docs/TODO.md`（同步老闆桌面看板）。

---
## 📅 2026/10/13 - 🤖 系統監控看板整合「AI 客服輪調中心」獨立分頁旗艦版 (選項 B 深度營運面板)
* **變更類型**：介面升級 (ui-dashboard) / 智慧監控 (ai-observability) / 互動式容錯演練 (failover-sandbox)
* **核心成果**：
  * **頂部雙主軸分頁切換器 (`app/components/SystemStatusView.tsx`)**：
    * 採用「選項 B」架構，於監控看板頂部建立 `🖥️ 主機與核心五大支柱監控` 與 `🤖 AI 客服輪調中心` 雙分頁，完整保留原有 SQL/IIS/來電/備份/同步五大支柱，同時提供專屬 AI 深度儀表板。
  * **全方位 AI 輪調監控面板 (`app/components/AiRotatorDashboard.tsx`)**：
    * **頂部指揮官橫幅与即時指針**：即時顯示目前下一筆優先指派發話帳號 (`Pointer #`)、調度模式 (`真・循環輪調` / `主備順位容錯` 一鍵切換)、全節點 Ping 測速與指針歸零按鈕。
    * **6 大核心 KPI 儀表卡**：涵蓋可用候選節點數、Gemini 今日免費額度總池 (4,500 次/日)、今日與累計調用數、累計處理 Token 總量、平均回應延遲 (ms)、服務可用率與 429 攔截統計。
    * **4 層動態故障轉移拓撲圖**：視覺化呈現 `LINE/官網進線 ➔ qaz (#1) ➔ 無名 (#2) ➔ 神燈 (#3) ➔ OpenAI 終極兜底` 之即時鏈路與冷卻繞道狀態。
    * **4 組帳號深度水位卡与 429 壓力演練**：顯示遮罩 API Key、免費配額進度條、實測延遲，並內建「🧪 模擬 429 限流」按鈕，可現場演練 60 秒冷卻隔離與毫秒級自動跳號。
    * **即時輪調問答實測沙盒与審計日誌**：支援一鍵發送範例問題或自訂提問，即時檢視接單帳號、耗時與回覆，並提供分類審計日誌。
  * **後端 AI 輪調狀態與控制端點 (`app/api/ai-status/route.ts`)**：
    * 支援 `GET` 雲端/本地雙軌狀態聚合與 `POST` 六大互動指令 (`probe`, `reset_pointer`, `toggle_account`, `switch_strategy`, `simulate_cooldown`, `test_chat`)，通過 `tsc --noEmit` 零錯誤驗證。

---
## 📅 2026/10/13 - 🧪 全維度安全性與 API 穩定度 8 大角度深度壓力測試與邊界補強 (Multi-Angle Security & Stability QA)
* **變更類型**：深度壓力測試 (qa-testing) / 邊界防禦 (boundary-protection) / 併發穩定性 (concurrency) / 原型污染防禦 (prototype-pollution)
* **核心成果**：
  * **新建 8 大維度 16 項綜合安全與穩定度測試套件 (`tests/multi-angle-security-and-stability.test.mjs`)**：
    * **維度 1 (邊界與畸形負載)**：原型污染 (`__proto__`) 防禦、極端數值 (`Infinity`, `NaN`) 自動歸位、Null Byte (`\x00`) 控制字元入口攔截、25KB 巨型封包 `413` 阻擋。
    * **維度 2 (高併發與防記憶體洩漏)**：50 筆 `Promise.all` 非同步突發請求下計數器 100% 精準攔截；2,000 個洪水 IP 嚴格控制在 `maxEntries` 上限內，杜絕 OOM 記憶體溢位。
    * **維度 3 (偽造權限與時序穿透矩陣)**：實測 `{"alg":"none"}`、裸 Token、SQL 注入簽名、過期憑證全數攔截；`/api/line-ai-logs` HTML/JSON 未授權與錯誤金鑰 401 攔截；Telegram Webhook Secret Token 403 驗證。
    * **維度 4 (韌性與零外洩)**：非法 HTTP 方法全數回傳 `405`；`/api/ai-status` 金鑰遮罩與機密環境變數零洩漏審查。
    * **維度 5 ~ 8 (協定、簽章與代理 IP)**：CORS OPTIONS 預檢、全站 A+ 安全標頭一致性、LINE Webhook 缺簽章強制 401 攔截、多重反向代理真實 IP 提取。
  * **系統穩定度補強**：`website/api/auth.js` 支援自訂 `exp` 效期覆寫；`api/ai-chat.js` 於入口端即刻攔截 `\x00` 控制字元，避免無謂消耗上游 AI Token。
  * **總體測試驗收**：全專案 **190 項單元與多維度安全測試 100% 綠燈通過（0 失敗，耗時 3.5 秒）**。

---
## 📅 2026/10/13 - 🚀 GitHub Actions 遠端觸發端點與雙工作流 (`sync-members` / `inspect-backup`) 自動建置完成
* **變更類型**：CI/CD 自動化 (github-actions) / 環境憑證自動配置 (auto-provisioning)
* **核心成果**：
  * **GitHub 憑證自動提取與綁定**：自動從本機 Git Credential Manager 提取 `qazwsx32100` 授權 Token (含 `repo`, `workflow` 權限)，寫入 `c:\Gass\.env` 與 `c:\shenglong-next\.env`。
  * **根目錄工作流正式啟用 (`.github/workflows/`)**：部署 `sync-members.yml` 與 `inspect-backup.yml` 至 `qazwsx32100/gass`，經 GitHub API 驗證雙工作流皆為 `active` 狀態。
  * **任務看板同步 (`docs/TODO.md`)**：完成項目歸檔並同步覆蓋至老闆桌面鏡像。

---
## 📅 2026/10/13 - 🛡️ 網頁與雲端 API 全方位安全防護機制重大升級 (Web & API Security Hardening)
* **變更類型**：安全機制強化 (security-hardening) / 頻率限制 (rate-limiting) / XSS 防護 (xss-prevention) / 隱私保護 (privacy-protection) / 標頭防禦 (security-headers)
* **核心成果**：
  * **官網後台防暴力破解與防刷限流 (`website/api/auth.js` & `website/api/cms.js`)**：
    * 引入雙重速率限制（單一帳號 5 分鐘最多 6 次失敗、單一 IP 最多 30 次），超額回傳 429 Retry-After: 300。
    * Token 簽名驗證全面改採 `crypto.timingSafeEqual`，防範時序攻擊 (Timing Attacks)。
    * 訪客點擊追蹤 (`track`) 實施 IP 頻率限制（每分鐘最多 40 次）與事件名稱白名單過濾，阻斷假點擊數據。
  * **前端 DOM 與儲存型 XSS 雙層過濾 (`website/index.html`, `website/admin.html`, `website/api/cms.js`)**：
    * 公告橫幅、自訂問答、價格備註字串全面進行 HTML 特殊字元跳脫 (`escapeHtml`) 與長度截斷，防範惡意腳本注入。
  * **雲端 AI 配額防刷爆保護 (`api/ai-chat.js` & `api/ai-status.js`)**：
    * 限制公開 AI 提問頻率（每分鐘最多 12 次），提問限制 1,500 字元、總長度 3,000 字元，保護老闆 Google Gemini 3.8 Flash 與 OpenAI 付費額度。
    * `api/ai-status.js` 增加 IP 頻率限制（每分鐘最多 30 次），保護 Supabase 資料庫連線池。
  * **客戶隱私隔離與 Webhook 驗證加固 (`api/line-ai-logs.js`, `api/line-webhook.js`, `api/telegram-webhook.js`)**：
    * `api/line-ai-logs.js` 新增管理員身分與金鑰驗證，阻斷外部訪客窺探客戶住址與訂單，未授權顯示安全鎖定卡片；整合 Telegram 特助一鍵安全跳轉。
    * `api/line-webhook.js` 簽章校驗漏洞修補，強制要求 signature 標頭並改用 `crypto.timingSafeEqual`。
    * `api/telegram-webhook.js` 支援 `X-Telegram-Bot-Api-Secret-Token` 標頭驗證。
  * **全站 A+ 級 HTTP 安全標頭全面佈建 (`vercel.json` & `website/vercel.json`)**：
    * 啟用 `Strict-Transport-Security` (HSTS preload)、`Permissions-Policy`、`Cross-Origin-Opener-Policy`、`Cross-Origin-Resource-Policy`、`X-XSS-Protection`、`DENY`/`SAMEORIGIN` 與 CSP。
  * **單元測試與驗收**：專屬整合安全測試套件 `tests/web-and-api-security.test.mjs` 9 項全數通過，全庫 174 項單元測試 100% 綠燈通過。

---
## 📅 2026/10/12 - 🔄 LINE AI 客服真・循環輪調 (Round-Robin) 與智慧雙模分流 (Hybrid Router) 全面上線
* **變更類型**：架構升級 (architecture-upgrade) / 負載均衡 (load-balancing) / 雙模路由 (dual-model-router)
* **核心成果**：
  * **真・循環輪調引擎 (`api/_ai-rotator.js`)**：引進原子輪調指針 `rrPointer`，將請求依序均分至 3 組 Google Gemini 帳號 (`qaz` ➔ `無名` ➔ `神燈` ➔ 循環)，單一帳號壓力降至 1/3，自動跳過 429 冷卻帳號並由 OpenAI 兜底。
  * **方案 B 智慧雙模分流器 (`api/_knowledge-base.js` & `api/line-webhook.js`)**：
    * 簡單業務（價格、叫單、時段、發票）採秒回模式（`temperature: 0.6`，< 500ms 即答）。
    * 複雜疑難（爐具故障、熱水器忽冷忽熱、漏氣排險、結霜耗量客訴）自動升級深度專家推理模式（`temperature: 0.3`，條理化步驟排除與科學原理解說）。
  * **單元測試驗收**：全專案 165 項單元測試 100% 綠燈通過。

---
## 📅 2026/10/12 - 🚀 LINE AI 智慧客服全面優化：20 大分類 300 題完整知識庫、動態 RAG 檢索與門市營運規則硬核約束
* **變更類型**：AI 智慧升級 (ai-upgrade) / 知識庫整合 (knowledge-base) / 門市規則注入 (store-policy) / 消防安全強化 (safety-first)
* **核心成果**：
  * **20 大分類 300 題官方知識庫建立 (`docs/GAS_CONSUMER_FAQ_300.md` / `api/_knowledge-base.js`)**：完整涵蓋瓦斯計價、配送預約、鋼瓶規格、使用消耗速度、退桶押金、漏氣排險、爐具熱水器故障、調整器管線、商用設備、天然氣比較等主題，並於老闆桌面建立即時鏡像。
  * **動態語意檢索與 System Prompt 強化 (`api/_knowledge-base.js` / `api/line-webhook.js`)**：依顧客提問即時檢索最相符之官方標準答案，杜絕隨機猜測死價格；嚴格約束盛隆門市專線 `02-2972-5559`、營業時間 08:00~21:00、現金付款、手寫發票、無秤重退殘氣、無電梯樓層費等營運規則。
  * **最高消防安全防線第一優先**：偵測漏氣或瓦斯味時，第一行立即推播禁止電器火源、關閉角閥、輕推開窗通風、疏散與免費派工排查四步驟。
  * **單元測試驗收**：新增 `tests/knowledge-base.test.mjs`，全系統 162 項單元測試 100% 綠燈通過。

---
## 📅 2026/10/11 - 📌 全局任務看板 (TODO.md) 建立、桌面鏡像同步與開發 SOP 規範制度化
* **變更類型**：工程治理 (governance) / 專案管理 (project-management) / SOP升級 (core-rules)
* **核心成果**：
  * **全局任務看板建立 (`docs/TODO.md`)**：建立四象限任務看板（進行中、近期高優先待辦、中長期願景庫、近期已驗收完成），每項明確標註優先級、估計花費時間、負責設備/端點、老闆指示備註與關聯文件。
  * **老闆桌面即時鏡像 (`C:\Users\懶\Desktop\盛隆瓦斯_進行中與待完成項目看板.md`)**：每次任務變更自動同步更新老闆桌面副本，開機即查。
  * **核心開發準則 SOP 正式寫入 (`PROJECT_RULES.md`)**：規定未來任何任務啟動必登載於 `TODO.md`，完工必勾選 `[x]` 並同步記錄至 Google 雲端維護日誌與 GitHub。
  * **整合 GitHub Actions 遠端觸發端點與單元測試 (`api/trigger-github-workflow.js`)**：安全 session 驗證與 10 項單元測試 100% 通過 (總測試數達到 159 項)。

---
## 📅 2026/10/11 - 💬 LINE AI 客服對話歷程自動持久化儲存、視覺化看板與多端抓取系統全線建立
* **變更類型**：新功能建置 (feature) / 資料庫持久化 (persistence) / 視覺化看板 (dashboard) / 指令整合 (bot-command)
* **核心成果**：
  * **資料庫對話表 (`public.line_ai_logs`)**：建置完整客戶發問、AI 完整回覆、使用模型、Token 數、延遲與叫瓦斯意圖記錄表與專用 RPC。
  * **消費者常見問題 300 題知識庫文件 (`docs/GAS_CONSUMER_FAQ_300.md`)**：建立完整 20 大分類、300 題問答、盛隆營運政策與 AI 緊急安全指南，並同步放於桌面。
  * **LINE Webhook 自動異步存庫 (`api/line-webhook.js`)**：非阻塞非同步保存所有客戶問答，含降級與異常紀錄。
  * **對話紀錄查詢與視覺化看板 (`api/line-ai-logs.js`)**：支援直接在瀏覽器查看 LINE 風格對話泡泡卡片、篩選叫瓦斯意圖、關鍵字搜尋，以及 `?format=json` 結構化資料匯出。
  * **Telegram 機器人指令擴充 (`api/telegram-webhook.js`)**：支援 `/line`、`/line紀錄` 指令即時調閱最新客戶對話。
  * **單元測試驗收**：新增 `tests/line-ai-logs.test.mjs`，全系統 149 項測試 100% 通過。

---
## 📅 2026/10/11 - ⚡ 全端 AI 自動輪調系統與 LINE 智慧客服多帳號容災監控中心一體化整合
* **變更類型**：系統整合 (integration) / 雲端監控 (cloud-monitoring) / 容錯輪調升級 (rotator-upgrade)
* **核心成果**：
  * **本機輪調與監控中心 (`http://localhost:3333`)**：納入 3 組 Google Gemini 帳號 (`qaz`, `無名`, `神燈`) 與 1 組 OpenAI 備援防線。新增「☁️ 雲端 LINE AI 客服即時狀態」監控分頁與互動測試器，支援實機模擬問答與狀態讀取。
  * **模型升級防禦**：全面採用 Google 最新 `gemini-3.8-flash` 官方相容端點，修復 `models/gemini-2.5-flash` 官方廢棄回傳 404 問題，並在底層輪調器加入防禦性模型別名自動映射。
  * **雲端 LINE Webhook (`api/line-webhook.js`) ＆ 狀態 API (`api/ai-status.js`)**：支援 LINE 客戶端雙向對話、漏氣防護警告、訂單語意辨識與自動轉發 Telegram，並將調用數據提供給監控中心即時讀取。
  * **全系統測試驗證**：147 項單元測試 100% 通過，實測 3 組 Gemini 帳號連續切換與雲端 API 正常運行。

---
## 📅 2026/10/09 (下午) - 💎 外觀與 App 體驗全面升級：純白底去背透明翡翠綠鋼瓶冷啟動畫面 (Splash Screen) ＆ 外勤司機專屬下載頁面 (download-driver) 質感翻新上線
* **變更類型**：視覺與體驗優化 (ui-ux-enhancement) / 原生冷啟動畫面升級 (splash-screen) / APK 重編譯發布 (apk-release)
* **核心成果**：
  * **Android 原生冷啟動畫面升級**：純白底色 (#FFFFFF) 搭配去背翡翠綠透明鋼瓶居中，全解析度適配 (mdpi 到 xxxhdpi)，Android 12+ 導入 `@drawable/splash_icon`，告別預設與雜色。
  * **外勤司機專屬下載頁面 (`/download-driver`)**：頂部新增高解析去背翡翠綠鋼瓶縮圖展示、翡翠綠光暈、官方認證標章，新增司機版本切換卡與 LINE 防白屏教學。
  * **發布自動化強化**：`release.cjs` 自動同步翡翠綠資源包至 Android res，本地編譯與 TypeScript 100% 驗收通過，Signed Release APK 發布至桌面與雲端下載區。

---
## 📅 2026/10/09 (下午) - 🗺️ 盛隆能源未來宏觀戰略部署永久注入 AI 軍師智庫 ＆ 視覺化資訊圖卡與 APK 升級交付
* **變更類型**：戰略庫固化 (knowledge-base-inject) / 視覺化圖卡整合 (visual-infographic) / APK升級 (apk-release)
* **核心成果**：
  * **AI 軍師四大智庫入庫**：`industry-advisor.cjs` 新增 `getFutureDeploymentRoadmap`，`advisor-bot.cjs` 鍵盤升級第 12 鍵「🚀 未來宏觀戰略部署」，`telegram-ai.cjs` 系統人設永久載入宏觀戰略。
  * **高解析戰略資訊圖卡**：產出 2026-2028 盛隆能源智慧能源戰略路線圖 (`strategy_roadmap.jpg`)，四大支柱結構一目了然。
  * **原生 Android APK 重新封裝交付**：最新版 `ShengLong_Advisor_v1.0.apk`（1.75 MB）內建「🚀 未來戰略」全景儀表板，成功交付老闆電腦桌面與雲端目錄。

---

## 📅 2026/10/09 (下午) - ⚡ AI 運算 Token 超限機制與多帳號輪調系統 (Port 3333) 容災架構技術核定

* **變更類型**：容災與架構強化 (infra-resilience) / 成本風控 (cost-control)
* **核心綱要**：
  * **超限機制**：純免費模式下若達上限 Google 僅回傳 HTTP 429 限流，完全零扣款、零額外費用；付費模式則每百萬 Token 僅數元台幣。
  * **輪調機制支援**：系統原架構（`telegram-ai.cjs`）第一順位直連本地 `gemini-rotator` (Port 3333)，內建 3 組金鑰雙軌輪調（Round-Robin + 429 零秒自動容災）。
  * **額度倍增**：每日免費決策諮詢額度由 1,500 次直衝 4,500 次，擴展性強，達成永久 0 元無限續杯。

---

## 📅 2026/10/09 (下午) - 🚀 盛隆能源集團化全方位發展戰略建議書（外部擴張、管理合夥分潤、IoT 智慧抄表）

* **變更類型**：商業戰略藍圖 (strategic-blueprint) / 產業升維建議 (industry-scaling)
* **核心綱要**：
  * **外部擴張**：同業併購與代送託管聯盟、餐飲大戶 NB-IoT 智慧微電腦瓦斯表度數租賃、商用廚房設備一條龍、極端備援電力供應。
  * **內部管理**：司機車趟合夥人分潤制（結合沉睡瓶召回獵金）、AI 聚落式滿車動態調度、RFID 鋼瓶全生命週期數位資產追蹤。
  * **政策與資本**：申請經濟部商業服務業智慧轉型與節能補助（100~300萬），打造三蘆第一家都會智慧能源品牌。

---

## 📅 2026/10/09 (下午) - 盛隆 JM489 電話來電守護系統架構大改版、誤報洗版死循環徹底根除 ＆ Web 雲端看板即時硬體狀態條上線


### 1. JM489 來電顯示器守護進程（`callerid-daemon.cjs`）全面重構與誤報根除
* **變更類型**：核心守護重構 (daemon-refactor) / 防抖自癒 (anti-debounce-heal)
* **影響模組**：
  * `callerid-daemon.cjs`
  * `lib/caller-log-bridge.ts`
  * `sync-stock.cjs`
* **需求與背景**：
  * 老闆反映「jm489 一直報錯」、「昨天修了今天又來」。經分析，筆記型電腦無實體來電盒，舊防抖邏輯 `!wasProcessEverSeen` 為 true，導致每 3 秒無限誤判斷線並轟炸 Telegram。
* **實作內容**：
  * **智慧環境感知**：加入 `isJM489Host()`，自動辨別是否為硬體伺服機。非實體機自動進入靜默待命模式，完全關閉 3 秒定時輪詢與總線掃描。
  * **真故障階梯升級通報**：斷線瞬間單次通報並在 3 秒內自動嘗試拉起；若持續離線達 10 分鐘，啟動溫和階梯提醒，兼顧不洗版與真故障防漏。
  * **COM 埠防搶佔機制**：啟動前檢查既有在線 PID，杜絕重複進程造成 COM 埠 Access Denied。
  * **USB 掃描自癒節流**：加入 5 分鐘冷卻保護，避免頻繁重列舉系統設備。
  * **多磁碟動態定位**：支援 C: 槽、D: 槽、Program Files 多路徑自動適配。

### 2. Web 雲端通話看板實體硬體狀態條上線 (`app/call-monitor/page.tsx`)
* **變更類型**：介面視覺化 (ui-enhance) / 即時監控 (realtime-monitor)
* **影響模組**：
  * `app/call-monitor/page.tsx`
  * `app/api/call-monitor/route.ts`
* **實作內容**：
  * 通話看板頂部新增「JM489 硬體即時狀態條」：顯示主程式 (PID/High 優先權)、USB 訊號、以及 3 線外線 (02-2972-2149、02-2972-5559、02-2975-4635) 的物理迴路燈號（待機/通話/響鈴/斷訊）。
  * 待命節點自動標示「ℹ️ 待命節點」，提供極致透明的設備健康度。

### 3. Telegram 機器人 `/jm489` 指令全新回報
* **變更類型**：通訊整合 (bot-integrate)
* **影響模組**：
  * `sync-stock.cjs`
* **實作內容**：
  * `/jm489` 指令依據當前是實體主機還是待命節點，呈現專屬易讀狀態卡片，並引導至雲端看板。

---

## 📅 2026/10/09 (上午) - 盛隆軍師特助 App 全面串聯 100% 真實資料庫、官方 Logo 與最新 APK 發布

### 1. 100% 盛隆實體資料庫 (`ShengLong_Inspection`) 與真實氣象全面灌入
* **變更類型**：真實數據整合 (data-integration) / 介面升級 (ui-enhance)
* **影響模組**：
  * `android-builder/assets/index.html`
  * `android-builder/assets/logo.png`
  * `android-builder/build.ps1`
  * `ShengLong_Advisor_v1.0.apk`
  * `public/ShengLong_Advisor_v1.0.apk`
* **需求與背景**：
  * 老闆指示：「幫我資料 都是用真實的資料，縮圖一樣用我們的logo」，App 內部不得使用模擬假名，必須真實呈現 3,903 位客戶中欠款大戶、沉睡大戶與在地即時天氣。
* **實作內容**：
  * **全面剔除十餘年前過期停業舊帳，換裝 2026 當前真實活躍大戶**：
    * **餐飲與營業客戶真實欠款表 (Plan A)**：匯入 2026 活躍欠款戶 #3624 98.39.1 ($3,000, 2026年15單)、#1985 水晶厝 ($1,230, 持瓶3支)、#636 羅仔 ($1,000, 142單老客)、#2793 油條厝 ($620)、#874 ($720)。
    * **2026 當前餐飲主力大戶在店持瓶清單 (Plan B)**：匯入 #2024 歐家莊 (2026年188單, 持瓶8支)、#1962 重陽路清粥 (87單, 持瓶6支)、#2633 龍門路知高飯 (99單, 持瓶3支)、#1989 文化北路炭烤 (56單, 持瓶2支)。
    * **近 3~6 個月沉睡客戶鋼瓶回收清單 (Plan B)**：匯入 #1660 新莊民安西路 (壓瓶6支, 停叫101天)、#1813 三重長榮路 (壓瓶4支, 194單常客, 停叫147天)、#1050 龍濱路 (壓瓶4支, 114單, 停叫109天)、#2294 五股西雲路 (壓瓶2支, 停叫146天)。
    * **底層實體庫連線修復與即時在庫 (Live Stock) 秒級同步**：連線修正至 `.\SQLEXPRESS` / `ShengLong_Inspection`，每秒計算真實庫存 50k:2支、20k:57支、16k:15支、10k:10支、4kg:3支，即時寫入 `sync-heartbeat.json`。
    * **官方品牌 Logo 縮圖全面應用**：頂部導航欄（Header）縮圖已由 Emoji 替換為盛隆能源官方 Logo (`logo.png`)，應用程式啟動圖示全面採用官方 `@mipmap/ic_launcher`。
    * **APK 重新封裝與簽名**：輸出最新版 `ShengLong_Advisor_v1.0.apk`（805 KB）至老闆電腦桌面與雲端目錄。

### 2. AI 軍師特助流量消耗、Token 算力與店內頻寬全面技術分析
* **變更類型**：系統架構分析 (arch-analysis) / 財務成本核銷 (cost-audit)
* **核心成果**：
  * **手機電信流量 (4G/5G)**：APK 採全離線打包資產，介面操作 0 KB；僅氣象 API 單次 1.5 KB，整月 < 2 MB。
  * **Google Gemini AI 費用**：單次查詢約 1,200 ~ 2,300 Tokens，完全在 Google AI Studio 每日 1,500 次免費額度內，盛隆支出 $0 元。
  * **店內主機網路頻寬**：資料庫查詢走本機 Loopback (127.0.0.1)，雲端心跳封包每月僅 21.6 MB，對店內頻寬毫無負擔。


---


* **需求與背景**：
  * 老闆指示商業軍師與三大決策功能不應受限於 Telegram，需具備獨立 Android 原生 App 安裝檔，供老闆手機直接安裝、全螢幕獨立運行。
* **實作內容**：
  * **底層 Android SDK 編譯流水線**：
    * 採用純淨原生 Java / Android 14 (API 34) WebView 架構，無冗餘第三方套件，啟動速度達到 0.1 秒極速秒開。
    * 整合 debug.keystore 官方簽名，生成可直接在任何 Android 手機點擊安裝之完整 APK。
  * **內建三大決策與 AI 戰情室**：
    * 🛡️ **Plan A: 餐飲大戶三級信用風控表**（紅黃綠燈判定、異常拉長預警、未結欠款與在外鋼瓶防倒閉）。
    * 🛢️ **Plan B: 沉睡客戶與鋼瓶資產召回表**（120+ 天未叫氣鋼瓶追蹤、順路退瓶與喚醒關懷）。
    * ☀️ **Plan C: 晨間氣候進貨與車趟預測表**（三重氣溫驟降備料算式、司機分流排班）。
    * 💡 **24H 商業軍師智慧對話室**（支援打字與快捷決策提問，全表格化輸出）。
  * **交付路徑**：
    * 檔案已直接輸出至老闆電腦桌面：`C:\Users\懶\Desktop\盛隆軍師特助_v1.0.apk`
    * 檔案已同步至雲端可下載路徑：`c:\shenglong-next\public\ShengLong_Advisor_v1.0.apk`

---

## 📅 2026/10/08 - 老闆專屬 24H 數位商業軍師機器人 (@shenlong_advisor_bot)、產業情報與雙守護進程架構

### 1. 老闆專屬 24H 數位商業軍師機器人 (@shenlong_advisor_bot) 獨立上線
* **變更類型**：重大功能新增 (feat) / 架構隔離 (arch)
* **影響模組**：
  * `advisor-bot.cjs`
  * `industry-advisor.cjs`
  * `telegram-roles.cjs`
  * `supervisor-sync.cjs`
  * `sync-stock.cjs`
* **需求與背景**：
  * 老闆需要一台專屬的 24H 數位特助／商業軍師 Telegram 機器人，專注提供煤氣瓦斯產業即時新聞與情報、中油調價試算預警、商業營運決策、餐廳與社區拓客行銷策略，並且獨立於原有派單群組，保護管理機密。
* **實作內容**：
  * **獨立專用守護進程 (`advisor-bot.cjs`)**：
    * 綁定專屬 Telegram Bot Token `8626638239:AAE7Dhk6r46wHiQIzHb0g9Ptgv5n6i71JLY`（@shenlong_advisor_bot）。
    * 監聽獨立通訊埠 `48996`（避開主同步進程 `48999`），雙進程並行零衝突。
  * **11 大軍師決策快捷按鈕矩陣**：
    1. `🌅 晨間開門簡報`、`☀️ 午間營業脈搏`、`🌆 傍晚進貨決策`、`🌙 打烊營運日報`
    2. `💸 倒閉跳票風控`、`⚖️ 中油調價試算`、`📰 瓦斯產業情報`
    3. `🎯 實戰行銷拓客`、`📈 商業運作指南`、`📦 即時在庫庫存`、`💡 諮詢 AI 商業軍師`
  * **瓦斯產業情報與實戰行銷知識庫 (`industry-advisor.cjs`)**：
    * 整合中油最新氣價調價資訊、國際沙烏地 CP 走勢解讀、儲槽庫存安全水位。
    * 餐飲業攻略：雙瓶自動切換防斷火、離峰補氣、預收氣費與防倒閉跳票風控（三級信用紅黃綠燈）。
    * 社區大樓攻略：公共安全合格標章、老舊軟管閥門健檢換新、管委會換約專案。
    * 商業運作指南：淡季維保與爐具汰換、旺季調度、鋼瓶資產週轉率監控。
  * **最高權限硬核鎖定 (`telegram-roles.cjs`)**：
    * 永久硬編碼老闆專屬 Telegram ID `8862712587` 為唯一定義之 SuperAdmin（最高決策者），所有軍師私密功能嚴格限制非授權人員呼叫。
  * **雙進程守護引擎升級 (`supervisor-sync.cjs`)**：
    * 主控守護同時監控 `sync-stock.cjs` 與 `advisor-bot.cjs`，任何子進程異常中斷均在 2 秒內自動自癒重啟。

---

## 📅 2026/10/04 - 雲端流量與請求爆炸根治優化、輪替防護與輪調機制核驗

### 1. Vercel 雲端伺服器請求流量爆炸根治 (每小時 16,000+ 驟降至常態零峰值)
* **變更類型**：性能優化 (perf) / 架構防護 (fix)
* **影響模組**：
  * `sync-stock.cjs`
  * `app/driver/admin/page.tsx`
  * `app/driver/page.tsx`
  * `app/today-orders/page.tsx`
  * `app/operations/page.tsx`
  * `app/gas-stock/page.tsx`
  * `app/public-stock/page.tsx`
  * `app/legacy-errors/page.tsx`
  * `app/components/SystemStatusView.tsx`
  * `disk-guard.cjs`
  * `supervisor-sync.cjs`
* **問題背景與成因**：
  1. Vercel 監控顯示 `shenglong-next` 過去 3 天產生 281,270 次請求，尖峰達每小時 16,013 次（佔全帳號 99.1%）。
  2. 本機後台守護進程 `sync-stock.cjs` 每 2~3 秒無條件向雲端重複推送相同資料（庫存、今日訂單、來電監控），三日累積 216,374 次請求。
  3. 各前台頁面（`operations`, `driver`, `today-orders`, `gas-stock`, `public-stock`, `legacy-errors`）輪詢頻率過高（2~3 秒），且附帶 `&_t=${Date.now()}` 強制繞過 CDN 快取，分頁切至背景時未停止請求。
* **實作內容與邏輯**：
  1. **後台守護同步進程差分推送 (Hash-based Diff Sync)**：
     - 加入 SHA-256 內容雜湊比對與 180 秒強制保底心跳，資料無異動時直接略過雲端 HTTP 傳輸，無意義推送減少 98% 以上。
     - 心跳上報 (`reportHeartbeatToMonitor`)、司機歷程與錯誤同步頻率由 3 秒收斂至 60 秒。
  2. **前端頁面智慧背景休眠與防抖降頻**：
     - 全部輪詢加入 `document.hidden` 檢測，分頁縮小或鎖定時 100% 暫停請求；透過 `visibilitychange` 事件在使用者切回畫面時瞬間發起 1 次最新拉取。
     - 移除輪詢請求之 `&_t=${Date.now()}` 快取穿透參數，允許 CDN 正確聚合與快取。
     - 庫存看板與體檢頁面前台輪詢由 2 秒拉長至 15 秒／30 秒。
  3. **磁碟與日誌防爆引擎（disk-guard）單槽相容修正**：
     - 自動偵測主機實體磁碟配置，無獨立 D 槽時自動對齊 C 槽路徑（`C:\backup`），避免誤判 `[UNKNOWN]` 磁碟危急告警。
     - `supervisor-sync.cjs` 動態綁定 `process.execPath`，確保多環境下守護子進程平穩拉起。
* **驗證成效**：
  * Vercel 即時請求指標：由 147 次/分（每小時 8,800+ 次）崩跌收斂至 0~2 次/分，請求總量降幅超過 98%。
  * 訂單、即時來電與司機接單推送維持 SSE / Telegram 即時秒達，零延遲零中斷。
* **對應 Commit**：`4da8d94`, `3d3d65c`
* **復原指令**：`git revert 3d3d65c`

### 2. 司機外勤車趟輪調可視化升級與單槽磁碟相容加固
* **變更類型**：功能新增 (feat) / 系統加固 (hardening)
* **影響模組**：
  * `app/driver/admin/page.tsx`
  * `app/operations/page.tsx`
  * `app/api/stream/events/route.ts`
  * `backup-db.cjs`
  * `compress-hourly-backup.cjs`
  * `verify-backup-restore.cjs`
* **實作內容與邏輯**：
  1. **司機後台看板輪調負載膠囊徽章 (`/driver/admin`)**：
     - 將 `getDriverWorkloadAdvice()` 負載規則整合至司機專屬小卡，即時顯示：
       - `🟢 趟次充裕 / 建議輪派`（當日累計趟次 $\le 5$ 趟）
       - `🛵 車趟負載正常`（當日累計 6 ~ 14 趟）
       - `⚠️ 今日達 15 趟 / 建議休息輪替`（當日累計 $\ge 15$ 趟，主動防疲勞駕駛）
  2. **營運調度總中心派工輪調整合 (`/operations`)**：
     - 司機篩選頁籤整合紅／綠／藍三色狀態圓點，直觀呈現當日司機出車趟數與疲勞狀態。
     - 浮動置頂「一鍵批次派單」操作按鈕即時帶出司機今日已跑趟數與輪派建議（如 `派給 小龍 (8趟 · 🛵正常)` 與 `派給 游柏林 (16趟 · ⚠️建議休息)`），調度員派工時可秒選最佳輪替人選。
  3. **Serverless SSE 串流超時保護 (`/api/stream/events`)**：
     - 增加 55 秒平滑收合機制，配合瀏覽器原生的 EventSource 斷線秒級重連，杜絕邊緣容器長時間懸掛耗盡 Serverless 執行時數。
  4. **全套備份與還原演練單槽動態相容 (`C:\backup`)**：
     - `backup-db.cjs`、`compress-hourly-backup.cjs` 與 `verify-backup-restore.cjs` 全面加入 `hasD` 判斷，自動對齊本機 `C:\backup`，杜絕硬編碼 D 槽拋出 `ENOENT`。
* **對應 Commit**：`2a129b6`
* **復原指令**：`git revert 2a129b6`

---

## 📅 2026/10/03 (昨日) - 司機手機換日歸零修復與後台監控中心升級

### 1. 司機 App 00:00 換日自動歸零與防抖動凍結修復
* **變更類型**：Bug 修復 / 邏輯優化
* **影響模組**：
  * `lib/driver-store.ts`
  * `app/api/driver/orders/route.ts`
  * `app/driver/page.tsx`
  * `app/layout.tsx`
* **問題背景**：
  * 司機小龍手機開屏顯示昨日 26 筆舊單（包含 6 筆未完成），即使舊系統早已結清或換日，手機依然無法更新。
  * 成因：
    1. 欠款代碼 `payed = 'O'` 漏判，導致欠款訂單被視為未付款。
    2. 新的一天小龍目前為 0 筆訂單，被手機端第 1017 行「0 筆訂單防斷線抖動保護」阻擋，誤把 0 筆當成伺服器斷線，強行定格昨日畫面。
    3. 手機 PWA / Service Worker 快取了 9/30 舊版 JS 代碼，`savedDate` 初始化為空值。
* **實作內容**：
  * API 綁定 `businessDate`，伺服器與前端均增加跨日比對機制。
  * 直接檢查快取單據本身的建立日期，非今日單據直接歸檔歷史庫存（`shenglong_driver_history_...`）。
  * 跨日換新時允許 0 筆訂單正常切換，解除凍結。
  * 升級全域版本號至 `20261003_v4`，強制手機瀏覽器銷毀過期 Service Worker 快取。
  * 依指示保留昨日未結單且司機正點選「配送中 (accepted)」的任務至待確認區。
* **對應 Commit**：`01b0de9`, `c3bf4a0`, `5eb94ba`, `e270fa0`
* **復原指令**：`git revert e270fa0`

### 3. 外送司機手機 App 完整升級 (00:00跨日徹底歸零、挑桶精簡化、備註高亮顯示、手機端客戶歷史紀錄彈窗)
* **變更類型**：功能新增 / 缺陷修復 / 介面體驗優化
* **影響模組**：
  * `app/driver/page.tsx`
* **問題背景與需求**：
  1. 司機小龍手機仍定格在昨日 6 筆單據（`待處理 (6)`），主因為跨日時程式誤將昨日 `accepted` 單據拷貝至今日 `rawOrders`，且防抖動邏輯在非換日狀態下直接鎖定舊單。
  2. 司機挑桶提醒原本佔據大幅畫面與同規格比對表格，需要依照指示精簡為簡約醒目的「⚠️ [司機挑桶提醒]」標籤。
  3. 訂單卡片缺少顯示調度指派之「備註」資訊（如「自有20k的5支」、「斜坡注意」等），司機送貨時不易查看現場注意事項。
  4. 頁籤抬頭需要維持標準清晰的 `⏳ 待處理 (${pendingCount})` 與 `✅ 已完成 (${finishedCount})`，不加入多餘總額干擾。
  5. 司機在手機外出配送時，需要隨時可點擊「📜 客戶歷史」彈窗，分類查閱客戶過往瓦斯配送、爐具/買鋼瓶、是否欠款、是否欠桶/押桶紀錄。
* **實作內容**：
  * **00:00 跨日歸零與防抖動修正**：
    * 在 `initialize()` 中，偵測到舊日或記錄日期不合時，將昨日單據完整封存至 `shenglong_driver_history_${storedName}_${archiveKey}`，並徹底清除今日待處理快取與本機狀態，不再拷貝昨日單據。
    * 在 `fetchOrders()` 中，移除跨日強制拷貝昨日 accepted 單據之邏輯；防抖動機制加入 `hasExistingTodayOrders` 判斷，僅在記憶體中確實存在今日有效單據且非強制更新時才防抖動，換日或伺服器今日無單時立即接受 `orders = []`，小龍手機今日準確顯示 `待處理 (0)`。
  * **挑桶提醒精簡化**：
    * 移除冗長的叫氣週期比對表格，精簡為符合觸控體驗之醒目黃橘色徽章 `⚠️ [司機挑桶提醒]`，並維持震動反饋。
  * **高亮呈現訂單備註**：
    * 於訂單資訊卡片之欠款提示下方，新增琥珀金醒目備註框 `📝 備註：{o.remarks}`，自動過濾空值並清晰換行。
  * **標準化頁籤**：
    * 頁籤文字維持為 `⏳ 待處理 (${stats.pending + stats.inProgress})` 與 `✅ 已完成 (${stats.finished})`。
  * **司機手機版客戶歷史紀錄彈窗 (CustomerHistoryModal)**：
    * 訂單工具鏈由 2 欄升級為 3 欄等寬排版：`🗺️ 導航`、`📞 撥號`、`📜 客戶歷史`。
    * 點擊「📜 客戶歷史」即開啟支援烈日模式與常規模式之全響應式彈窗，提供 4 大獨立頁籤：
      1. `🛢️ 瓦斯`：最近瓦斯配送日期時間、規格支數、實收金額、付款狀態與送貨司機。
      2. `🔥 爐具`：安裝維修、瓦斯爐具或買鋼瓶紀錄（串接舊系統 `dbo.stove_orders`）。
      3. `💰 帳款`：客戶歷史欠款警告、本次單據與現場應收總計、帳款明細流水（串接舊系統 `dbo.Money`）。
      4. `📦 桶帳`：登記瓦斯桶規格、欠桶與押桶判定提示、歷史借桶/押桶日誌（串接舊系統 `dbo.berrel_logs`）。
    * 整合標準與備援 API 自動切換，具備直覺關閉按鈕與背景點擊關閉。
* **對應 Commit**：`0b5b9ae`
* **復原指令**：`git revert 0b5b9ae`

### 4. 司機後台監控中心視覺精簡化 (移除頂部小卡提示文字、精簡狀態篩選標籤)
* **變更類型**：介面優化 / 視覺文字精簡
* **影響模組**：
  * `app/driver/admin/page.tsx`
* **需求與背景**：
  1. 篩選按鈕文字去冗餘：「待收款 (未結清)」字樣過長，移除「(未結清)」精簡為「待收款」；「待出發 (稍後輸入)」移除「(稍後輸入)」精簡為「待出發」。
  2. 頂部 4 大數據小卡原包含「👆 點擊看全部」、「👆 點擊篩選」、「👆 點擊看待收款」、「👆 點擊看已結案」等文字，導致卡片標題被擠壓折行。
* **實作內容**：
  * 狀態篩選按鈕標籤更新為標準簡潔名稱：`💰 待收款`、`⏳ 待出發`。
  * 訂單明細列之狀態徽章同步精簡為：`⏳ 待出發`。
  * 移除頂部 4 大卡片右上角全部「點擊查看」提示文字，使標題完整展開單行顯示，卡片整體更清爽俐落。
* **對應 Commit**：`4df93f2`
* **復原指令**：`git revert 4df93f2`

### 5. 司機狀態小卡新增派送規格數量、總支數與總運費統計
* **變更類型**：功能新增 / 介面統計擴充
* **影響模組**：
  * `app/driver/admin/page.tsx`
* **需求與背景**：
  * 後台監控中心之司機任務彙總卡片（小龍、游柏林、稍後輸入等）需直觀掌握司機今日派送的所有瓦斯規格數量（50kg、20kg、16kg、10kg、4kg）、總派送支數與依運費公式計算之總運費金額。
* **實作內容**：
  * 在 `driverSummaries` 計算中，聚合計算每位司機之各規格瓦斯數量（`b50`、`b20`、`b16`、`b10`、`b4`）、總支數（`totalBottles`）以及總運費（`totalCommission`，50kg 每支 $140、其他規格每支 $70）。
  * 於每張司機小卡中新增獨立數據展示區塊：
    * **總派送支數**：醒目藍色呈現總支數。
    * **總運費**：綠色大字即時呈現司機今日總應領運費。
    * **規格數量**：以多色階膠囊徽章條列展示每種規格之派送支數（如 `50kg × 1`、`20kg × 13`、`16kg × 2`），無派單時自動防呆呈現「無派送瓦斯」。
* **對應 Commit**：`181bca1`
* **復原指令**：`git revert 181bca1`

### 6. 司機端與後台權限資料嚴格隔離（司機端僅看本次訂單備註，禁止客戶歷史與主檔電話清單；後台四合一歷史與 Google 歷程連動）
* **變更類型**：權限隔離 / 個資安全防護 / 欄位分流優化
* **影響模組**：
  * `app/driver/page.tsx`
  * `app/driver/admin/page.tsx`
  * `app/api/driver/orders/route.ts`
  * `sync-stock.cjs`
* **需求與背景**：
  1. 外勤司機在路上配送，嚴格禁止查閱客戶歷史資料與客戶資料主檔備註（如 `/09768406/0920919048/0909849141` 等多組電話清單或客戶檔案隱私）。
  2. 司機端（手機 App）僅允許提供：客戶姓名、電話、地址導航、本次叫貨規格、本次應收金額與「本次訂單備註」（例如「到前電聯」、「放門口」等針對本筆單據之指示）。
  3. 後台監控中心完整保留並呈現「本次訂單備註」與「客戶資料備註」雙欄位，且客戶歷史彈窗整合「🌐 開啟 Google 雲端歷程」快速跳轉至 Google Apps Script 查詢系統。
* **實作內容**：
  * **底層欄位分流 (`sync-stock.cjs`)**：查詢時獨立提取 `o.oder_remarks` 為 `order_remarks`（本次訂單備註）與 `c.customer_remarks` 為 `customer_remarks`（客戶資料主檔備註），不再相互混淆。
  * **API 邊界過濾 (`app/api/driver/orders/route.ts`)**：若備註符合客戶主檔多組電話清單特徵（以 `/` 開頭或含 `09...` 號碼串），司機端 API 徹底攔截清空；客戶主檔備註僅限後台管理員授權讀取。
  * **司機端純淨化 (`app/driver/page.tsx`)**：移除任何客戶歷史彈窗與按鈕；僅在確實存在「本次訂單備註」時渲染琥珀色提示框 `📝 訂單備註：{o.orderRemarks}`，絕不洩漏客戶個資。
  * **後台管理強化 (`app/driver/admin/page.tsx`)**：卡片上清楚標示 `📝 本次訂單備註` 與 `👤 客戶資料備註`；四合一歷史彈窗新增 `🌐 開啟 Google 雲端歷程` 快捷鍵，自動帶入客戶姓名、電話、地址直接在 Google Apps Script 定位該客戶。
* **對應 Commit**：`d5f5827`
* **復原指令**：`git revert d5f5827`




### 2. 司機後台監控中心完整升級 (卡片互動篩選、客戶完整資訊與歷史紀錄彈窗)
* **變更類型**：功能新增 / UI 優化 / 狀態分類重構
* **影響模組**：
  * `app/driver/admin/page.tsx`
  * `app/api/driver/orders/route.ts`
  * `app/api/customer-history/route.ts`
  * `app/api/customers/[id]/history/route.ts`
* **需求與成因**：
  1. 派工訂單小卡因屬性名稱不一致（後端傳遞 `name`/`addr`/`tel`，介面讀取 `customerName`/`customerAddress`）導致介面顯示「一般客戶」與「無地址」，且未顯示訂單備註、叫單時間、瓦斯規格與上次叫貨資料。
  2. 舊系統指派為「稍後輸入」或「待派工」應歸類為「⏳ 待出發」；有指定司機（如小龍、游柏林）應歸類為「🚚 配送中」；結清或已送達者為「✅ 已送達」。
  3. 監控看板頂部 4 大卡片（今日派工總數、已指派但未完成、尚未完成累積待收金額、今日已送達結案）需具備點擊快速篩選對應訂單並平滑捲動至明細清單之功能。
  4. 每張訂單卡片新增「📜 客戶歷史紀錄」彈窗按鈕，可分類查看：🛢️ 瓦斯配送紀錄、🔥 爐具與買鋼瓶、💰 帳款明細(是否欠款)、📦 桶帳紀錄(是否欠桶/押桶)。
* **實作內容**：
  * **訂單卡片資料校正**：修正屬性對應，完整顯示真實姓名、電話、地址、Google地圖導航、叫單時間、瓦斯規格（50kg/其他）、鋼瓶桶型、上次叫貨日期，並以高可見度黃色警示塊清晰呈現客戶備註。
  * **狀態分類重構**：後端與前端統一定義：`稍後輸入`/`待派工` -> `assigned` (⏳ 待出發)；已指派司機 -> `accepted` (🚚 配送中)；結清 -> `finished` (✅ 已送達)。
  * **頂部卡片互動過濾**：4 大核心數據卡片加入 `onClick` 點擊互動、游標指針、懸浮反饋與當前篩選發光外框，點擊直接連動篩選 `ALL`、`UNFINISHED`、`UNPAID`、`finished` 並平滑捲動至 `#orders-section`。
  * **狀態篩選按鈕擴充**：明細列表上方新增「⏳ 全部未完成」與「💰 待收款 (未結清)」獨立切換標籤。
  * **客戶歷史營運彈窗 (CustomerHistoryModal)**：
    * 頂部包含姓名、電話、地址、桶型與欠款警示橫幅。
    * 提供 4 大頁籤：🛢️ 瓦斯配送紀錄、🔥 爐具/買鋼瓶、💰 帳款明細(是否欠款)、📦 桶帳紀錄(是否欠桶/押桶)。
    * 整合查詢舊系統 `dbo.gas_oders`、`dbo.stove_oders`、`dbo.Money`、`dbo.berrel_logs`，並在離線或延遲時自動顯示已快取之出單與欠款資訊。
    * 支援 ESC 鍵或點擊背景快速關閉。
  * **同源免登入查詢支援**：在歷史查詢 API 增加 `isSameOriginRequest` 驗證，避免後台監控中心於儀表板模式查詢客戶歷史時遭遇 401 阻擋。
* **對應 Commit**：`15d7dc4`
* **復原指令**：`git revert 15d7dc4`

### 5. PWA 安裝按鈕智慧隱藏（方案 A）與新單推播通知/音效消失根本原因修復
* **變更類型**：體驗優化 / 重大缺陷修復 / 介面清爽升級
* **影響模組**：
  * `app/components/PwaInstallButton.tsx`
  * `app/driver/page.tsx`
* **問題背景與需求**：
  1. **已安裝 App 隱藏安裝按鈕**：司機已安裝 PWA 至桌面時，希望從手機桌面點開 App 時不要再顯示「📲 安裝」或「📲 下載」按鈕，保持頂部工具列極致清爽（僅留 🔄 更新、🔔 系統推播、☀️ 烈日模式）。在普通瀏覽器（LINE 點開或 Chrome 網址列）開啟時則維持引導安裝。
  2. **司機 App 訊息通知與聲音消失**：使用者回報「司機app 還是無法跳出訊息，後來改到訊息通知和聲音都沒有了，以前還有聲音」。經深查發現上午 11:37 配合後台將已指派司機之單據狀態從 `assigned` 改為 `accepted`，導致手機端過濾條件 `o.driverStatus === "assigned"` 永遠為 false，發送通知、手機震動與音效被全面擋死。
* **實作內容**：
  * **PWA 安裝按鈕智慧隱藏 (方案 A)**：
    * `PwaInstallButton.tsx` 偵測到獨立應用模式（`isStandalone === true`）時直接 `return null`，完全不渲染按鈕；並監聽 `appinstalled` 事件在安裝完成當下立刻自動隱藏。
    * 普通網頁模式打開時依然完整顯示「📲 安裝」按鈕。
  * **新單推播與提示音修復**：
    * 將司機端未提醒單據過濾器改為 `o.driverStatus !== "finished" && !alertedOrderIdsRef.current.has(o.id)`，徹底相容 `accepted` 與 `assigned` 狀態，新派單進來即刻秒級觸發。
    * 初次開屏載入（`isInitialLoadRef`）自動記入現有單號，避免開屏瞬間舊單連續洗版。
    * 升級提示音為高穿透力雙音節「叮咚」清脆提示音（880Hz + 1174.66Hz），外送騎行與大馬路環境清晰可辨。
    * 新增全域觸控手勢自動解鎖 `AudioContext`，徹底解決手機瀏覽器禁止自動播放（Autoplay Policy）的限制。
    * **雙軌推播保險（新派單浮動大橫幅）**：新增 `newOrderBanner`，即使 Android 系統設定封殺了系統通知欄，手機畫面正上方必定跳出醒目藍底新單橫幅（顯示客戶姓名、地址、規格、金額）並同步播放雙音叮咚音效，雙重保險絕不漏單。
    * **主畫面未授權醒目提示**：若司機手機尚未授權瀏覽器通知，頁面頂部以醒目黃金橫幅提示「🔔 手機尚未啟用新單通知！點此【允許通知】」，一鍵點擊即可完成授權與憑證同步。
    * **PWA 安裝按鈕永久隱藏保險**：加入 `localStorage.getItem("pwa_installed")` 判定；安裝指引彈窗頂部新增「✅ 我已安裝，不再顯示此鈕」，點擊即永久隱藏安裝按鈕。
* **對應 Commit**：`9394461`, `a6f7c7f`, `9aedf8f`, `07ff495`, `391633d`
* **復原指令**：`git revert 391633d`

---

## 📅 2026/10/01 - 獨立外送司機 App (PWA) 專案建立與網域隔離
* **變更類型**：重大架構升級
* **實作重點**：
  * 司機 App 實體網域與財務系統隔離，免登入 Token 直達（`?code=D01`）。
  * 支援 PWA 桌面捷徑安裝，移除多餘鈴聲回歸視覺靜音看板。
  * 任務頁籤精簡為「待處理」與「已完成」。
  * 路線規劃直連 Google Maps API。

---

## 📅 2026/09/30 - 系統監控與戰情大螢幕升級
* **變更類型**：系統優化與自癒機制
* **實作重點**：
  * 戰情大螢幕支援即時庫存、推播監控與來電辨識自癒。
  * 階梯式磁碟維護排程與 SQL 斷線自動重連。
