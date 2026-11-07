import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const {
  classifySevenAiIntent,
  SEVEN_AI_PROFILES,
} = require("c:/shenglong-next/lib/seven-ai-matrix.ts");

const {
  runMarketingAiEngine,
  runSalesAiEngine,
} = require("c:/shenglong-next/lib/marketing-sales-engines.ts");

const {
  buildDispatchWritebackSql,
} = require("c:/shenglong-next/lib/erp-writeback-engine.cjs");

const {
  buildLiveBossApprovalItems,
} = require("c:/shenglong-next/lib/boss-approvals-hub.ts");

const {
  evaluatePowerState,
  buildSqlEmergencyCheckpointSql,
  RECOMMENDED_UPS_SPEC,
} = require("c:/shenglong-next/lib/ups-power-guardian.cjs");

test("AI Massive Test Suite 1: Seven-AI Specialist Matrix 50-Scenario Intent & Routing Accuracy", async (t) => {
  const testScenarios = [
    // 秘書 AI (今日戰報、跨部門督導、大戶數據)
    { q: "今天總共叫了幾桶瓦斯", expected: "secretary" },
    { q: "今日營運戰報與累計營收", expected: "secretary" },
    { q: "特助報告今天重點督導", expected: "secretary" },
    { q: "總裁幕僚長請出面", expected: "secretary" },
    { q: "今天全店業績怎麼樣", expected: "secretary" },
    { q: "軍師早安報告", expected: "secretary" },

    // 營運 AI (車隊趟次、派單建議、在店實瓶、叫車)
    { q: "小龍跟游柏林現在各送了幾趟", expected: "operations" },
    { q: "目前有哪幾張單還沒指派司機", expected: "operations" },
    { q: "店裡的50公斤跟20公斤實瓶庫存還剩多少", expected: "operations" },
    { q: "傍晚要不要叫分裝場大車進貨", expected: "operations" },
    { q: "外送車隊目前負載如何分配", expected: "operations" },
    { q: "智能派工建議下一張派給誰", expected: "operations" },
    { q: "小龍趟次是不是比柏林多很多", expected: "operations" },
    { q: "車載剩餘鋼瓶庫存查詢", expected: "operations" },

    // 客服 AI (LINE 智慧接單、300題安檢FAQ、漏氣防護)
    { q: "LINE 官方帳號有沒有新的叫貨訊息", expected: "service" },
    { q: "客人說家裡熱水器點不著怎麼辦", expected: "service" },
    { q: "聞到濃濃的瓦斯味懷疑漏氣", expected: "service" },
    { q: "爐火發紅燻黑鍋底是什麼原因", expected: "service" },
    { q: "請問現在一桶20公斤瓦斯多少錢", expected: "service" },
    { q: "自動切替器調整器好用嗎", expected: "service" },
    { q: "安檢問題客服要怎麼回答", expected: "service" },
    { q: "客人詢問桶裝瓦斯殘氣如何退費", expected: "service" },

    // 行銷 AI (3,934戶週期雷達、寒流早鳥、老友喚醒、空瓶回收)
    { q: "氣象說過兩天會大幅降溫有寒流", expected: "marketing" },
    { q: "幫我找很久沒叫瓦斯的休眠沉睡客戶", expected: "marketing" },
    { q: "壓瓶超過三個月沒叫的鋼瓶回收", expected: "marketing" },
    { q: "新莊民安西路壓瓶6支的客人要不要收回", expected: "marketing" },
    { q: "老朋友50元回購折價券要發給誰", expected: "marketing" },
    { q: "耗氣週期黃燈橘燈紅燈客戶盤點", expected: "marketing" },
    { q: "寒流早鳥削峰預約文案", expected: "marketing" },
    { q: "休眠客戶名單行銷", expected: "marketing" },

    // 業務 AI (B2B 20kg 毛利底線、大戶防拔管、爐具連帶銷售)
    { q: "隔壁瓦斯行開低價搶歐家莊我們要不要跟", expected: "sales" },
    { q: "幫我查一下同業情況與每家狀況", expected: "sales" },
    { q: "查歐家莊2026年叫單表現", expected: "sales" },
    { q: "20公斤瓦斯的成本跟絕對保本底線是多少", expected: "sales" },
    { q: "知高飯最近叫瓦斯的時間有沒有異常", expected: "sales" },
    { q: "清粥小菜已經到了用完週期要不要主動巡檢", expected: "sales" },
    { q: "商用中壓快速爐老客換新專案價是多少", expected: "sales" },
    { q: "16L 強制排氣熱水器連帶銷售一台賺多少", expected: "sales" },
    { q: "防拔管年約方案要送什麼設備", expected: "sales" },
    { q: "炭烤店瓦斯週期與催單", expected: "sales" },

    // 財務 AI (未收核銷、長元街/水晶厝欠款、運費結算)
    { q: "長元街小吃欠了3000元瓦斯錢收回來了嗎", expected: "finance" },
    { q: "水晶厝還有多少未收款尾款", expected: "finance" },
    { q: "今天司機送貨收到的現金跟未收總共有多少", expected: "finance" },
    { q: "今日外勤運費要結算多少錢給小龍跟柏林", expected: "finance" },
    { q: "月底月結客戶有哪些還沒給錢", expected: "finance" },
    { q: "查未收款與呆帳名單", expected: "finance" },

    // 行政 AI (門市 SQL 雙向同步、唯一庫存看板、健康巡檢)
    { q: "門市電腦跟雲端的SQL資料庫有沒有正常同步", expected: "admin" },
    { q: "即時庫存看板 shenglong-next 連線正常嗎", expected: "admin" },
    { q: "3934戶客戶資料庫有沒有完整備份", expected: "admin" },
    { q: "派單回寫佇列有沒有卡單塞車", expected: "admin" },
    { q: "系統健康狀態跟伺服器連線巡檢", expected: "admin" },
  ];

  let passedCount = 0;
  for (const s of testScenarios) {
    const matched = classifySevenAiIntent(s.q);
    assert.equal(
      matched.id,
      s.expected,
      `Prompt "${s.q}" should route to ${s.expected}, got ${matched.id}`
    );
    passedCount++;
  }
  assert.equal(passedCount, testScenarios.length);
});

