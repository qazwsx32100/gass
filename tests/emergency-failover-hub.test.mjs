/**
 * emergency-failover-hub.test.mjs
 * 盛隆瓦斯 - 全系統緊急容錯降級、熔斷自癒與業務紅線強化回歸測試套件
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { sendErrorAlert, getTelegramConfig } from "../api/_telegram.js";

const require = createRequire(import.meta.url);
const {
  reportSystemIncident,
  evaluateCircuitSelfHealing,
  pushToDeadLetterQueue,
  getDeadLetterQueue,
  resolveDeadLetterJob,
  toggleManualOverride,
  getSystemResilienceState,
  validateOrderConstraints,
  detectLeakEmergency,
  LEAK_KEYWORDS,
} = require("c:/shenglong-next/lib/emergency-failover-hub.ts");
const { buildDispatchWritebackSql } = require("c:/shenglong-next/lib/erp-writeback-engine.cjs");

test("Failover Hub 1: 斷路器與自動熔斷降級狀態機", async (t) => {
  // 1. 初始狀態檢驗
  const initial = getSystemResilienceState();
  assert.equal(initial.circuitStatus, "HEALTHY");
  assert.equal(initial.manualOverrideActive, false);

  // 2. 單一低階警告事件不觸發熔斷
  const res1 = reportSystemIncident({
    module: "NEW_ERP",
    severity: "LOW",
    message: "零星網路微幅延遲 300ms",
  });
  assert.equal(res1.circuitTripped, false);

  // 3. 連續 5 次失敗觸發自動熔斷降級
  for (let i = 0; i < 5; i++) {
    reportSystemIncident({
      module: "LEGACY_SQL",
      severity: "HIGH",
      message: `資料庫連線逾時測試 #${i + 1}`,
    });
  }

  const trippedState = getSystemResilienceState();
  assert.equal(trippedState.circuitStatus, "CIRCUIT_OPEN", "連續失敗必須觸發 CIRCUIT_OPEN 熔斷");
  assert.equal(trippedState.manualOverrideActive, true, "熔斷後必須自動切換為手動降級模式");

  // 4. 老闆手動覆蓋介入
  toggleManualOverride(false, "老闆確認問題已排除，恢復自動模式");
  const recoveredState = getSystemResilienceState();
  assert.equal(recoveredState.manualOverrideActive, false);
  assert.equal(recoveredState.circuitStatus, "HEALTHY");
});

test("Failover Hub 2: 死亡信件待查區 (DLQ) 單筆故障隔離與排除", async (t) => {
  // 1. 隔離故障單據至 DLQ
  const dlqJob = pushToDeadLetterQueue({
    action: "create",
    orderId: "ERR_ORDER_999",
    payload: { phone: "0900000000", address: "無效測試地址" },
    errorReason: "舊 ERP 資料庫欄位長度溢位 (Error 8152)",
  });

  assert.ok(dlqJob.id.startsWith("dlq_"));
  assert.equal(dlqJob.failedAttempts, 1);
  assert.equal(dlqJob.status, "PENDING_REVIEW");

  // 2. 查詢待排查清單
  const dlqList = getDeadLetterQueue();
  assert.ok(dlqList.some((j) => j.id === dlqJob.id));

  // 3. 測試重試解析
  const retryRes = resolveDeadLetterJob(dlqJob.id, "RETRY");
  assert.equal(retryRes.success, true);
  assert.equal(retryRes.job.status, "RETRYING");

  // 4. 測試標記人工排除
  const manualRes = resolveDeadLetterJob(dlqJob.id, "RESOLVED_MANUAL");
  assert.equal(manualRes.success, true);
  assert.equal(manualRes.job.status, "RESOLVED_MANUAL");
});

test("Failover Hub 3: 硬性保本底線 ($542) 與數值越界安全防禦", (t) => {
  // 1. 惡意低價誘騙 (例如 $200 叫 20kg 瓦斯)
  const badPriceRes = validateOrderConstraints({
    price: 200,
    quantity: 1,
    phone: "0912-345-678",
    address: "三重區中正路10號",
  });
  assert.equal(badPriceRes.isValid, false, "破底價格必須判定無效並產生警告");
  assert.equal(badPriceRes.sanitized.price, 542, "破底價格必須強制修正為保本價 $542");

  // 2. 正常價格通過 ($800)
  const okPriceRes = validateOrderConstraints({
    price: 800,
    quantity: 1,
  });
  assert.equal(okPriceRes.isValid, true);
  assert.equal(okPriceRes.sanitized.price, 800);

  // 3. 負數與溢位金額防禦
  const negativeRes = validateOrderConstraints({
    price: -500,
    quantity: -10,
    collectedAmount: -100,
    emptyReturned: -5,
  });
  assert.ok(negativeRes.sanitized.price >= 542, "負數價格必須修正為保本價");
  assert.equal(negativeRes.sanitized.quantity, 1, "負數數量必須修正為至少 1 桶");
  assert.equal(negativeRes.sanitized.collectedAmount, 0, "負數實收金額必須歸零");
  assert.equal(negativeRes.sanitized.emptyReturned, 0, "負數空瓶必須歸零");
});

test("Failover Hub 4: 漏氣與異味 100% 霸王級緊急避險協定", (t) => {
  // 1. 漏氣測試
  const leak1 = detectLeakEmergency("我家客廳好像聞到瓦斯味，該怎麼辦？");
  assert.equal(leak1.isEmergency, true);
  assert.ok(leak1.emergencySop.includes("關閉鋼瓶角閥"));
  assert.ok(leak1.emergencySop.includes("嚴禁開關任何電器"));

  // 2. 異味與嘶嘶聲測試
  const leak2 = detectLeakEmergency("熱水器旁邊有嘶嘶聲而且味道很重");
  assert.equal(leak2.isEmergency, true);
  assert.ok(leak2.emergencySop.includes("撥打 119"));

  // 3. 一般叫氣不觸發
  const normal = detectLeakEmergency("你好我要叫兩桶20公斤瓦斯送3樓");
  assert.equal(normal.isEmergency, false);
});

test("Failover Hub 5: 回寫引擎輸入防禦與邊界清洗", (t) => {
  // 1. 修改訂單金額溢位與負數清洗
  const editJob = {
    orderId: 360001,
    action: "edit",
    payload: {
      amount: -800,
      quantity20: -5,
      remarks: "惡意測試' OR '1'='1",
      driver: "小龍",
    },
  };
  const editRes = buildDispatchWritebackSql(editJob);
  assert.ok(editRes.sql.includes("oder_price = 0"), "負數金額必須清洗為 0");
  assert.ok(editRes.sql.includes("oder_20kg = 0"), "負數數量必須清洗為 0");
  assert.ok(!editRes.sql.includes("' OR '1'='1"), "SQL Injection 必須被轉義");

  // 2. 司機完工收款與空瓶越界清洗
  const payJob = {
    orderId: 360002,
    action: "pay",
    payload: {
      driver: "游柏林",
      emptyReturned: 999, // 超過 50 支
      collectedAmount: 999999, // 超過 20 萬
    },
  };
  const payRes = buildDispatchWritebackSql(payJob);
  assert.ok(payRes.sql.includes("【收空瓶:50支】"), "空瓶回收上限必須被鉗制在 50 支");
  assert.ok(payRes.sql.includes("【實收:$200000】"), "實收金額上限必須被鉗制在 200,000 元");
});

test("Failover Hub 6: Telegram 錯誤告警與三大多功能排錯按鈕生成", async (t) => {
  // 1. 回寫失敗排錯按鈕 (包含立即重試、移至 DLQ、一鍵純人工)
  const writebackAlert = await sendErrorAlert({
    title: "SQL 回寫超時異常",
    error: new Error("Connection timed out after 5000ms"),
    source: "sync-stock.cjs",
    errorType: "writeback",
    actionId: "job_test_123",
  });
  // 因本地無 TELEGRAM_BOT_TOKEN，sendTelegramMessage 回傳 null，但函式不報錯
  assert.ok(Array.isArray(writebackAlert));

  // 2. 漏氣急件警報按鈕
  const leakAlert = await sendErrorAlert({
    title: "高危緊急：客戶通報瓦斯漏氣",
    error: "文化北路二段 4 樓疑似外洩",
    source: "LINE AI 客服",
    errorType: "leak_emergency",
    actionId: "leak_999",
  });
  assert.ok(Array.isArray(leakAlert));

  // 3. 破底價格異常警報按鈕
  const priceAlert = await sendErrorAlert({
    title: "業務風控警報：單價低於保本線",
    error: "訂單 #361599 填寫價格 $450 < $542",
    source: "operations-pricing",
    errorType: "price_anomaly",
    actionId: "price_check_01",
  });
  assert.ok(Array.isArray(priceAlert));
});
