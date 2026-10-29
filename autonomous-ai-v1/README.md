# 盛隆自主 AI 管理中心 V1.0

獨立的安全測試控制台。**目前是唯讀展示骨架，不是已完成的自主 AI，也沒有連接正式營運資料。**

## 架構與規則
- 控制台：靜態 HTML，無任何客戶個資。
- 健康檢查：GET /api/status，回報 demo-readonly，不回傳憑證。
- 預計整合：gass AI 客服、shenglong-next ERP 唯讀 API、shenglong-line-liff LINE 訂單、Telegram 告警。
- 維持正式 SQL Server 為權威來源，先修復已知庫存與作廢訂單缺陷。
- 任務執行分級：唯讀分析可自動；派單／客服僅產草稿；帳款、價格、庫存、正式發布與瓦斯安全決策均需人工審核。
- 不直接在前端存放 API 金鑰；後續整合僅使用伺服器端最小權限憑證。

## 驗收清單
1. 即時庫存狀態列修正、對帳與回歸測試。
2. 作廢訂單在所有營業清單與列印頁正確標註。
3. LINE → ERP → LINE 完整收款／結單驗證。
4. 建立獨立唯讀資料 API、稽核紀錄、超時及重試策略。
5. 建立正式 AI 工具調用策略與人工批准工作流。

## 部署
Vercel 的 Framework 選 Other/None，根目錄部署 index.html 和 api/status.js；不設定正式 ERP 憑證。
