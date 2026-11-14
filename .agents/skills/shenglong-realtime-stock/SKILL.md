---
name: shenglong-realtime-stock
description: >-
  盛隆瓦斯即時庫存全鏈路架構、連線機制與故障排除權威手冊。當使用者詢問即時庫存、庫存架構、庫存連線問題、SQL連線失敗、快照容災機制、或要求召喚庫存架構說明時使用。
---

# 盛隆瓦斯即時庫存全鏈路架構與連線診斷權威手冊

> 權威文件來源：[docs/REALTIME_STOCK_ARCHITECTURE_AND_TROUBLESHOOTING.md](file:///C:/Gass/docs/REALTIME_STOCK_ARCHITECTURE_AND_TROUBLESHOOTING.md)

## 召喚觸發條件
當使用者提及以下關鍵字時，主動調用並參考此技能說明：
- 「即時庫存架構」
- 「庫存連線問題」
- 「召喚即時庫存說明」
- 「庫存架構診斷」
- 「查即時庫存」

## 架構速覽
1. **資料源層**：門市地端 SQL Server 透過 `query.sql` 利用 `WITH (NOLOCK)` 秒級精算 5 大規格實瓶存量 (`dbo.stock` 減去 `dbo.gas_oders`)。
2. **守護中繼層**：
   - `supervisor-sync.cjs`（Port 48999）：常駐守護父進程。
   - `sync-stock.cjs`（Port 48998）：單例同步子進程，內建 SQL Guard 熔斷機制與離線快照保護。
   - 本地持久化檔案：`sync-heartbeat.json` 與 `last-known-stock.json`。
3. **雲端傳輸與 API 層**：
   - 主通道：`POST /api/gas-stock`（附帶安全密鑰，SHA-256 指紋差異推送）。
   - 狀態機：`lib/gas-stock-health.ts` 評估健康度（`LIVE` < 180s、`SNAPSHOT` 180s~599s、`OUTAGE_ALERT` >= 600s）。
4. **多端展現層**：
   - 總部戰情室 (`/operations`)
   - 今日調度台 (`/today-orders`) 與 `StockDepletionPredictor`
   - 外勤司機端 (`/driver`)
   - Telegram 軍師機器人 (`advisor-bot.cjs`)

## 常見連線問題與修復
- **SQL 服務停止（ODBC xFFFFFFFF / 逾時）**：以管理員身分執行 `Start-Service 'MSSQL$SQLEXPRESS'`，重啟服務後探針自動解除熔斷。
- **公開 KV HTTP 429**：已內建自動退避與冷卻，不影響主站。
