/**
 * 📊 盛隆瓦斯 財務日結、運費重算與雙向斷層巡檢稽核模組
 * (ShengLong Gas Financial Gap Auditor & Commission Reconciler)
 */

export function detectHistoryGap(lastHistoryDateStr, currentDateStr = "2026/11/01") {
  if (!lastHistoryDateStr) {
    return { hasGap: true, gapDays: -1, warning: "完全無歷史備援資料" };
  }
  const lastD = new Date(String(lastHistoryDateStr).replace(/-/g, "/"));
  const currD = new Date(String(currentDateStr).replace(/-/g, "/"));
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

export function calculateCustomDateRangeEarnings(orders = [], startDate, endDate, driver = "小龍") {
  const rate50 = 140;
  const rateOther = 70;

  const filtered = (orders || []).filter((o) => {
    if (o.disable === "Y" || o.disabled === true) return false;
    const d = String(o.date || "").replace(/-/g, "/");
    const drv = (o.driver || "").trim();
    return d >= startDate && d <= endDate && (!driver || drv === driver);
  });

  let total50 = 0;
  let totalOther = 0;
  let totalBottles = 0;

  for (const o of filtered) {
    const b50 = Number(o.b50 || o.raw50) || 0;
    const b20 = Number(o.b20 || o.raw20) || 0;
    const b16 = Number(o.b16 || o.raw16) || 0;
    const b10 = Number(o.b10 || o.raw10) || 0;
    const b4 = Number(o.b4 || o.raw4) || 0;
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

export function checkSevenDaysIntegrity(storeDailyCounts = {}, cloudDailyCounts = {}) {
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
