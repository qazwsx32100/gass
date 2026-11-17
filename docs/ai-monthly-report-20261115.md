# AI 軍師唯讀月報與指令橋接

基準：0b03912a6042c2eb0b454c93c37f2f22386cbf28。保留該版本全部其他 ERP 修正，恢復先前已部署但未納入 Git 的 AI 工具呼叫橋接，新增 finance.monthly-report。

同一服務端 Bearer 授權下，command 僅規劃；financeReport=YYYY-MM 僅讀取 fetchAppState 並計算當月有效核准分錄。資料不傳回模型，不修改交易、不派單、不通知、不新增排程。沿用現有模型與授權，不新增或替換金鑰。

月報採既有 ERP 損益表口徑，排除期初應收、作廢與被取代分錄、股利及 5101 系統估算。離線、過期、未鎖帳或成本缺漏標記 PARTIAL；缺少進氣成本不提供毛利淨利。無資料不當作零元。多家公司暫停，禁止默默合併。

台北年月、短句月份與民國年核對、權限、異常來源與原有工具回歸已以合成資料測試；真實模型與帳本驗收仍待執行。測試：node tests/ai-monthly-finance.test.mjs 與 node tests/ai-command-bridge.test.mjs。

回復僅回復 AI 檔案或 deployment；不回復或修改業務資料。此審查分支不合併 main。
