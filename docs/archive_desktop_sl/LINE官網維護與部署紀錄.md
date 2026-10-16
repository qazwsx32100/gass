# 盛隆 LINE 官網維護與部署紀錄

最後更新：2026-10-05  
維護狀態：正式運作中

## 1. 文件用途

本文件專門記錄盛隆 LINE 官網的架構、正式環境、資料來源、部署、資料庫變更、外部 API、資安調整、測試結果與後續工作。

每次正式變更後，都要在「變更紀錄」新增一列，並記下部署編號、資料庫 migration、驗證結果及回復方式。任何密碼、權杖、私鑰、服務帳號 JSON 或 Cookie 密鑰都不可寫入本文件。

## 2. 正式系統識別

| 項目 | 正式設定 |
|---|---|
| LINE 官方帳號／Messaging API 頻道 | SL瓦斯行 |
| LINE Messaging API Channel ID | 2011282454 |
| LIFF ID | 2011207944-VaQEXeyi |
| 正式網站 | https://shenglong-line-liff.vercel.app |
| Vercel 專案 | shenglong-line-liff |
| Supabase 專案代碼 | ytwhfiudhhdkmzobqmqq |
| 正式主資料 | Supabase |
| 非同步備份 | Google Sheets「盛隆 LINE 會員資料庫」 |
| 目前正式部署 | dpl_F5db51vYpGt95U5nKt5PCoRDnAFs |

## 3. 正式資料流

LINE LIFF 客戶與 LINE 管理者先連到 Vercel API。Vercel 只讀寫 Supabase 正式主資料，並使用 LINE Messaging API 發送通知。Supabase 的備份工作非同步寫入 Google Sheets。Vercel 每 10 分鐘處理通知及檢查 Supabase、LINE 與 Google Sheets。營業主機資料庫尚未取得即時連線，因此目前不自動覆蓋 Supabase。

### 資料一致性原則

- LINE 官網只以 Supabase 作為正式即時資料來源。
- Supabase 故障時停止會員綁定、價格讀取及下單，不使用可能過期的 Google Sheets 資料繼續交易。
- Google Sheets 只做非同步備份與人工查閱。
- 未來營業主機同步採「營業主機到 Supabase」單向增量同步。
- LINE 綁定、登入版本、地址申請、通知與稽核資料留在 Supabase，不回寫舊系統。

## 4. 公開與私人資料界線

### 客戶登入後可取得

- 自己的會員狀態與 LINE 顯示名稱。
- 自己的有效配送地址。
- 自己適用的商品價格、配送費與優惠。
- 自己的訂單與配送進度。
- 首次電話核對時的遮罩候選提示。

### 只有管理後台可取得

- 完整客戶電話、地址與客戶編號。
- 待核對會員、搬家及地址申請。
- 價格版本、生效時間、配送及營運資料。
- 通知、備份、整合健康狀態與稽核紀錄。
- 指定會員的強制登出功能。

### 只有伺服器可取得

- Supabase service role key。
- LINE Channel Access Token。
- Google 服務帳號內容。
- Session Secret、Cron Secret 與管理碼雜湊。
- 原始資料庫錯誤及內部欄位名稱。

## 5. 登入、會員與地址規則

- 客戶由 LINE Login／LIFF 驗證身分。
- 首次輸入電話只建立待核對申請，不會直接綁定客戶。
- 管理者核准後才建立正式 LINE 會員關聯。
- 一名客戶可以有多筆有效地址，但只能有一筆預設地址。
- 搬家、新增地址及新住戶接手舊址是不同操作。
- 搬家時舊地址可停用，但歷史訂單仍保留當時的配送地址。
- 新住戶接手舊址時，舊住戶的會員與訂單歷史不會轉給新住戶。
- 會員登入 Cookie 有效期為 60 天；伺服器可依會員提高 session 版本，使所有舊裝置立即失效。

## 6. API 與資安控制

- 前端不能直接取得 Supabase service role。
- Supabase 營運資料表均啟用 RLS；匿名及一般登入角色無正式資料表權限。
- 會員首頁、電話查找、下單、地址處理、會員核准、限流及整合健康使用指定用途 RPC。
- 首次綁定、核准、地址申請與地址管理在單一資料庫交易內完成。
- 管理登入必須同時通過 LINE 管理者白名單及管理登入碼。
- 管理碼使用帶隨機鹽的 scrypt 慢雜湊。
- 敏感 API 使用 Supabase 持久限流，不能藉由 Vercel 冷啟動重置。
- 公開健康檢查只回傳 ok。
- 前端 CSP 不允許 inline style。
- 伺服器回應不包含 Supabase 欄位、約束或原始錯誤內容。

## 7. 排程與整合健康

- Vercel 每 10 分鐘補送待處理 LINE 通知。
- 同一排程檢查 Supabase、LINE Messaging API 與 Google Sheets。
- 健康紀錄只保存在管理後台；公開端看不到各服務狀態。
- 2026-10-04 14:20 正式實測：
  - Supabase：健康，20 ms。
  - LINE Messaging API：健康，111 ms。
  - Google Sheets：健康，855 ms。
- 2026-10-05 08:20 新版排程實測：
  - Supabase：健康，43 ms。
  - LINE Messaging API：健康，112 ms。
  - Google Sheets：健康，511 ms。
  - Vercel error／fatal runtime log：0 筆。

## 8. 變更紀錄

