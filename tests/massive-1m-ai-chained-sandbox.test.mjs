/**
 * massive-1m-ai-chained-sandbox.test.mjs
 * 盛隆瓦斯 - 1,000,000 筆全系統 ↔ 7-AI 智慧中樞大聯動沙盒壓測自動化回歸套件
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { runOneMillionAiChainedSandbox } = require("../scripts/run-1m-ai-chained-sandbox.cjs");

test("1M AI-Chained Sandbox: 1,000,000 筆全系統 ↔ 7-AI 智慧中樞全鏈路大串聯沙盒壓測", async (t) => {
  const result = await runOneMillionAiChainedSandbox();

  // 1. 效能與吞吐量基準驗證
  assert.ok(result.totalDuration < 35.0, `總耗時應小於 35 秒，實際: ${result.totalDuration.toFixed(2)} 秒`);
  assert.ok(result.overallQps > 40000, `吞吐量應大於 40,000 QPS，實際: ${result.overallQps} QPS`);
  assert.ok(result.memoryDeltaMb < 150.0, `記憶體增量應小於 150MB，實際: ${result.memoryDeltaMb} MB`);

  // 2. 正式資料庫零污染保護驗證
  assert.equal(
    result.prodOrderCountAfter,
    result.prodOrderCountBefore,
    "正式資料庫 dbo.gas_oders 筆數在測試前後必須完全一致，杜絕任何沙盒資料污染"
  );

  const { aiTelemetry } = result;

  // 3. 五大子系統流量佔比驗證
  assert.equal(aiTelemetry.systemFlows.lineOrders, 250000, "LINE 訂單流量應為 250,000 筆");
  assert.equal(aiTelemetry.systemFlows.driverAppActions, 250000, "司機 App 流量應為 250,000 筆");
  assert.equal(aiTelemetry.systemFlows.monitoringEdits, 200000, "監控中心改單流量應為 200,000 筆");
  assert.equal(aiTelemetry.systemFlows.callerIdOrders, 150000, "JM489 來電流量應為 150,000 筆");
  assert.equal(aiTelemetry.systemFlows.newErpOrders, 150000, "新 ERP 雲端開單流量應為 150,000 筆");

  // 4. 七大 AI 智慧中樞決策指標驗證
  // 客服 AI
  assert.equal(aiTelemetry.aiDecisions.service.totalHandled, 250000);
  assert.equal(aiTelemetry.aiDecisions.service.leakEmergenciesDetected, 500, "漏氣 500 次應 100% 觸發安全處置");
  assert.equal(aiTelemetry.aiDecisions.service.orderEntitiesExtracted, 250000, "叫氣實體解析率應為 100%");

  // 業務 AI
  assert.equal(aiTelemetry.aiDecisions.sales.breakEvenViolations, 0, "破底低於 $568 保本價違規數應為 0");

  // 行銷 AI
  assert.ok(aiTelemetry.aiDecisions.marketing.yellowAlertsTracked > 0, "應追蹤黃燈關注戶");
  assert.ok(aiTelemetry.aiDecisions.marketing.orangeAlertsWoken > 0, "應篩選橘燈喚醒戶");
  assert.ok(aiTelemetry.aiDecisions.marketing.redBottlesReclaimed > 0, "應篩選紅燈流浪鋼瓶待收戶");
  assert.equal(aiTelemetry.aiDecisions.marketing.totalBottlesReclaimed, 375000, "司機完工空瓶回收累計應精確");

  // 營運 AI
  assert.ok(aiTelemetry.aiDecisions.operations.driverLongDispatched > 0, "小龍應有派工紀錄");
  assert.ok(aiTelemetry.aiDecisions.operations.driverYouDispatched > 0, "游柏林應有派工紀錄");
  assert.ok(aiTelemetry.aiDecisions.operations.totalFreightCalculated > 0, "司機運費應精確累計");
  assert.ok(aiTelemetry.aiDecisions.operations.stockReserved20kg > 0, "20kg 即時庫存扣減應正確");

  // 財務 AI
  assert.ok(aiTelemetry.aiDecisions.finance.cashCollectedTotal > 0, "現金收款應有累計");
  assert.ok(aiTelemetry.aiDecisions.finance.transferCollectedTotal > 0, "銀行轉帳應有累計");
  assert.equal(aiTelemetry.aiDecisions.finance.driverHandoversAudited, 250000, "司機現金交帳審查應為 250,000 次");

  // 行政 AI
  assert.equal(aiTelemetry.aiDecisions.admin.writebackJobsGenerated, 1000000, "回寫 SQL 產出應達 1,000,000 筆");
  assert.equal(aiTelemetry.aiDecisions.admin.rowlockVerifiedCount, 1000000, "ROWLOCK/NOLOCK 事務防死鎖覆蓋應為 100%");
  assert.equal(aiTelemetry.aiDecisions.admin.deadlocksDetected, 0, "死鎖檢測數應為 0");
  assert.equal(aiTelemetry.aiDecisions.admin.syntaxErrors, 0, "SQL 與型別語法例外數應為 0");

  // 秘書 AI
  assert.ok(aiTelemetry.aiDecisions.secretary.closingCutoffTriggered > 0, "應觸發 21:00 打烊排程");
  assert.equal(aiTelemetry.aiDecisions.secretary.eveningReportSynthesized, true, "21:30 晚報應成功生成");
});
