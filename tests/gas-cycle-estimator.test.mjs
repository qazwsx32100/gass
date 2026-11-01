import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  estimateGasCycle,
  DEFAULT_SPEC_CYCLES,
  getSeasonalCycleDays,
} = require("c:/shenglong-next/lib/gas-cycle-estimator.ts");

test("Gas Cycle Estimator 1: 基礎規格與自訂歷史週期相容性", (t) => {
  // 1. 基本 20kg 預設
  const res20 = estimateGasCycle("20kg x 1 支", "2026/10/01", undefined, new Date("2026-11-01T00:00:00Z"));
  assert.ok(res20);
  assert.equal(res20.spec, "20kg");
  assert.ok(res20.daysElapsed >= 30, "已過天數計算正確");

  // 2. 客戶有自訂歷史平均 (例如知高飯 10 天叫一次)
  const resCustom = estimateGasCycle("20kg", "2026/10/25", 10, new Date("2026-11-01T00:00:00Z"));
  assert.ok(resCustom);
  assert.equal(resCustom.estimatedCycleDays, 10, "優先採用客戶歷史平均週期");
  assert.equal(resCustom.daysRemaining, 3, "剩餘天數計算正確");

  // 3. 首次客戶或無日期回傳 null
  assert.equal(estimateGasCycle("20kg", "首次叫瓦斯"), null);
  assert.equal(estimateGasCycle("", "2026/10/01"), null);
});

test("Gas Cycle Estimator 2: 真實資料庫 52 天季節自適應動態週期 (冬短夏長)", (t) => {
  // 1. 冬季 1 月 (寒流密集洗熱水澡，20kg 約 35 天)
  const winterDate = new Date("2026-01-15T00:00:00+08:00");
  const winterCycle = getSeasonalCycleDays("20kg", 1);
  assert.ok(winterCycle >= 30 && winterCycle <= 38, `冬季 20kg 週期應在 30~38 天，實際: ${winterCycle}`);

  // 2. 夏季 7 月 (天氣炎熱少洗熱水，20kg 約 65 天)
  const summerDate = new Date("2026-07-15T00:00:00+08:00");
  const summerCycle = getSeasonalCycleDays("20kg", 7);
  assert.ok(summerCycle >= 60 && summerCycle <= 70, `夏季 20kg 週期應在 60~70 天，實際: ${summerCycle}`);

  // 3. 春秋 4 月 / 10 月 (常態過渡期，約 45~50 天)
  const springCycle = getSeasonalCycleDays("20kg", 4);
  assert.ok(springCycle >= 45 && springCycle <= 52, `春秋 20kg 週期應在 45~52 天，實際: ${springCycle}`);

  // 4. 全年 12 個月加權平均應吻合資料庫 52 天中位數 (誤差 <= 2 天)
  let yearTotalDays = 0;
  for (let m = 1; m <= 12; m++) {
    yearTotalDays += getSeasonalCycleDays("20kg", m);
  }
  const yearAvg = Math.round(yearTotalDays / 12);
  assert.ok(yearAvg >= 50 && yearAvg <= 53, `全年平均應吻合真實資料庫 50~53 天，實際: ${yearAvg}`);
});

test("Gas Cycle Estimator 3: 雙桶戶 (一次叫2支) 週期加權防禦", (t) => {
  // 一次叫 2 支 20kg
  const doubleBottle = estimateGasCycle(
    "20kg x 2 支",
    "2026/09/01",
    undefined,
    new Date("2026-10-15T00:00:00+08:00")
  );
  assert.ok(doubleBottle);
  assert.equal(doubleBottle.isDoubleBottle, true, "應精準識別為雙桶戶");
  assert.ok(doubleBottle.estimatedCycleDays >= 80, `雙桶戶預估週期應大幅延長 (約 80~100 天)，實際: ${doubleBottle.estimatedCycleDays}`);
});

test("Gas Cycle Estimator 4: 狀態層級 (overdue / warning / normal) 與急迫性提示", (t) => {
  // 1. 已超期 (overdue)
  const overdue = estimateGasCycle("20kg", "2026/01/01", 30, new Date("2026-03-01T00:00:00Z"));
  assert.ok(overdue);
  assert.equal(overdue.urgencyLevel, "overdue");
  assert.ok(overdue.urgencyText.includes("🚨"));

  // 2. 警戒期 (warning - 4 天內即將見底)
  const warning = estimateGasCycle("20kg", "2026-10-01", 30, new Date("2026-10-28T00:00:00Z"));
  assert.ok(warning);
  assert.equal(warning.urgencyLevel, "warning");
  assert.ok(warning.urgencyText.includes("⚠️"));

  // 3. 正常充裕期 (normal)
  const normal = estimateGasCycle("20kg", "2026-10-25", 30, new Date("2026-10-28T00:00:00Z"));
  assert.ok(normal);
  assert.equal(normal.urgencyLevel, "normal");
});
