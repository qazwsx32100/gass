# 👑 盛隆瓦斯 — 門市 ERP 雲端資料鏡像自動寫入工具包使用手冊

> **適用設備**：盛隆門市 20 年舊 ERP 主機 (Windows 系統)  
> **核心使命**：將門市 SQL Server 內的 3,934+ 戶客戶主檔（含 `26.21.1` 等經典代號、地址、電話、慣用規格）與每日訂單，自動、安全、秒級鏡像至 Supabase 雲端唯一窗口。  
> **神聖鐵律**：嚴格遵守 **Directive #4 舊 ERP 絕對零更動黑盒子鐵律**，全流程採用 `WITH (NOLOCK)` 唯讀查詢，絕不佔用表級鎖，絕不更動門市資料庫任何欄位與架構。

---

## 📂 工具包檔案清單

| 檔案名稱 | 說明 | 使用情境 |
| :--- | :--- | :--- |
| `一鍵同步門市資料至雲端.bat` | **【手動】** 雙擊一鍵立即同步 | 隨時想手動將門市最新客戶與訂單推送至雲端時使用 |
| `安裝每晚21點自動同步排程.bat` | **【自動】** 註冊 Windows 工作排程 | 只需執行一次，系統每晚打烊 21:05 自動背景靜默鏡像 |
| `卸載自動同步排程.bat` | 移除已註冊的自動排程 | 如需停用自動同步時點擊 |
| `sync-cloud-mirror.cjs` | 核心 Node.js 提取與寫入引擎 | 由批次檔或排程自動調用，採用 REST API 直寫 Supabase |
| `sync-config.env` | 連線設定檔 (Supabase 金鑰與 SQL 端點) | 首次帶到主機時設定一次即可 |

---

## 🚀 如何帶到 ERP 主機並使用（三步驟）

### 步驟 1：取得工具包
* **方式 A (透過 GitHub)**：
  在 ERP 主機上打開命令提示字元或 PowerShell：
  ```bash
  git clone https://github.com/qazwsx32100/gass.git
  # 或者若是已有專案資料夾，直接 git pull 更新
  ```
* **方式 B (透過隨身碟或壓縮包)**：
  直接將本工具資料夾 `tools/erp-cloud-sync` 複製至 ERP 主機（例如放置於 `C:\盛隆瓦斯雲端同步\` 或 `D:\盛隆瓦斯雲端同步\`）。

---

### 步驟 2：確認設定檔 (`sync-config.env`)
用筆記本（Notepad）開啟資料夾內的 `sync-config.env`：
```env
# 1. 雲端 Supabase 連線資訊
SUPABASE_URL=https://ytwhfiudhhdkmzobqmqq.supabase.co
SUPABASE_SERVICE_ROLE_KEY=您的_SUPABASE_SERVICE_ROLE_KEY

# 2. 門市 SQL Server 連線設定 (通常維持預設即可自動探測)
SQL_SERVER=.\SQLEXPRESS
SQL_DB=ShengLong_Inspection
```
> [!NOTE]
> `SUPABASE_SERVICE_ROLE_KEY` 請填入專案之 Service Role 密鑰（具備資料庫寫入權限，不消耗 Edge Function 配額）。

---

### 步驟 3：開始同步！

#### 💡 選項一：手動立即同步一次
直接在檔案總管中**滑鼠雙擊**：
👉 `一鍵同步門市資料至雲端.bat`
* 終端機將依序顯示：
  1. 門市客戶主檔提取進度（如：`✅ 成功提取客戶主檔: 3934 戶`）
  2. 當日與近期訂單提取進度（如：`✅ 成功提取近期訂單: 128 筆`）
  3. Supabase REST API 直寫進度（`cloud_customers` 與 `cloud_orders`）
  4. 耗時結算（通常約 1~2 秒完成）！

#### ⏰ 選項二：設定每晚 21:05 自動執行（推薦！）
在檔案總管中**滑鼠右鍵點擊**：
👉 `安裝每晚21點自動同步排程.bat` ➔ 選擇「**以系統管理員身分執行**」
* 安裝完成後，每晚打烊時間（21:05），Windows 工作排程器將在背景自動靜默完成鏡像，**完全不會跳出黑視窗干擾門市人員**！

---

## 🛡️ 安全防護與效能保證

1. **門市小姐鍵盤極速打單零干擾**：
   查詢語句 100% 注入 `SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;` 與 `WITH (NOLOCK)`，零表級鎖，門市開單、結帳不受任何影響。
2. **終生零 402/429 限流風險**：
   直接調用 Supabase PostgreSQL REST API 批次寫入（每批 500 筆），**完全不走 Edge Function**，不消耗每月 50 萬次調用額度。
3. **Big5 繁體中文編碼完美解碼**：
   客戶姓名、地址、樓層、電話與品項備註無任何問號或亂碼。
4. **雲端唯一窗口無縫貫通**：
   同步完成後，外勤司機端 APP、老闆來電彈屏、監控中心與八大 AI 助理矩陣在 0 毫秒內皆能即時查詢到最新資料！
