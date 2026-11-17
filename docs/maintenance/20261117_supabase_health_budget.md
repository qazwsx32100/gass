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

ERP 最小發布補記：本分支以正式 286d2e7 為基準，回移 f74b569 的 health 修復與測試；前述 01eba13 為主幹候選基準，ERP 實際前一版本以本補記與 JSON 為準。

補充驗證：主庫不可達時 hasState 回傳 null，表示未知；只有主庫 metadata 成功時才回傳存在／不存在，避免把離線誤解為資料已清空。


## SB-HEALTH-BUDGET-20261117-01 發布與補充查核結果

主幹修復 68e94b1、ERP 最小回移 9ea0dc6 均已推送 GitHub；財務 dpl_Bbpd9FKWXkcWL24j3ZkxDnSH9UJT、ERP dpl_3ohaRUsgibMHhmWzpn5TaDukv56q 正式部署均 READY，別名與來源已核對。20 項針對性測試全通過，Vite build 通過。普通 health 已使用 metadata RPC、60 秒程序內快取與同時請求合併，公開回覆帶探測時間與年齡；主庫不可達時 hasState=null，仍回 503 / offline_snapshot / readOnly，沒有把受限狀態誤報成功。這是降低後續耗用，並非已解除 Supabase 限制。

補充：另一個可管理專案 buacrgrprrpbgtekqdfi 名稱雖為 Task Amigo，確有財務 app_state 與四個財務 RPC，帳號識別指紋與既有財務離線快照一致。使用既有 anon 公開 key 對 REST 端點讀取零筆資料，回覆 402，限制為 exceed_edge_functions_invocations_quota、exceed_egress_quota；組織 Otaku Power 為 Free。Postgres ACTIVE_HEALTHY 只代表資料庫執行個體狀態，不代表 REST 閘道未受配額限制。

資料新鮮度：該主庫 app_state 停在 2026-11-04，現行離線快照為 2026-11-15；恢復 API 後仍須先唯讀對帳，不能直接宣稱最新財務已入庫。未修改正式資料庫、未重送財務同步、未調整方案或 Spend Cap、未發送通知。普通健康檢查以外的 CMS 讀取介面維持原行為。

財務入口的既有受保護同步設定讀取未成功，因此沒有建立部分／猜測的環境設定。現有健康專案 ytwhfiudhhdkmzobqmqq 未見所需 public 財務 RPC，沒有改接該專案。受限歷史候選 pdaacjkyrlflxztbqjnv 的管理查詢被拒；不將其當成已確認的現行財務綁定。

下一步：確認 Free 額度恢復途徑或評估組織付費方案；Pro 基礎與額外計算／超額費用需以控制台確認，沒有自動變更收費。由受控原始設定來源補齊 Vercel 財務設定，並在恢復後核對新舊資料。

完整機器證據、來源與限制見 docs/maintenance/20261117_supabase_health_release.json。還原可回退本次各入口的部署；程式回退不包含資料庫回復。

雲端紀錄已更新並補驗：ERP、財報、監控中心與雲端同步狀態四份固定檔案 SHA-256 下載回查一致。詳細 file ID 與指紋見 release JSON；既有資料庫配額限制與設定缺漏尚未解除。
