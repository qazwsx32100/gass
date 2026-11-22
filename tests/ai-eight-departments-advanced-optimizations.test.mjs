import test from "node:test";
import assert from "node:assert/strict";

import {
  submitCustomBossApproval,
  markBossApprovalApproved,
  markBossApprovalDismissed,
  resetBossApprovalsForTests,
} from "../lib/boss-approvals-hub.ts";

import {
  runDormantCylinderRecoveryPipeline,
  runBelowCostMarginPipeline,
  runStockDepletionEmergencyPipeline,
} from "../lib/ai-cross-department-pipeline.ts";

import {
  detectCommercialConsumptionAnomalies,
  auditCustomerCoordinateCompleteness,
  auditCustomerServiceSafetyAndFaqGaps,
  recommendRouteCoalescing,
  calculateResidualGasRefund,
} from "../lib/ai-specialist-deep-modules.ts";

test.beforeEach(() => {
  resetBossApprovalsForTests();
  process.env.SHENGLONG_DISABLE_REMOTE_APPROVAL_KV = "1";
});

test("【方向 A】1. 老闆 Telegram L3 審批一鍵核准與駁回狀態機檢驗", async () => {
  const { item } = await submitCustomBossApproval({
    deptName: "💰 AI 財務主管",
    title: "大戶特惠價簽核（三重知高飯 $580/桶）",
    summary: "申請商用月結量大折讓，利潤維持於保本底線 $529 之上。",
    impactLabel: "毛利符合標準",
  });

  assert.equal(item.status, "pending");
  assert.ok(item.id.startsWith("apr_"));

  // 測試核准
  const approvedState = await markBossApprovalApproved(item.id);
  assert.ok(approvedState.approvedIds.has(item.id));
  const approvedItem = approvedState.customItems.find((i) => i.id === item.id);
  assert.equal(approvedItem?.status, "approved");

  // 測試駁回
  const { item: item2 } = await submitCustomBossApproval({
    deptName: "📢 AI 行銷專員",
    title: "全體會員 8 折破盤促銷",
    summary: "違背官方底線，應予駁回。",
  });
  const dismissedState = await markBossApprovalDismissed(item2.id);
  const dismissedItem = dismissedState.customItems.find((i) => i.id === item2.id);
  assert.equal(dismissedItem?.status, "dismissed");
});

test("【方向 B】2. 跨部門 90 天呆瓶壓瓶召回閉環檢驗", async () => {
  const report = await runDormantCylinderRecoveryPipeline(5);
  assert.equal(report.pipelineId, "DORMANT_CYLINDER_RECOVERY");
  assert.ok(report.totalAudited > 0, "必須審計全客戶名冊");
  assert.ok(report.dormantCustomersCount > 0, "必須識別 90 天以上未叫客群");
  assert.ok(report.totalPressedCylinders > 0);
  assert.ok(report.totalFrozenAssetValue > 0);

  // 驗證優先召回清單欄位完整性
  const top1 = report.priorityRecoveryList[0];
  assert.ok(top1.customerId > 0);
  assert.ok(top1.daysDiff >= 90);
  assert.ok(top1.frozenAssetValue >= 1550, "依官方標準單瓶購入成本 $1,550 精算");
  assert.ok(top1.depreciationLossPerYear > 0, "年折舊分攤必須大於0");
  assert.ok(top1.careMessageDraft.includes("盛隆瓦斯關心您"));
});

test("【方向 B】3. 門市訂單倒賠保本底線主動防禦閉環檢驗", () => {
  const mockOrders = [
    { id: 101, name: "正常住家客", totalPrice: 750, b20: 1 }, // 正常 $750 (淨毛利 $227)
    { id: 102, name: "熱炒海鮮店", totalPrice: 620, b20: 1 }, // 商用正常 $620 (淨毛利 $97)
    { id: 103, name: "倒賠住家客", totalPrice: 500, b20: 1 }, // 住家底線 $556，此單 $500 倒賠 $56
    { id: 104, name: "倒賠小吃店", totalPrice: 480, b20: 1 }, // 商用底線 $529，此單 $480 倒賠 $49
  ];

  const report = runBelowCostMarginPipeline(mockOrders);
  assert.equal(report.pipelineId, "BELOW_COST_MARGIN_DEFENSE");
  assert.equal(report.totalOrdersAudited, 4);
  assert.equal(report.belowCostCount, 2, "必須精準攔截 2 筆倒賠單");
  assert.equal(report.flaggedOrders[0].orderId, 103);
  assert.equal(report.flaggedOrders[0].marginShortfall, 56);
  assert.equal(report.flaggedOrders[1].orderId, 104);
  assert.equal(report.flaggedOrders[1].marginShortfall, 49);
});

