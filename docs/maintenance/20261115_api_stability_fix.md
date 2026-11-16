# API-STABILITY-20261115-01

修復前紀錄：2026-11-15；狀態 in_progress，尚未部署。
原因：唯讀稽核重現同步假成功、派工遺失與標頭授權問題。
前一版本與原檔備份：Git HEAD（完整 SHA 見本次驗證紀錄），保留於獨立 audit worktree。
禁止操作正式資料庫及發送測試通知；驗證採隔離假資料。

## 驗證完成／發布前紀錄

時間：2026-11-15T13:35:04.901778+00:00；台北時間為 UTC+8。
前一版本：`64b2711173be04cf9edf1d9520e524d7467882fa`；原檔備份為此 Git 提交。
修復：同步無入庫回覆 503（僅封存亦維持待重試）；派工使用既有 KV 表 updated_at 條件更新防跨實例覆蓋；移除標頭授權與公開預設同步密鑰；缺少快照時不回傳假空白；心跳讀取同一持久監控來源；離線 health 如實降級；已修改的保底輪詢至少 60 秒。
影響：監控中心、新 ERP／司機派工、財務同步、LINE 健康檢查；登入與唯讀離線資料仍保留。失敗時拒絕未持久保存的寫入，不能繼續宣稱同步完成。
相容性：沿用既有 sl_operations_kv schema、加密格式與派工資料結構，無資料庫遷移；所有雲端實例應更新後才具完整 CAS 保證。
驗證：Next 23 平台回歸＋20 快照回歸＋7 授權／心跳測試與 production webpack build；財務 10 保存／health 測試與 Vite build；LINE 16 代理排程＋4 health＋1 回應測試，靜態 build 僅使用本機 placeholder。未向正式環境發送測試訂單／通知。
輪詢預算：監控原三條 3/3/2 秒降為 60/60/60 秒，單分頁全天名目 100800→4320 請求／日；此為前端請求數，並非資料庫計費數，總量需依分頁、使用時間、SSE 與快取實測。未新增雲端排程。
未完成：門市 PowerShell／代理腳本尚未安裝驗收；通知 outbox 尚未接入正式傳送路徑；FCM／HSS／MQ 的端到端驗收仍待完成，不能宣稱完全修復。
部署：待 GitHub 推送與 Vercel READY 核對；Google Drive 狀態 pending_upload。還原：以 Git revert 本次提交並重新部署；這不會回復資料庫或重放工作。

### SHA-256

| 檔案 | 修復前 | 修復後 |
| --- | --- | --- |
| api/health.js | 0edf772804d96be1a45e5b758af9ac41d9527d48c960a24bf4cafaf0813ef7d9 | 0cb9620008feac400df95fa3ec95e7f3cd7e44f1135ae0ac1560cfbc0819ae56 |
| api/sync-cylinder-history.js | 9322c0ca012948f289a812e2dddb4333735231c7114f5d565b1fa093af4254a3 | 02837c666da3c069c4b8f194084ce09bae008fed06f53c3db5246fdccf4bb7b6 |
| api/sync-finance.js | 6a6960eb4af8e27a03c632e6f5e969d3d41679275c036d289a30c9d374666bda | baaece33e7ae22134dd177d17bef32efcf6dbb4b6cf9656592b040838c874a3a |
| package-lock.json | ab1552eab2fac2522e4948723484eab38e6510ac040788744f1347d1f6d0c636 | a1be32f220565e45f796e16ce93650a096027d8f0e773e968b31286c0592392b |

補記：已保留主幹並行更新；完整發布前一版本與合併後 SHA-256 見 20261115_api_stability_hashes.json 的 releaseParent／releaseParentSha256／afterSha256。前述表格為首次候選版本，不覆蓋歷史。部署來源 CRLF 正規化後，本次稽核的 9 個核心檔案全數一致，先前「最新來源未確認」限制已釐清。

## 發布結果補記（2026-11-16 UTC）

修復已推送 GitHub；共 82 項針對性測試通過。財務與 ERP 部署 READY：dpl_i3yoyx8EBicaSYipPZYc3wqcUC7y、dpl_95uiUun9gUdKKeRxvPz6PsuqTWKZ（gass 0b03912）。公開 health 在 2026-11-16 01:29 UTC 回報 503 / DEGRADED / offline_snapshot / readOnly，代表主庫不可達仍未解決，不是已恢復同步。主監控當次回報 HEALTHY，但尚未部署本次 Next 修復。Next Git d6b57b2、LINE Git 60890d9 尚未發布：Vercel Git 來源不可取得，替代檔案發布被自動審查拒絕，分別涉及客戶／訂單快照與讀取正式會員資料產生索引。禁止繞過，待明確授權。LINE 建置唯讀修復通過測試，但不能據此宣稱實際正式資料建置已驗收。未操作正式資料庫、未發送通知；門市安裝與通知 outbox 整合仍待完成。

雲端紀錄補驗完成：ERP、財報、監控中心、司機 App 四份固定維護紀錄與雲端同步狀態 JSON，均已原 ID 更新並下載回查 SHA-256 一致。精確 file ID、指紋、部署狀態與阻擋原因見 20261116_release_status.json。gass 正式 health 日誌已確認「Supabase environment variables are missing」，需由正式部署設定補齊，不能僅重新部署。程式修復 82 項測試通過，不代表正式串接已恢復。

後續更正（2026-11-16 01:42 UTC）：Next 正式入口已更新為 dpl_dHXHW5uugUJN9ypTnvht7riuTJ7V / fa7ea54（READY），Git 祖先驗證包含本次 d6b57b2 修復，且核心修復檔案未再改動；本次被拒絕的檔案發布未重試。公開 heartbeat 已回覆 source=system-status，證明統一來源修復生效；當次 status=DOWN、age=96 秒，因此不能宣稱門市串接穩定。LINE 正式入口仍是舊版，發布等待正式會員資料唯讀索引建置授權。
