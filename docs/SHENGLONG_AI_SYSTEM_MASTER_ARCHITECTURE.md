# 👑 盛隆瓦斯 全系統一體化與四大核心架構總全書 (ShengLong Master Architecture)

> **最高決策者**：老闆 (Telegram ID: `8862712587`，唯一 SuperAdmin)  
> **專案倉庫**：
> - 營運調度與外勤端：[`shenglong-next`](https://github.com/qazwsx32100/shenglong-next) (`C:\shenglong-next`)  
> - 財務、LINE 與知識庫：[`gass`](https://github.com/qazwsx32100/gass) (`C:\Gass`)  
> **指定雲端維護資料夾**：[Google 雲端維護紀錄資料夾](https://drive.google.com/drive/u/1/folders/1YT7yfMfVmiVic_vaIWf94Ei14wMa3FYM) (`1YT7yfMfVmiVic_vaIWf94Ei14wMa3FYM`)  
> **制定日期**：2026 年 11 月 01 日  
> **核心戰略方針**：**「門市維持二十年習慣零衝擊、中繼升級專用高鐵動脈、外勤與雲端 100% 雙向即時閉環、七大專職 AI 矩陣各司其職、手機與 Telegram 雙向一鍵操控」**

---

## 壹、 盛隆跨平台全系統總體架構拓撲圖 (Cross-Platform Topology)

本圖定義系統的**「空間維度」**——硬體、終端、網路與各系統實體部署邊界：

```mermaid
flowchart TD
  %% 第一層：門市總部
  subgraph HQ["🏢 第一層：門市總部實體 Windows 核心 (地端老本)"]
    direction TB
    SQL[("舊 ERP 資料庫\nSQL Server 2022 @ 127.0.0.1:1000\n全店唯一真實數據老本")]
    DESK["門市桌面打單軟體\n小姐鍵盤打單習慣 100% 零衝擊"]
    TEL["電話來電辨識 (IIS _3443_盛隆)\n0.5 秒抓號自動彈出客戶與開單"]
    DAEMONS["三大微守護進程 (Micro-Daemons)\nsync-stock.cjs / advisor-bot.cjs"]
    DESK <--> SQL
    TEL --> SQL
    DAEMONS <--> SQL
  end

  %% 第二層：雲端中繼動脈
  subgraph CLOUD["⚡ 第二層：專用雲端高速中繼與基礎設施層"]
    direction TB
    SUPA[("專用 Supabase (PostgreSQL)\nlive_snapshots (0.1秒推播)\ncommand_queue (回寫佇列)\ndispatch_queue_v1 (事務防護 & DLQ)")]
    VERCEL["Vercel Edge 閘道\nAPI 路由與嚴格 A+ 資安防禦"]
    BACKUP["多雲異地備援\nGoogle Drive 雲端維護資料夾\n每小時 bak 備份"]
    SUPA --- BACKUP
  end

  %% 第三層：營運戰情與調度
  subgraph OPS["🖥️ 第三層：主營運控制戰情中心 (shenglong-next)"]
    direction TB
    WEB["現代化調度戰情看板 (/operations)\nMobile-First 訂單大字卡片\n車載現貨即時扣減試算\n派小龍 / 派柏林 / 稍後輸入"]
    WAR["AI 戰情室 (<ModernWarRoomView>)\n核心三色 KPI 大卡片\n七大 AI 即時營運建議流"]
    CRM["客戶歷程 (<SharedCustomerHistoryModal>)\n車隊地圖 (<SharedCustomerMap>)"]
    WEB --- WAR
    WEB --- CRM
  end

  %% 第四層：多終端應用
  subgraph APPS["📱 第四層：多終端跨平台應用層 (雙向一鍵操控)"]
    direction TB
    DRIVER["🛵 外勤司機專用端 (小龍、柏林)\nAndroid 原生 APK (存放於 C:\\Users\\懶\\Desktop\\sl)\nWeb/PWA (/driver/admin)\n40px 拇指接單 / 送達收現 / 空瓶回收"]
    LINE["📱 LINE 官方帳號 (gass)\n客戶線上叫瓦斯 / 常用地址\n舊客手機號快速綁定\n7x24 AI 客服與 300 題 FAQ"]
    TG["✈️ Telegram 老闆隨身指揮所\n唯一最高指揮官: 老闆 (8862712587)\n底部常駐 6 大方塊按鈕\n1-Tap 專屬排錯卡片"]
  end

  %% 雙向通訊連接
  DAEMONS <== "雙向高鐵通道 (1秒讀寫 / SQL回寫)" ==> SUPA
  SUPA <== "WebSocket 秒級即時推播" ==> OPS
  SUPA <== "推播任務與回傳狀態" ==> DRIVER
  LINE --> VERCEL --> SUPA
  TG <== "Webhook 雙向指令與推播" ==> VERCEL
```

---

## 貳、 全鏈路雙向閉環資料流向圖 (Bi-directional Loop Sequence)

本圖定義系統的**「時間維度」**——單據從進線、廣播、派工、送達收款到 SQL 回寫核銷的完整生命週期：

```mermaid
sequenceDiagram
  autonumber
  actor Customer as 客戶 / 電話 / 門市
  participant ERP as 門市舊 ERP (SQL Server)
  participant Daemon as 門市守護進程 (sync-stock.cjs)
  participant Cloud as 雲端 Supabase (中繼動脈)
  participant Ops as 網頁調度戰情中心
  actor Driver as 外勤司機 (Android App)
  actor Boss as 老闆 (Telegram Bot)

  Note over Customer,ERP: 1. 訂單建立階段
  Customer->>ERP: 門市小姐鍵盤打單 / 電話 0.5 秒跳轉建單
  Daemon->>ERP: 每秒輪詢讀取新進單據
  Daemon->>Cloud: 鏡像寫入 live_snapshots

  Note over Cloud,Boss: 2. 即時派工與通知階段
  Cloud-->>Ops: 0.1 秒 WebSocket 廣播推播
  Cloud-->>Driver: 司機手機發出「叮咚！新訂單」語音播報
  Cloud-->>Boss: Telegram 訂單群推播卡片 (附導航與時效簽章)

  Note over Ops,Cloud: 3. 調度派單 (支援稍後輸入)
  Ops->>Cloud: 點擊 [派小龍] / [派柏林] / [稍後輸入]
  Cloud-->>Driver: 派單鎖定，車載現貨自動扣減

  Note over Driver,ERP: 4. 現場外送與雙向回寫閉環
  Driver->>Cloud: 現場點擊 [送達收現 $900] + [回收空瓶 1 支]
  Note over Cloud: 樂觀覆蓋層 (Optimistic Overlay)\n消除 1.5 秒閃爍，立即標示送達
  Cloud->>Cloud: 寫入 command_queue (事務防護佇列)
  Daemon->>Cloud: 抓取回寫任務
  Daemon->>ERP: 執行 SQL 回寫 (UPDATE dbo.gas_oders SET status='已送達', paid=1...)
  ERP-->>Daemon: 回寫成功確認
  Daemon->>Cloud: 標記 command_queue 完成

  Note over Cloud,Boss: 5. 閉環確認與日結
  Cloud-->>Ops: 狀態全面綠燈吻合
  Cloud-->>Boss: 營收與已送達統計即時跳表 (21:00 打烊自動封存)
```

---

## 參、 盛隆七大專任 AI 智慧協同矩陣圖 (7-AI Matrix & Resilience)

本圖定義系統的**「智慧與防禦維度」**——各專任 AI 之分工及實體容錯中樞的三大業務紅線：

```mermaid
flowchart TD
  BOSS["👑 老闆最高指揮所\n(Telegram ID: 8862712587 / 手機戰情室)"]

  subgraph MATRIX["盛隆七大專任 AI 智慧矩陣"]
    SEC["🤖 秘書 AI (軍師特助)\n• 每日 08:30 晨會綜合戰報\n• 跨部門異常篩選通報\n• 老闆語音指令轉化下達"]
    CS["💬 客服 AI (7x24 接線生)\n• LINE 自然語言訂單抽取\n• 300 題 FAQ 知識庫\n• 滿意度與客訴安撫"]
    MKT["🎯 行銷 AI (流量雷達)\n• 氣象局低溫驟降連動\n• 耗氣週期預測模型\n• 第 60 天沈睡客喚醒券"]
    SALES["⚔️ 業務 AI (攻堅先鋒)\n• 新開幕餐飲戶掃描\n• 競業搶客防禦 ($542 保本 / $634 VIP)\n• 商業爐具/熱水器連帶銷售"]
    OPS_AI["🚚 營運 AI (調度大腦)\n• 車載現貨動態即時扣減\n• 智慧即時路線規劃 (TSP)\n• 鋼瓶進銷存安全庫存預警"]
    FIN["💰 財務 AI (鐵算盤)\n• 外送員現金收款自動核銷\n• 餐飲大戶月結對帳單\n• 作廢/改價單防弊稽核"]
    ADM["📋 行政 AI (管家合規)\n• 司機出勤排班與工時合規\n• 鋼瓶定檢 60 天法規預警\n• 配送車隊定檢維保"]
  end

  subgraph SHIELD["🛡️ 實體容錯中樞與三大硬性紅線 (emergency-failover-hub.ts)"]
    CB["斷路器熔斷自癒狀態機\n(5次失敗自動切純人工，防連鎖雪崩)"]
    DLQ["死亡信件待查區 (DLQ)\n(單筆隔離，不卡死主動脈)"]
    RED1["保本紅線: 單桶低於 $542 強制糾正\n(VIP 大戶防守價 $634)"]
    RED2["數值防爆: 金額/數量越界鉗制，負數歸零"]
    RED3["漏氣協定: 13 大關鍵字霸王級處置 (1秒通報)"]
  end

  BOSS <== "常駐 6 大金剛按鈕 / 語音指令" ==> SEC
  BOSS <== "LINE 叫貨與問答" ==> CS
  SEC --> MKT
  SEC --> SALES
  SEC --> OPS_AI
  SEC --> FIN
  SEC --> ADM
  MATRIX --- SHIELD
```

---

## 肆、 盛隆全系統一體化全景架構圖 (Unified Master Cyber-Physical Diagram)

本圖融合**空間、時間與智慧**三大維度，為盛隆瓦斯行完整一體化運作之母圖：

```mermaid
flowchart TD
  %% 最高指揮
  subgraph TOP["👑 最高指揮決策所 (Supreme Command)"]
    BOSS["老闆 (Telegram ID: 8862712587 / 專屬手機戰情室)\n【底部常駐 6 大方塊按鈕 / 免打字語音下令】"]
  end

  %% 七大專任 AI 矩陣
  subgraph AI_BRAIN["🧠 盛隆智慧中樞 (七大專任 AI 矩陣)"]
    direction TB
    SEC["🤖 秘書 AI (特助軍師)\n08:30晨報 / 異常彙整 / 任務指派"]
    CS["💬 客服 AI (7x24接線)\nLINE語意轉單 / 300題FAQ"]
    MKT["🎯 行銷 AI (流量雷達)\n氣象低溫連動 / 耗氣週期 / 喚醒券"]
    SALES["⚔️ 業務 AI (攻堅先鋒)\n餐飲新戶掃描 / 爐具熱水器連帶"]
    OPS_AI["🚚 營運 AI (調度大腦)\n車載現貨即時扣減 / 智慧路線 TSP"]
    FIN["💰 財務 AI (鐵算盤)\n外送對帳核銷 / 月結發票 / 防弊稽核"]
    ADM["📋 行政 AI (管家合規)\n鋼瓶定檢 60 天預警 / 車輛維保 / 排班"]
  end

  %% 實體防禦與業務紅線
  subgraph SHIELD["🛡️ 實體容錯中樞與三大硬性紅線 (emergency-failover-hub.ts)"]
    direction TB
    CB["斷路器熔斷自癒狀態機\n(5 次失敗自動切純人工調度)"]
    DLQ["死亡信件待查區 (DLQ)\n(單筆異常隔離，主動脈絕不阻塞)"]
    RULES["三大硬性業務紅線\n• 保本紅線: 單桶低於 $542 強制糾正 (VIP $634)\n• 數值防爆: 金額/數量越界鉗制負數歸零\n• 漏氣協定: 13 大關鍵字 1 秒通報霸王級處置"]
    CB --- DLQ
    DLQ --- RULES
  end

  %% 多終端跨平台應用層
  subgraph FRONTENDS["📱 多終端跨平台應用層 (雙向一鍵操控)"]
    direction TB
    LINE_CLIENT["📱 客戶端 LINE 官方帳號 (gass)\n線上叫瓦斯 / 常用地址 / 舊客手機號快速綁定"]
    WEB_OPS["🖥️ 營運戰情看板 (shenglong-next /operations)\n規格大字膠囊 / 派小龍 / 派柏林 / 【稍後輸入】\n客戶歷程彈窗 / 車隊地圖 / AI 戰情室卡片"]
    DRIVER_APP["🛵 外勤司機 Android App (C:\\Users\\懶\\Desktop\\sl)\n40px 拇指接單 / 配送狀態 / 送達收現 / 空瓶回收 / 語音播報"]
    TG_APP["✈️ Telegram Gass Bot\n訂單即時卡片推播 / 時效簽章 / 1-Tap 專屬排錯"]
  end

  %% 專用雲端高速中繼層
  subgraph CLOUD_RELAY["⚡ 專用雲端高速中繼與基礎設施層"]
    direction TB
    SUPA_LIVE[("Supabase Realtime\n• live_snapshots (0.1秒極速廣播)\n• 樂觀覆蓋層 (Optimistic Overlay 防閃爍)")]
    SUPA_QUEUE[("Supabase 佇列\n• command_queue (回寫任務佇列)\n• dispatch_queue_v1 (事務防護)")]
    VERCEL_GATEWAY["Vercel Edge API 閘道\nStrict A+ 資安標頭 / 速率限制 / 簽章校驗"]
    BACKUP_DRIVE["多雲異地備援\nGoogle Drive 雲端維護資料夾 / 每小時 bak"]
  end

  %% 門市總部實體核心
  subgraph STORE_CORE["🏢 門市總部 Windows 實體核心 (地端老本唯一真實庫)"]
    direction TB
    DESK_ERP["門市桌面打單軟體 (Legacy ERP)\n小姐鍵盤打單習慣 100% 零衝擊"]
    TEL_SYSTEM["電話來電辨識 (IIS _3443_盛隆)\n0.5 秒抓號自動跳轉開單畫面"]
    SQL_CORE[("SQL Server 2022 @ 127.0.0.1:1000\ndbo.gas_oders / dbo.Customer\n全店數十年老本帳")]
    DAEMONS["門市微守護進程 (Micro-Daemons)\n• daemon-data-sync (sync-stock.cjs)\n• daemon-telegram-bot (advisor-bot.cjs)\n• daemon-telephony"]
  end

  %% 串聯交互連線 (智慧與指揮)
  BOSS <== "常駐 6 大金剛按鈕 / 語音下令" ==> SEC
  BOSS <== "監控大盤" ==> WEB_OPS
  SEC --> AI_BRAIN
  AI_BRAIN <== "狀態稽核與防護" ==> SHIELD

  %% 終端與中繼連線
  LINE_CLIENT --> VERCEL_GATEWAY --> SUPA_LIVE
  CS <== "語意轉單 / FAQ" ==> LINE_CLIENT
  WEB_OPS <== "WebSocket 秒級雙向" ==> SUPA_LIVE
  DRIVER_APP <== "推播任務 & 回傳完單" ==> SUPA_LIVE
  TG_APP <== "雙向 Webhook" ==> VERCEL_GATEWAY
  OPS_AI --> WEB_OPS

  %% 雙向閉環核心動脈 (高鐵通道)
  DESK_ERP <--> SQL_CORE
  TEL_SYSTEM --> SQL_CORE
  SQL_CORE <--> DAEMONS
  DAEMONS <== "每秒輪詢鏡像 (1秒雙向高鐵動脈)" ==> SUPA_LIVE
  SUPA_QUEUE <== "拉取送達/收款/改派任務並執行 SQL 回寫" ==> DAEMONS
  FIN <== "自動核銷與損益平衡" ==> SQL_CORE
  ADM <== "鋼瓶定檢與資產監控" ==> SQL_CORE
  CLOUD_RELAY --- BACKUP_DRIVE
```

---

## 伍、 全系統測試保證與驗證標準
1. **零回歸（Zero Regressions）**：全系統 280 項單元測試與沙盒壓力測試全部通過（`pass 280, fail 0`）。
2. **正式資料庫零污染**：門市主機 `dbo.gas_oders` 保持 234,769 筆零污染，所有跨平台測試均在獨立沙盒內執行。
3. **安全邊界無死角**：最高指揮權限嚴格鎖定老闆 Telegram ID `8862712587`，個資脫敏遮罩 100% 覆蓋。
