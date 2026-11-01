import test from "node:test";
import assert from "node:assert/strict";

// 模擬雙向歷史斷層檢測與打烊封存核心邏輯測試
function detectHistoryGap(lastHistoryDateStr, currentDateStr = "2026/11/01") {
  if (!lastHistoryDateStr) {
    return { hasGap: true, gapDays: -1, warning: "完全無歷史備援資料" };
  }
  const lastD = new Date(lastHistoryDateStr.replace(/-/g, "/"));
  const currD = new Date(currentDateStr.replace(/-/g, "/"));
  const diffDays = Math.round((currD.getTime() - lastD.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays > 1) {
    return {
      hasGap: true,
      gapDays: diffDays,
      warning: `⚠️ 偵測到歷史資料庫中斷斷層！最新歷史僅到 ${lastHistoryDateStr}，落後 ${diffDays} 天！`,
    };
  }
  return { hasGap: false, gapDays: diffDays, warning: null };
}

function calculateCustomDateRangeEarnings(orders, startDate, endDate, driver = "小龍") {
  const rate50 = 140;
  const rateOther = 70;

  const filtered = orders.filter((o) => {
    if (o.disable === "Y" || o.disabled === true) return false;
    const d = String(o.date || "").replace(/-/g, "/");
    const drv = (o.driver || "").trim();
    return d >= startDate && d <= endDate && (!driver || drv === driver);
  });

  let total50 = 0;
  let totalOther = 0;
  let totalBottles = 0;

  for (const o of filtered) {
    const b50 = Number(o.b50) || 0;
    const b20 = Number(o.b20) || 0;
    const b16 = Number(o.b16) || 0;
    const b10 = Number(o.b10) || 0;
    const b4 = Number(o.b4) || 0;
    const other = b20 + b16 + b10 + b4;

    total50 += b50;
    totalOther += other;
    totalBottles += (b50 + other);
  }

  const earnings = total50 * rate50 + totalOther * rateOther;
  return {
    orderCount: filtered.length,
    totalBottles,
    b50: total50,
    bOther: totalOther,
    earnings,
  };
}

// 模擬打烊 7 日連續性健康巡檢
function checkSevenDaysIntegrity(storeDailyCounts, cloudDailyCounts) {
  const discrepancies = [];
  for (const [date, storeCount] of Object.entries(storeDailyCounts)) {
    const cloudCount = cloudDailyCounts[date] || 0;
    if (storeCount !== cloudCount) {
      discrepancies.push({
        date,
        storeCount,
        cloudCount,
        gap: storeCount - cloudCount,
      });
    }
  }
  return {
    isHealthy: discrepancies.length === 0,
    discrepancies,
  };
}

test("1. 歷史跨日斷層檢測器 (Gap Detector)：成功偵測 10/29 停滯與 10/30~10/31 漏更", () => {
  // 過去在 11/01 時，雲端歷史庫只停在 10/29
  const checkOld = detectHistoryGap("2026/10/29", "2026/11/01");
  assert.equal(checkOld.hasGap, true);
  assert.equal(checkOld.gapDays, 3);
  assert.match(checkOld.warning, /偵測到歷史資料庫中斷斷層/);

  // 補齊至 10/31 或 11/01 時，斷層排除
  const checkRepaired = detectHistoryGap("2026/10/31", "2026/11/01");
  assert.equal(checkRepaired.hasGap, false);
  assert.equal(checkRepaired.gapDays, 1);
  assert.equal(checkRepaired.warning, null);
});

test("2. 自訂日期區間運費計算器：精確過濾 10/22 ~ 10/31 小龍支數與外送費", () => {
  const sampleOrders = [
    { id: 1, date: "2026/10/21", driver: "小龍", b50: 1, b20: 1 }, // 區間外（不計）
    { id: 2, date: "2026/10/22", driver: "小龍", b50: 1, b20: 2 }, // 1支50, 2支20
    { id: 3, date: "2026/10/30", driver: "小龍", b50: 0, b20: 5 }, // 5支20
    { id: 4, date: "2026/10/31", driver: "小龍", b50: 2, b20: 3 }, // 2支50, 3支20
    { id: 5, date: "2026/11/01", driver: "小龍", b50: 0, b20: 2 }, // 區間外（不計）
    { id: 6, date: "2026/10/30", driver: "游柏林", b50: 1, b20: 1 }, // 非小龍（不計）
  ];

  const result = calculateCustomDateRangeEarnings(sampleOrders, "2026/10/22", "2026/10/31", "小龍");
  assert.equal(result.orderCount, 3); // 訂單 2, 3, 4
  assert.equal(result.b50, 3); // 1 + 0 + 2 = 3 支 50kg
  assert.equal(result.bOther, 10); // 2 + 5 + 3 = 10 支其它
  assert.equal(result.totalBottles, 13);
  // 運費 = 3 * 140 (420) + 10 * 70 (700) = 1120
  assert.equal(result.earnings, 1120);
});

test("3. 打烊 7 日健康巡檢器：精確比對門市與雲端支數並捕捉遺漏日期", () => {
  const storeCounts = {
    "2026/10/28": 30,
    "2026/10/29": 28,
    "2026/10/30": 50,
    "2026/10/31": 48,
    "2026/11/01": 8,
  };

  // 模擬雲端遺漏了 10/30 與 10/31
  const cloudMissing = {
    "2026/10/28": 30,
    "2026/10/29": 28,
    "2026/10/30": 0,
    "2026/10/31": 0,
    "2026/11/01": 8,
  };

  const checkFail = checkSevenDaysIntegrity(storeCounts, cloudMissing);
  assert.equal(checkFail.isHealthy, false);
  assert.equal(checkFail.discrepancies.length, 2);
  assert.equal(checkFail.discrepancies[0].date, "2026/10/30");
  assert.equal(checkFail.discrepancies[0].gap, 50);

  // 模擬修復補齊後
  const cloudRepaired = { ...storeCounts };
  const checkSuccess = checkSevenDaysIntegrity(storeCounts, cloudRepaired);
  assert.equal(checkSuccess.isHealthy, true);
  assert.equal(checkSuccess.discrepancies.length, 0);
});
