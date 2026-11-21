---
name: shenglong-ai-departments
description: >-
  盛隆瓦斯八大 AI 部門（財務主管、營運主管、行政專員、客服專員、AI 秘書、系統工程師/工程部門、業務專員、行銷專員）權威架構、職責邊界、推播與開屏4大哨兵及一鍵召喚手冊。當使用者詢問八大AI部門、召喚任一AI部門、AI工程部門監控、AI財務稽核、AI行銷召回或AI秘書指令時使用。
---

# 盛隆瓦斯八大 AI 部門權威架構與一鍵召喚技能

> 權威文件來源：[docs/AI_EIGHT_DEPARTMENTS_ARCHITECTURE_AND_PLAYBOOK.md](file:///C:/shenglong-next/docs/AI_EIGHT_DEPARTMENTS_ARCHITECTURE_AND_PLAYBOOK.md)
> 桌面鏡像：`C:\Users\懶\Desktop\盛隆瓦斯_八大AI部門架構與召喚操作手冊.md`

## 召喚觸發條件
當使用者提及以下關鍵字時，主動調用此技能並依對應部門之權限與 API 執行：
- 「召喚AI部門」、「八大AI部門」、「AI部門架構」、「AI部門巡檢」、「AI部門GitHub」
- 「召喚AI工程部門」、「召喚AI系統工程師」、「推播與開屏哨兵」
- 「召喚AI財務主管」、「召喚AI營運主管」、「召喚AI行政專員」、「召喚AI客服專員」、「召喚AI秘書」、「召喚AI業務專員」、「召喚AI行銷專員」

## 八大 AI 部門快速路由與巡檢入口

1. **💰 AI 財務主管 (`FINANCE_SUPERVISOR`)**
   - 核心模組：`lib/ai-finance-audit-service.ts`
   - 線上 API：`GET /api/ai/finance/audit`
   - 職責：守護進氣 $22.63/kg、運費 $70/$140、住家保本 $556 / 商家保本 $529 及最低售價底線雙階審計、司機 COD 對帳。
2. **🛵 AI 營運主管 (`OPERATIONS_SUPERVISOR`)**
   - 核心模組：`lib/ai-eight-departments.ts`、`lib/gas-stock-health.ts`
   - 線上 API：`GET /api/ops/snapshot`、`GET /api/today-orders`、`GET /api/gas-stock`
   - 職責：即時派單建議、機車順路導航 (`travelmode=two_wheeler`)、空滿瓶庫存週轉。
3. **📋 AI 行政專員 (`ADMIN_SPECIALIST`)**
   - 核心模組：`lib/cloud-customer-gateway.ts`
   - 線上 API：`GET /api/ai/eight-departments` (`liveTelemetry.customerMaster`)
   - 職責：主責 3,943 戶客戶主檔管理（建檔、地址標準化率、同電話多戶關聯檢查；歷史交易禁改）。
4. **💬 AI 客服專員 (`CUSTOMER_SERVICE_SPECIALIST`)**
   - 核心模組：`c:\Gass\api\_knowledge-base.js`、`docs/GAS_CONSUMER_FAQ_300.md`
   - 職責：300 題瓦斯知識庫問答、LINE 四語語音叫瓦斯、客訴與地址異動提報。
5. **🤖 AI 秘書 (`EXECUTIVE_SECRETARY`)**
   - 核心模組：`lib/ai-eight-departments.ts`、`lib/seven-ai-autopilot-scheduler.ts`
   - 線上 API：`GET/POST /api/ai/secretary/command`、`GET/POST /api/ai/autopilot`
   - 職責：單一自然語言指令入口、任務分派、主責跨部門數據分析統籌、四班戰報（08:00/尖峰/14:30/21:30）。
6. **🛡️ AI 系統工程師 / 工程部門 (`SYSTEM_ENGINEER`)**
   - 核心模組：`lib/ai-engineering-monitor.ts`、`lib/ai-engineering-service.ts`
   - 線上 API：`GET /api/ai/eight-departments` (`liveTelemetry.engineeringSentinel`)、`GET /api/ai/engineering/inspections`
   - 職責：主責全系統健康監控、舊 ERP 黑盒子零 DDL 防護、30年8檢鋼瓶安檢、以及**推播與雙端 0ms 開屏速度 4 大專屬哨兵**（`orderSyncChannel`、`driverFcmSentinel`、`operationsWebPushSentinel`、`fastBootLatencySentinel`）。
7. **📊 AI 業務專員 (`SALES_SPECIALIST`)**
   - 核心模組：`lib/ai-eight-departments.ts`
   - 職責：新客開發、生意大戶叫氣斷崖流失預警、新莊/泰山/五股/三重商圈滲透率分析。
8. **📢 AI 行銷專員 (`MARKETING_SPECIALIST`)**
   - 核心模組：`lib/ai-marketing-service.ts`
   - 線上 API：`GET /api/ai/marketing/recall`
   - 職責：住家 52 天用氣週期追蹤、45/60/90 天沉睡客分級、個人化 LINE 召回文案生成。

## 安全邊界鐵律
- **L1 自動執行**（純查詢/分析）、**L2 預先核准**（低風險標準作業）、**L3 老闆人工簽核**（金流/改價/刪除/正式部署）。
- 嚴守 **Directive #4 舊 ERP 零更動黑盒子鐵律** 與 **AI 犯錯中心 60 秒輪詢下限鐵律**。