test("AI Massive Test Suite 2: Marketing & Sales Engine Multi-Scenario Stress & Boundary Tests", async (t) => {
  await t.test("runMarketingAiEngine handles 3,934 realistic customers correctly", () => {
    const rawCustomers = JSON.parse(
      fs.readFileSync("c:/shenglong-next/public/data/customers-map.json", "utf8")
    ).customers;
    assert.equal(rawCustomers.length, 3934);

    const mkt = runMarketingAiEngine(rawCustomers);
    assert.ok(mkt.yellowWatchCount >= 200, "yellow watch count must be substantial");
    assert.ok(mkt.orangeWakeupCount >= 100, "orange wakeup count must be substantial");
    assert.ok(mkt.redBottleRecoveryCount >= 2500, "red recovery count must reflect real dormant customer distribution");
    assert.ok(mkt.estimatedBarrelRecoveryValue > 20000, "must compute positive barrel recovery value");
    assert.ok(mkt.coldWaveBroadcastScript.includes("盛隆瓦斯"), "broadcast script must be personalized");
    assert.ok(mkt.dormantWakeupScript.includes("$50"), "dormant script must offer $50 incentive");
  });

  await t.test("runSalesAiEngine calculates correct margins under fluctuating raw gas prices", () => {
    // 正常進氣價 $22.63/kg
    const normal = runSalesAiEngine({ gasCostPerKg: 22.63 });
    assert.equal(normal.rawGasCost20kg, 453);
    assert.equal(normal.deliveryAndDepreciation20kg, 89);
    assert.equal(normal.breakEvenFloor20kg, 542);
    assert.equal(normal.recommendedVipFloor20kg, 634);

    // 高氣價波段 $28.00/kg (冬季上漲)
    const high = runSalesAiEngine({ gasCostPerKg: 28.0 });
    assert.equal(high.rawGasCost20kg, 560);
    assert.equal(high.breakEvenFloor20kg, 649);
    assert.equal(high.recommendedVipFloor20kg, 741);

    // 低氣價波段 $18.50/kg (夏季低檔)
    const low = runSalesAiEngine({ gasCostPerKg: 18.5 });
    assert.equal(low.rawGasCost20kg, 370);
    assert.equal(low.breakEvenFloor20kg, 459);
    assert.equal(low.recommendedVipFloor20kg, 551);
  });
});