| 日期 | 範圍 | 變更內容 | 部署／Migration | 驗證 | 結果 |
|---|---|---|---|---|---|
| 2026-10-05 | 價格與工作佇列 | 價格版本、LINE 通知、Google Sheets 備份及管理狀態改為原子化 RPC | 202610050001_queue_and_pricing_rpcs.sql / dpl_F5db51vYpGt95U5nKt5PCoRDnAFs | 59/59 測試、正式權限檢查、回滾交易 | 通過，0 筆測試資料殘留 |
| 2026-10-04 | LINE 連線 | 核實 SL瓦斯行頻道並更新 Vercel 正式長效權杖 | dpl_4F2u4WWKEKEeNQ42YRDHCGzAtnGW | 下一輪排程實際呼叫 LINE API | LINE_HTTP_401 消失，LINE 健康 |
| 2026-10-04 | 整合監控 | 建立三項整合健康表、RPC 與每 10 分鐘檢查 | 202610040005_integration_health.sql | RLS、角色權限及正式排程 | 通過 |
| 2026-10-04 | 會員寫入 | 綁定申請、管理核准、地址申請與地址管理改為原子化 RPC | 202610040006_member_write_rpcs.sql / dpl_4YAkCv8vi7MKKRpcTWdbbh9Aewjo | 58/58 測試、正式權限檢查、回滾交易 | 通過，0 筆測試資料殘留 |
| 2026-10-04 | 登入安全 | 會員 session 可撤銷，管理碼升級 scrypt，敏感 API 持久限流 | 202610040002～004 | Cookie 竄改、權限與限流測試 | 通過 |
| 2026-10-04 | 公開資訊 | 健康頁縮減、CSP 收斂、原始資料庫錯誤隱藏 | dpl_5gYy1E2cybQdwLUuoP1KPvnT4gUf | HTTP、CSP 與錯誤回應檢查 | 通過 |

## 9. 每次正式更新的記錄格式

新增紀錄時填寫：

1. 日期與執行人。
2. 修改原因與影響功能。
3. 修改的程式檔及 migration 名稱。
4. Vercel 正式部署編號。
5. 測試數量與結果。
6. 正式環境健康檢查。
7. 是否涉及客戶資料或權限。
8. 是否有資料 migration。
9. 回復方式與可回復的部署編號。
10. 尚待觀察的風險。

## 10. 尚待處理

1. 確認目前營業軟體實際連線的 SQL Server 與資料庫，建立唯讀增量同步。
2. 把營運後台寫入及部分價格／會員讀取改為指定用途 RPC。
3. 指定管理者 LINE 帳號作為主動告警接收者。
4. 建立正式會員測試帳號，定期測試完整登入、下單、通知與歷史查詢。

## 11. 回復原則

- 程式異常：在 Vercel 回復到前一個已驗證的 READY 部署。
- 資料庫異常：使用對應 migration 的向前修復版本，不直接刪除正式資料。

## 2026-10-05 LINE／舊系統橋接框架與後台權限縮小

- 最終正式部署：`dpl_J9fM9Y78zNCbWxtVr6hE9hXe155b`
- 資料庫 migration：
  - `20261005005501_operations_rpcs.sql`
  - `20261005005649_legacy_order_bridge.sql`
  - `20261005051849_legacy_product_mapping.sql`
  - `20261005075517_legacy_job_order_index.sql`
- 後台營運寫入與主要讀取改用指定用途 RPC。
- 新增雙向訂單橋接、簽章、防重播、唯一工作鍵、退避重試、衝突狀態及正式啟用開關。
- 橋接正式環境保持關閉；未設定營業主機前不會寫入舊系統。
- 驗證：60/60 測試通過、dependency audit 0、交易回滾殘留 0、正式 error/fatal 日誌 0。
- 額外驗證：舊系統 50 公斤、18 公斤、新 4 公斤商品匯入斷言通過且完整回滾；效能 Advisor 的外鍵索引警示已消失。
- 安全預設：具名 SQL 執行個體不混用固定連接埠；未核對舊系統狀態欄位前，狀態工作維持 `review`，不得靜默視為成功。
- 正式 HTTP：首頁 200、營運頁 200、健康檢查 200、未登入後台 401、停用中橋接 503。
- 回復方式：網站可回復到前一個 Vercel deployment；資料庫採向前修復，不刪除同步對照及稽核資料。
- 相關檔案：
  - `reports/Google雲端試算表與系統用途盤點_2026-10-05.md`
  - `reports/LINE與舊系統整合架構_2026-10-05.png`
  - `reports/舊系統同步啟用步驟_2026-10-05.md`
- LINE 異常：核對頻道、權杖所屬頻道與 Vercel sensitive 變數，不把權杖貼進程式或文件。
- 同步異常：停止主機到 Supabase 的同步工作，保留同步游標與衝突報表，不覆蓋 LINE 專屬資料。

## 2026-10-05 16:37 最新正式部署

- 部署編號：`dpl_J9fM9Y78zNCbWxtVr6hE9hXe155b`
- 正式網址：`https://shenglong-line-liff.vercel.app`
- 狀態：READY，正式網域已指向新版本。
- 驗證：首頁 200、營運頁 200、健康檢查 200、未登入後台 401、停用中的舊系統橋接 503。
- 日誌：此部署 error／fatal runtime log 為 0。
- 舊系統同步：框架已包含在本版，但正式開關仍關閉，沒有寫入非營業主機或舊備份。
- 回復依據：前一個已驗證部署為 `dpl_Fvof497j3yKL4E1bmci5tcQprPWu`。
