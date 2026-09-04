# 盛隆 LINE 會員資料同步

此私人專案使用 GitHub Actions 的臨時 Linux 執行環境：

1. 從盛隆的 Google Drive 下載 `ShengLong_hour.bak`。
2. 使用 SQL Server Express 還原至臨時資料庫。
3. 結構檢查只輸出資料表、欄位名稱、資料型別及筆數。
4. 會員同步只覆寫專用試算表的 `會員資料` 分頁。
5. 只同步會員叫過之瓦斯規格與歷史單價；不同步欠款或其他財務資料。
6. 不將 `.bak` 或任何客戶資料提交至 GitHub。
7. 工作結束時刪除執行環境與暫存備份。

## 必要的 GitHub Secrets

- `GOOGLE_SERVICE_ACCOUNT_JSON`：只能讀取指定 Drive 備份的 Google 服務帳號。
- 臨時 SQL Server 密碼每次執行自動產生，不需保存。

更新 Drive 備份後，手動執行 `Sync ShengLong members` 即可重新同步會員資料。
