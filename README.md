# 🔥 盛隆瓦斯 - 全系統架構總覽

> **GitHub 倉庫**：[https://github.com/qazwsx32100/gass](https://github.com/qazwsx32100/gass)  
> **最後更新**：2026 年 10 月  
> **系統狀態**：✅ 線上運行中

---

## 🗺️ 系統架構全貌

```
盛隆瓦斯完整技術體系
│
├── 🖥️ 店面主機（Windows PC / SQL Server）
│   ├── 進銷存 ERP（127.0.0.1:1000）
│   ├── 備份 Daemon（Python 每 1 秒同步）
│   └── 自動備份 → Google Drive
│
├── ☁️ 雲端後台（Vercel - 新加坡節點）
│   ├── 主 ERP Web App（Vite + React）
│   │   └── https://erp-weld-three-96.vercel.app
│   └── 即時看板與監控（Next.js SSR）
│       └── https://shenglong-next.vercel.app
│
├── 📱 LINE 叫瓦斯系統（Vercel LIFF）
│   └── LIFF ID：2011207944-VaQEXeyi
│
└── 🤖 Telegram 機器人
    └── @shenglong_gas_bot
```

---

## 📦 子系統 1：主 ERP 系統

**網址**：`https://erp-weld-three-96.vercel.app`  
**GitHub 路徑**：[`/src`](https://github.com/qazwsx32100/gass/tree/main/src) · [`/api`](https://github.com/qazwsx32100/gass/tree/main/api)  
**技術**：Vite + React 18 + Supabase + Firebase + SQL Server

### 功能頁面

| 頁面 | 功能描述 |
|------|----------|
| 🏠 Dashboard（儀表板） | 當月損益表、現金流、毛利率、營業利潤卡片 |
| 📊 輸入頁（Inputs） | 收入、支出、銀行帳目、支票管理手工輸入 |
| 📋 訂單派工（Orders） | 新訂單接收、指派師傅、送達確認、結帳轉帳 |
| 🛢️ 鋼瓶管理（Cylinders） | 鋼瓶庫存、進出氣記錄、押瓶管理、月度進氣報告 |
| 📈 報表（Reports） | 月報/季報/年報、損益分析、股東分紅查詢 |
| ⚙️ 設定（Settings） | 公司資料、會計科目、使用者權限、銀行帳號 |

### API 端點（`/api/*.js`）

| 端點 | 說明 |
|------|------|
| `/api/app-state` | 資料讀寫主 API（ERP 核心） |
| `/api/telegram-webhook` | Telegram 機器人接收與回應 |
| `/api/orders` | LINE 訂單接收入庫 |
| `/api/backups` | 備份狀態查詢與觸發 |
| `/api/auth-login` | 登入驗證與裝置核准 |
| `/api/customer-cylinder-events` | 鋼瓶押瓶/退押紀錄 |
| `/api/cylinder-movements` | 鋼瓶異動流水帳 |
| `/api/cron-daily-backup` | 每日 19:00 UTC（= 台灣時間 03:00）自動備份排程 |

### 權限角色

| 角色 | 可見功能 |
|------|----------|
| `owner`（老闆） | 全部功能含股東報表與刪除 |
| `manager`（管理員） | 全部功能（不含股東專區） |
| `driver`（司機） | 僅 DriverApp（今日派送單） |

---

## 📊 子系統 2：即時看板（shenglong-next）

**網址**：`https://shenglong-next.vercel.app`  
**GitHub 路徑**：（獨立 Next.js 專案，部署在另一 Vercel 專案）  
**技術**：Next.js 14 (App Router) + SSR + Supabase Realtime

### 頁面

| 網址 | 功能 |
|------|------|
| `/gas-stock` | 🛢️ **即時庫存看板**：50/20/16/10/4kg 各規格現存桶數、今日進氣、今日已出、補貨閾值警示 |
| `/today-orders` | 📋 **今日叫貨看板**：所有 LINE 下單訂單清單、師傅篩選、複製 LINE 派工文字、送達標記 |
| `/system-status` | 💻 **系統監控中心**：主機心跳、SQL 延遲、Daemon 同步狀態、Telegram Bot 連線狀態、硬體健康（RAM/硬碟） |

### 即時 API（供看板讀取）

| 端點 | 回傳格式範例 |
|------|-------------|
| `/api/gas-stock` | `{"qty20":41,"todayDelivered":{"out20":0},"todayRestocked":{"in20":50},...}` |
| `/api/today-orders` | 當日所有訂單清單（JSON 陣列） |
| `/api/system-status` | 主機心跳時間、同步狀態、硬體指標 |

---

## 📱 子系統 3：LINE 叫瓦斯系統（LIFF）

**LIFF ID**：`2011207944-VaQEXeyi`  
**GitHub 路徑**：[`/shenglong-line-sync/shenglong-line-sync-main/web`](https://github.com/qazwsx32100/gass/tree/main/shenglong-line-sync)  
**技術**：Vanilla JS + Vercel Serverless Functions + Google Sheets API

### 客戶使用流程

```
LINE → 點「叫瓦斯」選單 → LIFF 網頁開啟
  │
  ├── [輸入電話號碼]
  │     │
  │     ├── 找到客戶 ──→ 確認姓名/地址 ──→ 選規格數量
  │     │                                        │
  │     └── 找不到                               ▼
  │           ├── 🔍 我有其他電話        優惠折抵輸入
  │           └── 🆕 我是新客人建立資料       │
  │                                            ▼
  │                                      確認總金額
  │                                            │
  │                                      送出訂單 ✅
  │                                            │
  │                          ┌────────────────┐
  │                          ▼                ▼
  │                  Telegram 推播      /today-orders
  │                  @shenglong_gas_bot  看板即時更新
  └──────────────────────────────────────────────────
```

### 核心功能

| 功能 | 實作說明 |
|------|----------|
| **電話查詢（主電話）** | 直接比對會員表 `客戶電話` 欄位 |
| **電話查詢（備註欄位）** | 自動擷取 `customer_remarks` 中的市話/手機號碼一起比對 |
| **查無電話雙按鈕** | 「我有其他電話」（重查）＋「我是新客人建立資料」（新建） |
| **每桶單價標示** | 依會員歷史單價或預設定價顯示（50kg $2100 / 20kg $850 / 16kg $750 等） |
| **Stepper 加減數量** | 手機友善的 `[ － ]` `桶數` `[ ＋ ]` 按鈕，即時計算小計 |
| **優惠代碼折抵** | 支援代碼（SL50/LINE50/FIRST50 等）或直接輸入折抵金額 |
| **即時金額試算** | 瓦斯小計 - 優惠折抵 = **應付總額（現場收款）** |
| **Telegram 派工推播** | 下單後秒級推播含 Google 地圖導航連結＋一鍵撥號 |

### Google Sheets 資料結構

| 工作表名稱 | 說明 |
|-----------|------|
| `會員資料` | 從 SQL 同步的客戶主檔（含電話、地址、歷史單價） |
| `LINE會員` | LINE 用戶 ID 與客戶資料對應表 |
| `地址` | 客戶常用配送地址清單 |
| `產品` | 瓦斯規格與現行定價 |
| `訂單` | 所有 LINE 下單訂單主表 |
| `訂單明細` | 訂單品項（規格、數量、單價、小計） |

---

## 🤖 子系統 4：Telegram 機器人

**機器人帳號**：`@shenglong_gas_bot`  
**GitHub 路徑**：[`/api/telegram-webhook.js`](https://github.com/qazwsx32100/gass/blob/main/api/telegram-webhook.js) · [`/api/_telegram.js`](https://github.com/qazwsx32100/gass/blob/main/api/_telegram.js)

### 群組分流架構

| 環境變數 | 群組功能 |
|---------|---------|
| `TELEGRAM_REPORT_CHAT_ID` | 📊 匯報中心（所有通知＋系統告警） |
| `TELEGRAM_ORDER_CHAT_ID` | 📦 訂單群（新訂單＋派工按鈕） |
| `TELEGRAM_ALERT_CHAT_ID` | 🚨 警報群（異常/錯誤告警） |

### 快捷指令（9 大功能）

| 指令 | 功能 |
|------|------|
| `/庫存` | 查詢各規格即時桶數 |
| `/訂單` | 今日訂單明細清單 |
| `/司機` | 各師傅趟數與收款戰報 |
| `/出貨` | 今日出貨累積總量 |
| `/週報` | 近 7 日出貨趨勢長條圖 |
| `/進貨建議` | 智慧進貨桶數與分裝廠簡訊 |
| `/主機健檢` | 記憶體/硬碟/延遲指標 |
| `/立即備份` | 遠端立即觸發 DB 打包 |
| `/一鍵修復` | 秒級連線自癒重置 |

### 派工卡片格式（師傅收到的訊息）

```
📦 【盛隆瓦斯 - 收到 LINE 新訂單】
────────────────────────
👤 客戶姓名：陳先生
📞 聯絡電話：[0912-345-678](tel:0912345678)  ← 點擊直接撥號
📍 配送地址：[新北市板橋區中山路一段88號4樓]  ← 點擊開啟 Google 地圖
⚡ 叫貨規格：20kg 瓦斯 × 2
💰 應收金額：$1,700 (已折抵 $50)
📝 備註：到達前請先電話聯絡
⏰ 下單時間：2026/10/01 15:13:00
────────────────────────
🗺️ 點此開啟 Google 地圖導航

[ 🗺️ Google 導航 ]  [ 📜 歷史紀錄 ]
[ ✅ 接單確認 ]
```

---

## 🖥️ 店面主機與資料同步

**主機位置**：店面桌機（Windows）  
**資料庫**：Microsoft SQL Server（`127.0.0.1:1000`）  
**同步腳本**：[`/shenglong-line-sync/scripts/sync_customers_to_sheet.py`](https://github.com/qazwsx32100/gass/blob/main/shenglong-line-sync/shenglong-line-sync-main/scripts/sync_customers_to_sheet.py)

### 同步機制

```
SQL Server（進銷存資料）
       │  每秒推送
       ▼
Python Daemon（inspect_backup.py）
       │  讀取客戶資料
       ├─→ Google Sheets（供 LIFF 查詢）
       ├─→ Supabase（供雲端 ERP 使用）
       └─→ Google Drive（定期備份 .bak 檔）
```

### 每日自動備份排程

| 時間（台灣） | 動作 |
|------------|------|
| 每日 03:00 | Vercel Cron 觸發 `cron-daily-backup` |
| 備份完成 | 推播至 Telegram 匯報群確認 |
| 每週日 | 完整資料庫備份 + 月度歸檔 |

---

## ⚙️ 環境變數清單

| 變數名稱 | 說明 |
|---------|------|
| `TELEGRAM_BOT_TOKEN` | Telegram Bot API Token |
| `ADMIN_CHAT_ID` | 管理者 Telegram Chat ID（備援） |
| `TELEGRAM_REPORT_CHAT_ID` | 匯報中心群組 Chat ID |
| `TELEGRAM_ORDER_CHAT_ID` | 訂單群組 Chat ID |
| `TELEGRAM_ALERT_CHAT_ID` | 警報群組 Chat ID |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Google Sheets API 服務帳號金鑰（JSON） |
| `MEMBER_SPREADSHEET_ID` | Google Sheets 試算表 ID |
| `SUPABASE_URL` | Supabase 資料庫 URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 服務金鑰 |
| `SESSION_SECRET` | Session Token 加密金鑰 |
| `APP_BASE_URL` | 主系統完整網址（含 https://） |

---

## 🔗 快速連結索引

| 系統 | 連結 | 職責 |
|------|------|------|
| 🖥️ **新 ERP 系統** | http://127.0.0.1:3000 | 店面主機本地進銷存（含來電顯示、排程備份） |
| 📊 **新財報系統** | https://erp-weld-three-96.vercel.app | 雲端財務與股東報表（損益表、現金流、毛利） |
| 🚀 **營運中心** | **https://shenglong-next-phi.vercel.app/operations** | **外送派工・庫存監控・司機管理・挑桶設定** |
| 🛢️ 即時庫存看板 | https://shenglong-next-phi.vercel.app/gas-stock | 即時庫存監控 |
| 📋 今日叫貨看板 | https://shenglong-next-phi.vercel.app/operations | 今日叫貨調度 |
| 🤖 Telegram 機器人 | https://t.me/shenglong_gas_bot | Telegram 9 大快捷指令 |
| 📁 GitHub 營運中心 | https://github.com/qazwsx32100/shenglong-next | 營運中心原始碼 |
| 📁 GitHub 財報系統 | https://github.com/qazwsx32100/gass | 財報系統原始碼 |

---

## 📅 開發里程碑

| 日期 | 里程碑 |
|------|--------|
| 2026-08 | 🎉 主 ERP 系統上線（損益表、進氣報表、鋼瓶管理） |
| 2026-08 | 🤖 Telegram 機器人（9 大快捷指令）正式連線 |
| 2026-08 | 📊 即時看板（庫存、今日訂單、系統監控）上線 |
| 2026-09 | 📱 LINE LIFF 叫瓦斯系統升級（備註電話查詢、Stepper、優惠折抵） |
| 2026-09 | 🗺️ Telegram 派工卡片加入 Google 地圖導航與一鍵撥號 |
| 2026-10 | 🛵 獨立外送司機 App（實體網域隔離、免登入專屬連結、一鍵加桌面、無語音、純淨標籤、挑桶提醒） |
| 2026-10 | 🖥️ 監控中心升級：加入「外送司機管理中心」（司機名冊、新司機自動配發代碼、一鍵複製 App 網址） |
| 2026-10 | 📝 全系統架構與 Google 雲端更新紀錄同步 |