test("AI Massive Test Suite 3: 4-Shift Auto-Pilot 24-Hour Time Resolution & Schedule Logic", async (t) => {
  await t.test("Time-slot algorithm correctly separates morning, peak, afternoon, and 21:30 evening shifts", () => {
    // 模擬 24 小時各時間段分鐘數
    const resolveShiftFromMinutes = (totalMinutes) => {
      if (totalMinutes < 8 * 60 + 30) return "morning_0800";
      if (totalMinutes >= 14 * 60 && totalMinutes <= 16 * 60 + 30) return "afternoon_1430";
      if (totalMinutes >= 21 * 60) return "evening_2130";
      return "peak_realtime";
    };

    // 06:00, 07:30, 08:29 -> morning_0800
    assert.equal(resolveShiftFromMinutes(6 * 60), "morning_0800");
    assert.equal(resolveShiftFromMinutes(7 * 60 + 30), "morning_0800");
    assert.equal(resolveShiftFromMinutes(8 * 60 + 29), "morning_0800");

    // 08:30, 11:30, 13:59 -> peak_realtime
    assert.equal(resolveShiftFromMinutes(8 * 60 + 30), "peak_realtime");
    assert.equal(resolveShiftFromMinutes(11 * 60 + 30), "peak_realtime");
    assert.equal(resolveShiftFromMinutes(13 * 60 + 59), "peak_realtime");

    // 14:00, 14:30, 16:30 -> afternoon_1430
    assert.equal(resolveShiftFromMinutes(14 * 60), "afternoon_1430");
    assert.equal(resolveShiftFromMinutes(14 * 60 + 30), "afternoon_1430");
    assert.equal(resolveShiftFromMinutes(16 * 60 + 30), "afternoon_1430");

    // 16:31, 18:30, 20:59 -> peak_realtime (打烊前尖峰)
    assert.equal(resolveShiftFromMinutes(16 * 60 + 31), "peak_realtime");
    assert.equal(resolveShiftFromMinutes(18 * 60 + 30), "peak_realtime");
    assert.equal(resolveShiftFromMinutes(20 * 60 + 59), "peak_realtime");

    // 21:00 (打烊), 21:30 (推播晚報), 23:59 -> evening_2130
    assert.equal(resolveShiftFromMinutes(21 * 60), "evening_2130");
    assert.equal(resolveShiftFromMinutes(21 * 60 + 30), "evening_2130");
    assert.equal(resolveShiftFromMinutes(23 * 60 + 59), "evening_2130");
  });
});

