# SB-HEALTH-BUDGET-20261117-01

開始時間：2026-11-17T04:50:39.259901+00:00
狀態：修復進行中，尚未部署。
前一版本：01eba13ccfa195dbd070f0362aedd8a60398689c
原因：健康檢查讀取完整財務 app_state，造成不必要出站流量；重複請求沒有合併或 60 秒快取。
聯動範圍：gass 與 erp 兩個 Vercel 入口；保留網站 CMS 分支與財務離線容災，不修改正式資料庫、不改計費設定。
原檔備份：前一 Git 提交，api/health.js SHA-256 0cb9620008feac400df95fa3ec95e7f3cd7e44f1135ae0ac1560cfbc0819ae56。


## SB-HEALTH-BUDGET-20261117-01

普通 GET /api/health 改用既有唯讀 erp_get_app_state_meta RPC，不再下載整份財務 app_state；同一程序的同時請求共用一次探測，成功／失敗都快取 60 秒，回覆含 probeCheckedAt、probeAgeMs、probeCached，避免將快取誤認即時探測。離線、缺狀態或探測異常皆回 503，保留唯讀離線容災；CMS 分支保持原介面。

驗證：10 項流量／快取／併發／失敗回歸＋10 項同步保存測試全通過，Vite production build 通過。暖實例每分鐘至多一次探測；不是跨實例的全域配額保證，快取期間可能保留最多 60 秒前的狀態，回覆已標記年齡。沒有新增排程、沒有寫入正式資料庫、沒有改計費。

版本核對：gass 相對現行部署只有文件與測試差異；erp 現行版本較舊，會建立以該部署為基準的修復發布提交，只帶入本次 health 修復，避免夾帶其他 API 改版。發布待核對。

限制：降流量不會立即解除既有 Edge Functions／egress 配額限制。財務缺少 Supabase 設定仍待正確來源；現有連接器可管理的 ytwhfiudhhdkmzobqmqq 缺少 public.erp_get_app_state、erp_sync_shenglong_finance、erp_upsert_legacy_cylinder_movements，不能直接替換。歷史專案 pdaacjkyrlflxztbqjnv 的管理查詢被拒，未證實它仍是目前財務綁定專案。缺少瀏覽器操作工具，無法在本工作區核對另一登入帳號的控制台。

還原：回退對應程式提交／部署；不包含資料庫回復。原檔與前後 SHA-256 見同名 JSON。