test("【方向 B】4. 庫存急缺與夜間斷氣主動預警閉環檢驗", () => {
  // 正常充裕
  const safe = runStockDepletionEmergencyPipeline({
    stock: { qty50: 25, qty20: 80, qty16: 20, qty10: 15, qty4: 10 },
  });
  assert.equal(safe.status, "NORMAL");
  assert.equal(safe.recommendedOrderIntake.needCallTruck, false);

  // 臨期預警 (20kg < 30)
  const warning = runStockDepletionEmergencyPipeline({
    stock: { qty50: 15, qty20: 25, qty16: 10, qty10: 5, qty4: 5 },
  });
  assert.equal(warning.status, "WARNING");
  assert.equal(warning.recommendedOrderIntake.needCallTruck, true);

  // 告急斷氣 (20kg < 15)
  const critical = runStockDepletionEmergencyPipeline({
    stock: { qty50: 3, qty20: 8, qty16: 2, qty10: 2, qty4: 2 },
  });
  assert.equal(critical.status, "CRITICAL");
  assert.ok(critical.depletionAlert?.includes("紅色警戒"));
});

test("【方向 C】5. 業務 AI：餐飲大戶用量斷崖異常預警檢驗", () => {
  const mockCustomers = [
    { id: 1, name: "好吃熱炒店", address: "重新路二段", phone: "0911111111", daysDiff: 32, p20: 5 }, // 常態 12 天，現 32 天 (2.67x) ➔ 斷崖
    { id: 2, name: "知高飯小吃", address: "自強路一段", phone: "0922222222", daysDiff: 10, p20: 3 }, // 正常
    { id: 3, name: "張先生", address: "長安街", phone: "0933333333", daysDiff: 45 }, // 純住家忽略
  ];

  const report = detectCommercialConsumptionAnomalies(mockCustomers);
  assert.equal(report.totalCommercialAudited, 2);
  assert.equal(report.anomaliesCount, 1);
  assert.equal(report.items[0].customerId, 1);
  assert.equal(report.items[0].anomalyType, "POSSIBLE_COMPETITOR_POACHING");
});

test("【方向 C】6. 行政 AI：客戶座標與門牌標準化品質審計檢驗", () => {
  const mockCustomers = [
    { id: 1, name: "客1", address: "新北市三重區重新路四段53號", cleanAddress: "重新路四段53號", lat: 25.06, lng: 121.49, daysDiff: 10 },
    { id: 2, name: "客2", address: "台北市大安區信義路二段100號", cleanAddress: "信義路二段100號", daysDiff: 15 }, // 缺 lat/lng
  ];

  const report = auditCustomerCoordinateCompleteness(mockCustomers);
  assert.equal(report.totalCustomers, 2);
  assert.equal(report.withCoordinatesCount, 1);
  assert.equal(report.missingCoordinatesCount, 1);
  assert.equal(report.coordinateCompletenessRate, 50);
  assert.equal(report.cleanAddressRate, 100);
});

test("【方向 C & E】7. 客服 AI 安全稽核與題庫反哺草稿檢驗", () => {
  const report = auditCustomerServiceSafetyAndFaqGaps([
    "我家瓦斯好像在漏氣，聞到很濃的臭味！",
    "瓦斯桶淋雨會不會容易生鏽？",
  ]);

  assert.equal(report.leakUrgentTriggersCount, 1);
  assert.equal(report.zeroLeakCompliance, true);
  assert.equal(report.candidateFaqDrafts.length, 1);
  assert.equal(report.candidateFaqDrafts[0].extractedTopic, "瓦斯鋼瓶陽台防鏽與防曬規範");
});

test("【方向 D】8. 營運 AI：戰情調度台順路併單建議與殘氣折抵防呆檢驗", () => {
  const unassigned = [{ id: 901, address: "新北市三重區中正北路150號" }];
  const delivering = [{ id: 801, driver: "小龍", address: "新北市三重區中正北路22號" }];

  const advices = recommendRouteCoalescing(unassigned, delivering);
  assert.equal(advices.length, 1);
  assert.equal(advices[0].recommendedDriver, "小龍");
  assert.equal(advices[0].matchedStreet, "中正北路");
  assert.ok(advices[0].adviceLabel.includes("順路併單建議"));

  // 殘氣計算器 (Directive #3 官方進價 $22.63/kg)
  const calc = calculateResidualGasRefund(3.5);
  assert.equal(calc.ratePerKg, 22.63);
  assert.equal(calc.refundAmount, Math.round(3.5 * 22.63));
  assert.equal(calc.isLegalStandard, true);
});
