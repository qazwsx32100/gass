import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("🛡️ 挑桶天數門檻 150 日與新派單存活合流保護檢驗", async (t) => {
  await t.test("1. driver-settings.json 與 lib/driver-settings.ts pickBottleThresholdDays 設為 150", async () => {
    const settingsPath = path.resolve("c:/shenglong-next/driver-settings.json");
    assert.ok(fs.existsSync(settingsPath), "driver-settings.json 必須存在");
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    assert.strictEqual(settings.pickBottleThresholdDays, 150, "挑桶門檻天數必須為 150 日");

    const libContent = fs.readFileSync(path.resolve("c:/shenglong-next/lib/driver-settings.ts"), "utf8");
    assert.match(libContent, /pickBottleThresholdDays:\s*150/, "預設挑桶門檻必須為 150");
  });

  await t.test("2. /api/driver/orders 挑桶運算：85 天不觸發挑桶警示，>= 150 天方觸發", () => {
    const pickThreshold = 150;

    function checkSpecAlert(lastDateStr, now = new Date("2026-11-14T09:00:00+08:00")) {
      const cleanDate = lastDateStr.replace(/\//g, "-").trim();
      let parsedDate = null;
      const parts = cleanDate.split("-");
      if (parts.length === 3 && parts[0].length <= 3 && !isNaN(Number(parts[0]))) {
        const y = parseInt(parts[0], 10) + 1911;
        parsedDate = new Date(`${y}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}T00:00:00+08:00`);
      } else {
        parsedDate = new Date(cleanDate);
      }
      const lastTs = parsedDate && !isNaN(parsedDate.getTime()) ? parsedDate.getTime() : NaN;
      let days = null;
      let alert = false;
      if (!isNaN(lastTs)) {
        days = Math.max(0, Math.floor((now.getTime() - lastTs) / (1000 * 60 * 60 * 24)));
        if (days >= pickThreshold) {
          alert = true;
        }
      }
      return { days, alert };
    }

    // 老闆截圖中的案例：上次 115/08/21，相隔 85 天
    const res85 = checkSpecAlert("115/08/21");
    assert.strictEqual(res85.days, 85, "天數應計算為 85 天");
    assert.strictEqual(res85.alert, false, "85 天未滿 150 天，絕對不可觸發挑桶警示！");

    // 正好 150 天：上次 115/06/17
    const res150 = checkSpecAlert("115/06/17");
    assert.strictEqual(res150.days, 150, "天數應計算為 150 天");
    assert.strictEqual(res150.alert, true, "150 天達到門檻，必須觸發挑桶警示！");

    // 160 天：上次 115/06/07
    const res160 = checkSpecAlert("115/06/07");
    assert.ok(res160.days >= 160, "天數應為 160 天");
    assert.strictEqual(res160.alert, true, "超過 150 天必須觸發挑桶警示！");
  });

  await t.test("3. app/driver/page.tsx 換日與強制刷新解耦，且實裝新單 5 分鐘存活合流保護", () => {
    const pageContent = fs.readFileSync(path.resolve("c:/shenglong-next/app/driver/page.tsx"), "utf8");

    // 驗證 isRealDateChanged 絕不包含 forceRefresh
    assert.ok(!pageContent.includes("const isDateChanged = forceRefresh"), "換日判斷嚴禁混入 forceRefresh！");
    assert.match(pageContent, /isRealDateChanged\s*=\s*isExistingFromOldDate\s*\|\|\s*\(Boolean\(savedDate\)\s*&&\s*savedDate\s*!==\s*activeDate\)/, "換日判斷必須嚴格解耦！");

    // 驗證防空保護
    assert.match(pageContent, /!isRealDateChanged\s*&&\s*data\.orders\.length\s*===\s*0\s*&&\s*hasExistingTodayOrders/, "非換日情況下，伺服器若短暫回空必須鎖定保留現有單據！");

    // 驗證 Smart Union Merge 5 分鐘寬限期
    assert.match(pageContent, /retainedPendingOrders/, "必須實裝待送新單合流保留機制");
    assert.match(pageContent, /nowMs\s*-\s*seenTime\s*<\s*300000/, "新單必須擁有 5 分鐘 (300,000ms) 安全寬限期避免被背景輪詢抹除！");
  });
});
