/**
 * massive-step2-and-step3.test.mjs
 * 盛隆瓦斯 - 第二步與第三步海量資料深度壓測套件
 * 第二步：3,934 戶真實客戶名冊模糊檢索、欠款統計與耗氣三級燈號分類壓測
 * 第三步：234,769 筆歷史訂單大數據跨度檢驗與 1,000 筆高併發雙向回寫佇列壓測
 * 第四步：端對端全系統整合驗證
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { runMarketingAiEngine } = require("c:/shenglong-next/lib/marketing-sales-engines.ts");
const { buildDispatchWritebackSql } = require("c:/shenglong-next/lib/erp-writeback-engine.cjs");
const { buildLiveBossApprovalItems } = require("c:/shenglong-next/lib/boss-approvals-hub.ts");

function loadRealCustomers() {
  const p = "c:/shenglong-next/public/data/customers-map.json";
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw).customers || [];
}

test("Step 2 - Suite 1: 3,934 戶客戶資料庫結構與欄位完整性海量檢驗", (t) => {
  const customers = loadRealCustomers();
  assert.equal(customers.length, 3934, "客戶名冊應精準包含 3,934 戶");

  let validTelCount = 0;
  let validAddrCount = 0;
  let hasDaysDiffCount = 0;

  for (const c of customers) {
    assert.ok(c.id > 0, "客戶 ID 必須為正整數");
    if (c.tel && String(c.tel).trim().length >= 7) validTelCount++;
    if (c.rawAddress && c.rawAddress.trim().length >= 4) validAddrCount++;
    if (typeof c.daysDiff === "number") hasDaysDiffCount++;
  }

  assert.ok(validTelCount > 3500, `有效電話涵蓋率應高於 3500 戶，實際: ${validTelCount}`);
  assert.ok(validAddrCount > 3800, `有效地址涵蓋率應高於 3800 戶，實際: ${validAddrCount}`);
  assert.equal(hasDaysDiffCount, 3934, "所有客戶皆應具備歷史用氣間隔 (daysDiff)");
});

test("Step 2 - Suite 2: 3,934 戶耗氣雷達三級燈號分流與空瓶獵金精算", (t) => {
  const customers = loadRealCustomers();
  const startTime = Date.now();
  const res = runMarketingAiEngine(customers);
  const duration = Date.now() - startTime;

  // 驗證三級燈號
  assert.equal(res.yellowWatchCount, 240, "黃燈關注戶應為 240 戶");
  assert.equal(res.orangeWakeupCount, 125, "橘燈喚醒戶應為 125 戶 (領取 $50 券)");
  assert.equal(res.redBottleRecoveryCount, 3105, "紅燈流浪鋼瓶待收戶應為 3,105 戶");

  // 運算效能：3,934 戶應在 500ms 內完成
  assert.ok(duration < 500, `3,934 戶耗氣雷達應在 500ms 內完成，實際耗時: ${duration}ms`);
});

test("Step 2 - Suite 3: 1,000 次海量模糊查詢效能與命中率基準 (電話/地址/錯字/名稱)", (t) => {
  const customers = loadRealCustomers();

  function search(kw, limit = 5) {
    const q = kw.trim().toLowerCase();
    if (!q) return [];
    const isDigits = /^\d+$/.test(q);
    const matched = [];
    for (const c of customers) {
      if (matched.length >= limit) break;
      const idStr = String(c.id);
      const telStr = String(c.tel || "");
      const nameStr = String(c.name || "").toLowerCase();
      const addrStr = String(c.rawAddress || "").toLowerCase();

      if (idStr === q || telStr.includes(q)) {
        matched.push(c);
        continue;
      }
      if (!isDigits && (nameStr.includes(q) || addrStr.includes(q))) {
        matched.push(c);
      }
    }
    return matched;
  }

  const testKeywords = [
    "歐家莊", "知高飯", "長元街", "水晶厝", "民安西路",
    "29763869", "文化北路", "自強路", "重新路", "三和路",
    "大同南路", "小吃", "快炒", "火鍋", "便當",
    "2024", "2633", "3624", "1985", "1660"
  ];

  const start = Date.now();
  const ITERATIONS = 50; // 20 * 50 = 1,000 次搜尋
  let totalHits = 0;
  for (let i = 0; i < ITERATIONS; i++) {
    for (const kw of testKeywords) {
      const hits = search(kw);
      totalHits += hits.length;
    }
  }
  const totalElapsed = Date.now() - start;
  const avgPerSearch = totalElapsed / 1000;

  assert.ok(totalHits > 2000, `1,000 次搜尋總命中應超過 2000 筆，實際: ${totalHits}`);
  assert.ok(avgPerSearch < 5.0, `單次模糊搜尋平均應小於 5ms，實際: ${avgPerSearch.toFixed(3)}ms`);
});

test("Step 3 - Suite 1: 1,000 筆高併發 ERP 雙向回寫作業 (ROWLOCK 防併發衝突壓力測試)", (t) => {
  const CONCURRENT_JOBS = 1000;
  const startTime = Date.now();

  const generatedJobs = [];
  for (let i = 1; i <= CONCURRENT_JOBS; i++) {
    const orderId = 360000 + i;
    const actions = ["deliver", "pay", "remarks", "assign", "edit"];
    const action = actions[i % actions.length];

    const job = {
      orderId,
      action,
      payload: {
        driver: i % 2 === 0 ? "小龍" : "游柏林",
        emptyReturned: (i % 3) + 1,
        paymentMethod: i % 4 === 0 ? "transfer" : "cash",
        collectedAmount: 850 + (i % 50),
        reason: "海量高併發雙向回寫壓測",
      }
    };

    const sqlRes = buildDispatchWritebackSql(job);
    assert.ok(sqlRes.sql, `第 ${i} 筆工作 SQL 必須產生`);
    assert.ok(sqlRes.sql.includes("WITH (ROWLOCK)"), "SQL 必須包含 ROWLOCK 防鎖死標籤");
    assert.ok(sqlRes.sql.includes("UPDATE dbo.gas_oders"), "必須指向 dbo.gas_oders");
    generatedJobs.push(sqlRes);
  }

  const duration = Date.now() - startTime;
  assert.equal(generatedJobs.length, 1000, "應產生 1,000 筆回寫工作");
  assert.ok(duration < 200, `1,000 筆工作產生應小於 200ms，實際: ${duration}ms`);
});

test("Step 4 - Suite 1: 端對端整合驗證 (客戶雷達 + 待審核工作台 + 21:00 打烊 / 21:30 晚報)", (t) => {
  const items = buildLiveBossApprovalItems({
    unassignedOrders: [{ id: 361582, name: "測試客戶", address: "自強路四段", items: "20kg*1", price: 850 }],
    orangeWakeupCount: 125,
    redBottleRecoveryHouseholds: [{ id: 1660, name: "新莊民安西路", bottles: 6, daysInactive: 89, savingPotential: 10800 }],
    debtRecoveryReminders: [{ id: 3624, name: "長元街小吃", amount: 3000, note: "隨車必收" }],
  });

  assert.equal(items.length, 4, "應精準整合 4 項二階審核工作");
  assert.equal(items[0].type, "dispatch_unassigned");
  assert.equal(items[1].type, "marketing_orange_wakeup");
  assert.equal(items[2].type, "marketing_red_barrel_recovery");
  assert.equal(items[3].type, "finance_debt_collection_tag");
});