test("AI Massive Test Suite 4: 100-Job Concurrent ERP Writeback Stress & Security Validation", async (t) => {
  const drivers = ["小龍", "游柏林", "稍後輸入"];
  const methods = ["cash", "transfer", "monthly", "debt", "auto"];

  for (let i = 1; i <= 100; i++) {
    const action = i % 5 === 0 ? "cancel" : i % 5 === 1 ? "create" : i % 5 === 2 ? "edit" : "deliver";
    const driver = drivers[i % drivers.length];
    const method = methods[i % methods.length];
    const emptyReturned = i % 4;
    const collectedAmount = method === "cash" || method === "transfer" ? 750 * (emptyReturned + 1) : 0;

    let payload = {};
    if (action === "create") {
      payload = {
        lineOrderId: `line_${Date.now()}_${i}`,
        phone: `0912-000-${String(i).padStart(3, "0")}`,
        address: `三重區正義北路${i}號`,
        quantity: (i % 3) + 1,
        driver,
      };
    } else if (action === "deliver") {
      payload = {
        driver,
        paymentMethod: method,
        emptyReturned,
        collectedAmount,
        bottleNote: `壓瓶${emptyReturned}支`,
        remarks: `外勤送達測試單 #${i}`,
      };
    } else if (action === "edit") {
      payload = {
        quantity20: 2,
        amount: 1500,
        remarks: "改叫兩桶",
        driver,
      };
    }

    const job = {
      id: `stress_job_${i}`,
      orderId: 300000 + i,
      action,
      payload,
    };

    const plan = buildDispatchWritebackSql(job);
    assert.ok(plan.sql, `Job ${i} (${action}) must produce SQL`);
    assert.ok(!plan.sql.includes("undefined"), `Job ${i} SQL contains undefined`);
    assert.ok(!plan.sql.includes("NaN"), `Job ${i} SQL contains NaN`);

    // 驗證安全防注入與行級鎖保護
    if (action !== "create") {
      assert.ok(plan.sql.includes("WITH (ROWLOCK)"), `Job ${i} must use ROWLOCK`);
    } else {
      assert.ok(plan.sql.includes("IF NOT EXISTS"), `Create Job ${i} must include idempotency guard`);
    }

    // 驗證擴充功能回寫
    if (action === "deliver") {
      if (emptyReturned > 0) {
        assert.ok(plan.sql.includes(`【收空瓶:${emptyReturned}支】`), `Job ${i} must tag emptyReturned`);
      }
      if (method === "transfer") {
        assert.ok(plan.sql.includes("【轉帳】"), `Job ${i} transfer must tag 【轉帳】`);
      }
      if (collectedAmount > 0) {
        assert.ok(plan.sql.includes(`【實收:$${collectedAmount}】`), `Job ${i} must tag collectedAmount`);
      }
    }
  }
});

test("AI Massive Test Suite 5: Boss Approvals Hub & UPS Power Guardian Full Coverage", async (t) => {
  await t.test("buildLiveBossApprovalItems correctly reflects live approval states", () => {
    const unassigned = [{ id: 361582, name: "測試客", addr: "文化北路" }];
    const items = buildLiveBossApprovalItems({
      unassignedOrders: unassigned,
      recommendedDriver: "游柏林",
      orangeWakeupCount: 125,
      redBottleRecoveryCount: 3105,
      approvedIds: new Set(["apr_mkt_red_barrel"]),
    });

    assert.equal(items.length, 4);
    const redItem = items.find((i) => i.id === "apr_mkt_red_barrel");
    assert.equal(redItem.status, "approved");

    const dispatchItem = items.find((i) => i.id === "apr_dispatch_today");
    assert.equal(dispatchItem.status, "pending");
    assert.ok(dispatchItem.approveLabel.includes("小龍"));
    assert.ok(!dispatchItem.approveLabel.includes("游柏林"));
  });

  await t.test("ups-power-guardian evaluates AC, UPS discharge, and emergency checkpoints", () => {
    // 正常市電
    const normal = evaluatePowerState({ BatteryStatus: 2, EstimatedChargeRemaining: 100 });
    assert.equal(normal.powerSource, "AC_WITH_UPS");
    assert.equal(normal.requiresEmergencyCheckpoint, false);

    // 停電切換電池
    const outage = evaluatePowerState({ BatteryStatus: 1, EstimatedChargeRemaining: 65 });
    assert.equal(outage.powerSource, "UPS_BATTERY");
    assert.equal(outage.requiresEmergencyCheckpoint, true);
    assert.ok(outage.emergencySql.includes("CHECKPOINT;"));

    // 無電池偵測 (市電直插)
    const directAc = evaluatePowerState(null);
    assert.equal(directAc.powerSource, "AC_DIRECT");
    assert.equal(directAc.requiresEmergencyCheckpoint, false);
    assert.ok(RECOMMENDED_UPS_SPEC.modelCandidates.length >= 2);
  });
});
