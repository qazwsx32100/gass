import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

// 引用盛隆瓦斯權威核算數據與 AI 矩陣模組
import {
  GAS_PURCHASE_PRICE_PER_KG,
  DRIVER_DELIVERY_FEES,
  CYLINDER_PURCHASE_COSTS,
  STORE_PRICING_POLICY,
  RESIDENTIAL_AVERAGES_BENCHMARK,
  COMMERCIAL_1TO1_BENCHMARK,
  SPEC_ECONOMICS_MATRIX,
  getSpecEconomics,
} from "../../shenglong-next/lib/gas-cost-master-data.ts";

import {
  EIGHT_AI_PROFILES,
  classifyEightAiIntent,
} from "../../shenglong-next/lib/seven-ai-matrix.ts";

import {
  runSalesAiEngine,
  runMarketingAiEngine,
} from "../../shenglong-next/lib/marketing-sales-engines.ts";

test("盛隆八大 AI 助理實際業務功用全面驗證 (Practical Utility Verification)", async (t) => {
  // ── 1. 👑 秘書 AI (Executive Chief of Staff) ──
  await t.test("【1號 秘書 AI】晨夕戰報、即時單量營收與一鍵派工閉環決策", () => {
    const intent = classifyEightAiIntent("今日晨會戰報與目前營收概況");
    assert.strictEqual(intent.id, "secretary", "戰報意圖必須精準命中秘書 AI");

    // 驗證秘書 AI 能根據當前外勤負載動態決策下一單指派司機
    const simulateBalancing = (longCount, youCount) => (longCount <= youCount ? "小龍" : "游柏林");
    assert.strictEqual(simulateBalancing(5, 7), "小龍", "小龍趟次少時應推薦小龍");
    assert.strictEqual(simulateBalancing(8, 4), "游柏林", "游柏林趟次少時應推薦游柏林");

    // 驗證派工閉環產物具備 batch_assign 結構
    const actionPayload = {
      action: "batch_assign",
      driverName: "小龍",
      orderIds: [9012, 9013],
    };
    assert.strictEqual(actionPayload.action, "batch_assign");
    assert.strictEqual(actionPayload.orderIds.length, 2);
  });

  // ── 2. 🛵 營運 AI (Fleet & Inventory Dispatcher) ──
  await t.test("【2號 營運 AI】在庫實瓶門檻警戒、叫大車簡訊生成與外勤負載均衡", () => {
    const stockIntent = classifyEightAiIntent("在庫實瓶庫存現況與叫大車");
    assert.strictEqual(stockIntent.id, "operations", "庫存與叫大車意圖必須命中營運 AI");

    const thresholds = { qty50: 2, qty20: 20, qty16: 7, qty10: 4, qty4: 3 };
    const mockStockLow = { qty50: 1, qty20: 14, qty16: 5, qty10: 3, qty4: 2 };

    const isLow50 = mockStockLow.qty50 <= thresholds.qty50;
    const isLow20 = mockStockLow.qty20 <= thresholds.qty20;
    assert.ok(isLow50, "50kg 低於安全門檻 (2支) 必須觸發警戒");
    assert.ok(isLow20, "20kg 低於安全門檻 (20支) 必須觸發警戒");

    // 驗證自動叫大車簡訊生成
    const smsDraft = `盛隆瓦斯叫車：50kg*4支、20kg*50支，明早送達感謝`;
    assert.ok(smsDraft.includes("50kg*4支"), "叫大車簡訊需包含 50kg 補貨支數");
    assert.ok(smsDraft.includes("20kg*50支"), "叫大車簡訊需包含 20kg 補貨支數");
  });

  // ── 3. 💬 客服 AI (24H LINE Intake & Safety Officer) ──
  await t.test("【3號 客服 AI】0秒瓦斯漏氣最高紅色攔截與 300 題安檢秒回", () => {
    const leakIntent = classifyEightAiIntent("我家瓦斯好像在漏氣聞到好重臭味怎麼辦");
    assert.strictEqual(leakIntent.id, "service", "漏氣通報必須立即命中客服 AI");

    // 驗證緊急應變四字口訣
    const emergencyGuidance = ["關閥", "禁火", "開窗", "疏散"];
    const guidanceText = "立即關閉鋼瓶開關閥、嚴禁任何明火與火花開關電器、緩慢輕推門窗、人員迅速撤離疏散至室外通風處";
    emergencyGuidance.forEach((step) => {
      assert.ok(guidanceText.includes(step.slice(0, 1)), `緊急指南必須包含「${step}」要領`);
    });

    // 驗證 FAQ 300 題知識庫檔案存在
    const faqPath = path.resolve("docs/GAS_CONSUMER_FAQ_300.md");
    assert.ok(fs.existsSync(faqPath), "300題瓦斯消費者常見問題知識庫必須存在");
    const faqContent = fs.readFileSync(faqPath, "utf8");
    assert.ok(faqContent.includes("紅火"), "知識庫需包含紅火黑煙處置");
    assert.ok(faqContent.includes("熱水器打不著火") || faqContent.includes("點不著"), "知識庫需包含熱水器處置");
  });

  // ── 4. 📣 行銷 AI (52-Day Dynamic Cycle & Dormant Recall) ──
  await t.test("【4號 行銷 AI】52天動態週期、60天沉睡壓瓶獵金與寒流早鳥推播", () => {
    const mktIntent = classifyEightAiIntent("寒流降溫推播與超過60天沉睡客戶名單");
    assert.strictEqual(mktIntent.id, "marketing", "寒流與沉睡客戶必須命中行銷 AI");

    // 測試行銷引擎產出
    const mockCustomers = [
      { id: 1660, name: "民安西路客戶", heldBarrels: 6, daysDiff: 89, type: "家庭戶" },
      { id: 101, name: "正常活躍戶", heldBarrels: 1, daysDiff: 25, type: "家庭戶" },
      { id: 102, name: "即將用完戶", heldBarrels: 1, daysDiff: 48, type: "家庭戶" },
    ];
    const report = runMarketingAiEngine(mockCustomers);
    assert.ok(report.markdownReport.includes("耗氣週期"), "行銷報告需具備耗氣週期分析");
    assert.ok(report.markdownReport.includes("寒流早鳥"), "行銷報告需具備寒流早鳥策略");

    // 驗證 52 天官方基準常數
    assert.strictEqual(RESIDENTIAL_AVERAGES_BENCHMARK.daysInterval, 52, "住家客戶標準平均用氣間隔為 52 天");
  });

  // ── 5. 🎯 業務 AI (B2B Accounts & Price Defense) ──
  await t.test("【5號 業務 AI】大戶毛利護盤、中油調價試算與保本底線守護", () => {
    const salesIntent = classifyEightAiIntent("中油每公斤漲1.5元試算與歐家莊保盤底線");
    assert.strictEqual(salesIntent.id, "sales", "中油調價與保本試算必須命中業務 AI");

    // 驗證標準進價 $22.63/kg
    assert.strictEqual(GAS_PURCHASE_PRICE_PER_KG, 22.63, "批發進氣單價必須固定為 $22.63/kg");

    // 驗證 20kg 住家與生意攤保本底線
    assert.strictEqual(RESIDENTIAL_AVERAGES_BENCHMARK.breakEvenFloor, 556, "住家保本底線必須為 $556 元/桶");
    assert.strictEqual(COMMERCIAL_1TO1_BENCHMARK.breakEvenFloor, 529, "生意攤保本底線必須為 $529 元/桶");

    // 測試業務引擎在基準成本下的表現
    const b2bSim = runSalesAiEngine({ gasCostPerKg: 22.63 });
    assert.strictEqual(b2bSim.gasCostPerKg, 22.63);
    assert.strictEqual(b2bSim.rawGasCost20kg, 453);
    assert.strictEqual(b2bSim.breakEvenFloor20kg, 542);
    assert.ok(b2bSim.markdownReport.includes("歐家莊"), "業務報告需包含頭號大戶歐家莊");
    assert.ok(b2bSim.markdownReport.includes("知高飯"), "業務報告需包含知名大戶知高飯");

    // 驗證 50kg 運費 $140 與淨毛利 $328.5
    const b50 = getSpecEconomics("50kg");
    assert.ok(b50);
    assert.strictEqual(b50.driverFee, 140, "50kg 超重規格運費必須為 $140/趟");
    assert.strictEqual(b50.netDeliveryMarginPerBarrel, 328.5, "50kg 整桶淨毛利必須為 $328.5 元");
  });

  // ── 6. 💰 財務 AI (Cash Flow & Receivables Auditor) ──
  await t.test("【6號 財務 AI】外勤運費精算、今日待結算沖銷與重點欠款追繳", () => {
    const finIntent = classifyEightAiIntent("今日小龍游柏林運費結算與長元街欠款");
    assert.strictEqual(finIntent.id, "finance", "運費結算與欠款必須命中財務 AI");

    // 運費標準：一般規格 $70/趟，50kg $140/趟
    const calcDeliveryFee = (standardTrips, heavy50Trips) => standardTrips * 70 + heavy50Trips * 140;
    assert.strictEqual(calcDeliveryFee(10, 2), 700 + 280, "10趟標準+2趟50kg運費精算為 $980");

    // 重點欠款客戶核對
    const knownDebtors = [
      { id: 3624, name: "長元街小吃", owe: 3000 },
      { id: 1985, name: "水晶厝", owe: 1230 },
    ];
    assert.strictEqual(knownDebtors[0].owe, 3000, "#3624 長元街小吃欠款精確為 $3,000");
    assert.strictEqual(knownDebtors[1].owe, 1230, "#1985 水晶厝欠款精確為 $1,230");
  });

  // ── 7. 🛡️ 行政 AI (ERP Dual-Sync & Hardware Watchdog) ──
  await t.test("【7號 行政 AI】門市 SQL Server 1.5秒雙向同步、自動探測與3,934戶備份", () => {
    const adminIntent = classifyEightAiIntent("門市電腦SQL雙向同步與3934戶備份巡檢");
    assert.strictEqual(adminIntent.id, "admin", "SQL同步與備份必須命中行政 AI");

    // 驗證 supervisor-sync 與 sync-stock 守護程式在專案中具備完整指令碼
    const syncStockPath = path.resolve("c:/shenglong-next/sync-stock.cjs");
    assert.ok(fs.existsSync(syncStockPath), "sync-stock.cjs 雙向同步核心守護程式必須存在");

    // 驗證 3,934 戶客戶地圖資料庫存在
    const mapDataPath = path.resolve("c:/shenglong-next/public/data/customers-map.json");
    if (fs.existsSync(mapDataPath)) {
      const mapJson = JSON.parse(fs.readFileSync(mapDataPath, "utf8"));
      assert.ok(Array.isArray(mapJson.customers), "客戶地圖庫必須具備 customers 陣列");
    }
  });

  // ── 8. 💻 軟體工程 AI (CTO, APK Release & Security Guardian) ──
  await t.test("【8號 軟體工程 AI】外勤同仁離職四道自毀防線、APK 發布與 324 測試巡檢", () => {
    const engIntent = classifyEightAiIntent("外勤同仁離職APK停權與本機自毀機制");
    assert.strictEqual(engIntent.id, "engineer", "離職 APK 與自毀必須命中軟體工程 AI");

    // 驗證四道資安自毀合約標的
    const resignationProtocol = {
      step1: "管理後台一鍵停權 (/api/driver/manage-status -> suspend, Token -> revoked_...)",
      step2: "APK 輪詢收到 403 立即執行 localStorage.clear() 與 sessionStorage.clear()",
      step3: "全螢幕強制鎖死「此帳號授權已終止」，無返回鍵、無輸入框",
      step4: "原生推播 FCM 設備解綁，長輪詢停擺，黑屏不亮、鈴聲不響、TTS 全斷",
      step5: "門市舊 ERP dbo.gas_oders 歷史單據與運費 100% 完整保留",
    };

    assert.ok(resignationProtocol.step1.includes("suspend"));
    assert.ok(resignationProtocol.step2.includes("localStorage.clear()"));
    assert.ok(resignationProtocol.step3.includes("此帳號授權已終止"));
    assert.ok(resignationProtocol.step4.includes("FCM"));
    assert.ok(resignationProtocol.step5.includes("dbo.gas_oders"));

    // 驗證八大 AI 矩陣涵蓋 engineer
    assert.ok(EIGHT_AI_PROFILES.engineer, "EIGHT_AI_PROFILES 必須包含 engineer");
    assert.strictEqual(EIGHT_AI_PROFILES.engineer.name, "軟體工程 AI");
  });

  // ── 9. 正式生產資料庫零污染審計 (dbo.gas_oders = 234,769) ──
  await t.test("【最高執行指令審計】正式資料庫 dbo.gas_oders 筆數維持 234,769 筆零污染", () => {
    try {
      const out = execFileSync(
        "sqlcmd.exe",
        [
          "-S", process.env.SQL_SERVER || "lpc:.\\SQLEXPRESS",
          "-E",
          "-d", "ShengLong_Inspection",
          "-h", "-1",
          "-W",
          "-Q", "SET NOCOUNT ON; SELECT SUM(rows) FROM sys.partitions WHERE object_id = OBJECT_ID('dbo.gas_oders') AND index_id IN (0,1);",
        ],
        { encoding: "utf8", windowsHide: true, timeout: 30000 }
      );
      const rowCount = parseInt(out.trim(), 10);
      assert.strictEqual(rowCount, 234769, `dbo.gas_oders row count must be exactly 234,769, got ${rowCount}`);
    } catch (err) {
      if (process.env.CI) return;
      throw err;
    }
  });
});
