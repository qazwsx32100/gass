import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { BOSS_SIX_PILLARS_KEYBOARD } from "../api/_telegram.js";
import { extractOrderEntities, buildLinePendingOrderPayload } from "../api/line-webhook.js";

const require = createRequire(import.meta.url);
const { buildDispatchWritebackSql } = require("c:/shenglong-next/lib/erp-writeback-engine.cjs");

test("Step 1: Bi-directional writeback queue & overlay architecture", async (t) => {
  await t.test("dispatch-queue.ts supports full bi-directional actions and optimistic overlay", () => {
    const queueSrc = fs.readFileSync("c:/shenglong-next/lib/dispatch-queue.ts", "utf8");
    assert.ok(queueSrc.includes('"deliver"'), "must support deliver action");
    assert.ok(queueSrc.includes('"pay"'), "must support pay action");
    assert.ok(queueSrc.includes('"remarks"'), "must support remarks action");
    assert.ok(queueSrc.includes("enqueueBatchDispatches"), "must export enqueueBatchDispatches");
    assert.ok(queueSrc.includes("applyPendingDispatchesOverlay"), "must export applyPendingDispatchesOverlay");
  });

  await t.test("driver orders status route syncs today_orders KV and enqueues writeback jobs", () => {
    const statusRouteSrc = fs.readFileSync(
      "c:/shenglong-next/app/api/driver/orders/status/route.ts",
      "utf8"
    );
    assert.ok(
      statusRouteSrc.includes("enqueueBatchDispatches(numericOrderIds, assignDriverName, true)"),
      "batch_assign must enqueue batch dispatches for SQL writeback"
    );
    assert.ok(
      statusRouteSrc.includes('enqueueOrderAction("deliver", numOrderId'),
      "finish/deliver must enqueue deliver action for SQL writeback"
    );
    assert.ok(
      statusRouteSrc.includes('enqueueOrderAction("accept", numOrderId'),
      "accept must enqueue accept action for SQL writeback"
    );
    assert.ok(
      statusRouteSrc.includes('enqueueOrderAction("cancel", numOrderId'),
      "cancel must enqueue cancel action for SQL writeback"
    );
  });

  await t.test("today-orders route applies pending dispatches overlay to prevent 1.5s status flicker", () => {
    const todayOrdersSrc = fs.readFileSync(
      "c:/shenglong-next/app/api/today-orders/route.ts",
      "utf8"
    );
    assert.ok(
      todayOrdersSrc.includes("applyPendingDispatchesOverlay(payload.orders, pendingDispatches)"),
      "POST /api/today-orders must overlay pending dispatches before caching"
    );
  });

  await t.test("sync-stock.cjs handleCloudDispatches executes SQL writeback for deliver, pay, remarks, assign, edit, cancel", () => {
    const syncStockSrc = fs.readFileSync("c:/shenglong-next/sync-stock.cjs", "utf8");
    assert.ok(
      syncStockSrc.includes('if (job.action === "deliver" || job.action === "pay")'),
      "sync-stock.cjs must handle deliver and pay writeback actions"
    );
    assert.ok(
      syncStockSrc.includes('if (job.action === "remarks")'),
      "sync-stock.cjs must handle remarks writeback action"
    );
    assert.ok(
      syncStockSrc.includes("const isSelfAcceptOnly = job.action === \"accept\" || job.force === false;"),
      "sync-stock.cjs must allow admin reassignment when force !== false"
    );
  });
});

test("Step 2: Mobile-First 3-Stage Bottom Sheet AI Copilot & Zero-Typing Quick Action Chips", async (t) => {
  await t.test("AiAdvisorDrawer implements 3-stage bottom sheet (collapsed, half, full) and 8 quick chips", () => {
    const drawerSrc = fs.readFileSync("c:/shenglong-next/app/components/AiAdvisorDrawer.tsx", "utf8");
    assert.ok(
      drawerSrc.includes('"collapsed" | "half" | "full"'),
      "must implement 3-stage bottom sheet state"
    );
    assert.ok(
      drawerSrc.includes("QUICK_AI_CHIPS"),
      "must provide thumb-friendly zero-typing quick action chips"
    );
    assert.ok(
      drawerSrc.includes("handleActionableBatchAssign"),
      "must support 1-tap actionable batch dispatch inside AI messages"
    );
    assert.ok(
      drawerSrc.includes("m.activeAgent"),
      "must display active 7-AI specialist badge on AI message bubbles"
    );
  });

  await t.test("advisor API route fetches live stock and today_orders telemetry", () => {
    const advisorRouteSrc = fs.readFileSync("c:/shenglong-next/app/api/ai/advisor/route.ts", "utf8");
    assert.ok(
      advisorRouteSrc.includes("getLiveTodayOrdersAsync"),
      "advisor API must read live today_orders"
    );
    assert.ok(
      advisorRouteSrc.includes("unassignedOrderIds"),
      "advisor API must return unassignedOrderIds for actionable dispatch cards"
    );
    assert.ok(
      advisorRouteSrc.includes("classifySevenAiIntent"),
      "advisor API must route queries through the 7-AI matrix"
    );
  });

  await t.test("operations page mounts AiAdvisorDrawer and provides 1-tap card writeback actions", () => {
    const opsSrc = fs.readFileSync("c:/shenglong-next/app/operations/page.tsx", "utf8");
    assert.ok(
      opsSrc.includes("<AiAdvisorDrawer"),
      "operations page must mount AiAdvisorDrawer"
    );
    assert.ok(
      opsSrc.includes("handleQuickOrderAction"),
      "operations page must support 1-tap quick assign and finish writeback on order cards"
    );
  });
});

test("Step 3: Telegram 6-Pillar Zero-Typing Persistent Keyboard & 1-Tap Dispatch Loop", async (t) => {
  await t.test("BOSS_SIX_PILLARS_KEYBOARD provides 3x2 thumb-friendly grid across Telegram bots", () => {
    assert.ok(Array.isArray(BOSS_SIX_PILLARS_KEYBOARD.keyboard), "must define keyboard array");
    assert.equal(BOSS_SIX_PILLARS_KEYBOARD.keyboard.length, 3, "must have 3 rows of 2 buttons");
    const flatButtons = BOSS_SIX_PILLARS_KEYBOARD.keyboard.flat().map((b) => b.text || b);
    assert.deepEqual(flatButtons, [
      "📊 今日戰報",
      "🚛 司機與庫存現況",
      "🎯 業務催單與防拔管",
      "❄️ 寒流與行銷喚醒",
      "💰 財務未收與欠款",
      "🚨 異常預警與健檢",
    ]);
  });

  await t.test("advisor-bot.cjs supports 6-pillar keyboard and 1-tap Telegram batch dispatch to ERP", () => {
    const advisorBotSrc = fs.readFileSync("c:/shenglong-next/advisor-bot.cjs", "utf8");
    assert.ok(advisorBotSrc.includes("📊 今日戰報"), "must include 今日戰報 button");
    assert.ok(advisorBotSrc.includes("🚛 司機與庫存現況"), "must include 司機與庫存現況 button");
    assert.ok(advisorBotSrc.includes("enqueueTelegramBatchAssign"), "must support 1-tap Telegram batch assign");
    assert.ok(advisorBotSrc.includes("cmd_assign_all_"), "must handle inline callback for 1-tap batch assign");
  });
});

test("Step 4: Seven-AI Specialist Matrix Routing Engine", async (t) => {
  await t.test("seven-ai-matrix.ts defines all 7 specialist AI profiles and intent router", () => {
    const matrixSrc = fs.readFileSync("c:/shenglong-next/lib/seven-ai-matrix.ts", "utf8");
    for (const id of ["secretary", "operations", "service", "marketing", "sales", "finance", "admin"]) {
      assert.ok(matrixSrc.includes(`${id}:`), `must define ${id} AI profile`);
    }
    assert.ok(matrixSrc.includes("export function classifySevenAiIntent"), "must export classifySevenAiIntent");
  });
});

test("Step 5: Isolated ERP Writeback SQL Engine (erp-writeback-engine.cjs)", async (t) => {
  await t.test("buildDispatchWritebackSql compiles safe parameterized SQL for all bi-directional actions", () => {
    const deliverPlan = buildDispatchWritebackSql({
      id: "job-1",
      orderId: 583920,
      action: "deliver",
      payload: {
        paymentMethod: "cash",
        driver: "小龍",
        deliveredAt: "14:35",
        bottleNote: "收空瓶1",
      },
    });
    assert.equal(deliverPlan.logPrefix, "DELIVER");
    assert.ok(deliverPlan.sql.includes("payed = 'Y', pay_way = 'C'"));
    assert.ok(deliverPlan.sql.includes("de_time = '14:35'"));
    assert.ok(deliverPlan.sql.includes("deliver = N'小龍'"));

    const assignPlan = buildDispatchWritebackSql({
      id: "job-2",
      orderId: 583921,
      action: "assign",
      driverName: "游柏林",
      force: true,
    });
    assert.equal(assignPlan.logPrefix, "ASSIGN");
    assert.ok(assignPlan.sql.includes("SET deliver = N'游柏林'"));
    assert.ok(assignPlan.sql.includes("AND (disable IS NULL OR disable = 'N')"));

    const cancelPlan = buildDispatchWritebackSql({
      id: "job-3",
      orderId: 583922,
      action: "cancel",
    });
    assert.equal(cancelPlan.logPrefix, "CANCEL");
    assert.ok(cancelPlan.sql.includes("SET disable = 'Y'"));
  });
});

test("Step 6: LINE AI Smart Order Extraction -> Operations Pending Queue Loop", async (t) => {
  await t.test("extractOrderEntities + buildLinePendingOrderPayload produces complete pending order payload", () => {
    const extracted = extractOrderEntities(
      [{ role: "user", content: "我要叫一桶20公斤瓦斯，電話0912-345-678" }],
      "送到三重區文化北路83號3樓有電梯"
    );
    assert.equal(extracted.isComplete, true);
    const payload = buildLinePendingOrderPayload(extracted, "送到三重區文化北路83號3樓有電梯", "U123456");
    assert.ok(payload, "must generate pending order payload");
    assert.equal(payload.action, "capture");
    assert.equal(payload.phone, "0912-345-678");
    assert.ok(payload.address.includes("文化北路83號"));
    assert.equal(payload.quantity, 1);
  });

  await t.test("shenglong-next /api/line-orders/pending route supports capture, approve, and dismiss", () => {
    const pendingRouteSrc = fs.readFileSync(
      "c:/shenglong-next/app/api/line-orders/pending/route.ts",
      "utf8"
    );
    assert.ok(pendingRouteSrc.includes("line_pending_orders_v1"), "must persist to line_pending_orders_v1");
    assert.ok(pendingRouteSrc.includes('action === "approve"'), "must support 1-tap order approval");
  });
});

test("Boss Acceptance Upgrades: Mobile War Room, Unified Stock URL, Telegram Cloud Webhook & 7-AI Switcher", async (t) => {
  await t.test("1. Mobile Monitoring Center (/operations) displays AI War Room & TV Wallboard buttons on mobile", () => {
    const opsSrc = fs.readFileSync("c:/shenglong-next/app/operations/page.tsx", "utf8");
    assert.ok(opsSrc.includes('isAppExperience ? "AI戰情室" : "七大AI戰情室"'), "mobile header must show AI戰情室");
    assert.ok(opsSrc.includes('isAppExperience ? "戰情室" : "戰情大螢幕"'), "mobile header must show 戰情室");
    assert.ok(opsSrc.includes("<span>AI戰情室</span>"), "mobile bottom bar must include AI戰情室 tab");
  });

  await t.test("2. Stock API sync and public links point exclusively to https://shenglong-next.vercel.app/gas-stock", () => {
    const syncSrc = fs.readFileSync("c:/shenglong-next/sync-stock.cjs", "utf8");
    assert.ok(
      syncSrc.includes('const VERCEL_SYNC_URLS = [\n  "https://shenglong-next.vercel.app/api/gas-stock",\n];'),
      "sync-stock.cjs VERCEL_SYNC_URLS must only transmit to shenglong-next.vercel.app/api/gas-stock"
    );
    assert.ok(
      syncSrc.includes('const PUBLIC_STOCK_URL = "https://shenglong-next.vercel.app/gas-stock";'),
      "PUBLIC_STOCK_URL must be https://shenglong-next.vercel.app/gas-stock"
    );

    const stockPageSrc = fs.readFileSync("c:/shenglong-next/app/gas-stock/page.tsx", "utf8");
    assert.ok(
      stockPageSrc.includes("🔗 外部看板：https://shenglong-next.vercel.app/gas-stock"),
      "gas-stock page report link must use https://shenglong-next.vercel.app/gas-stock"
    );
  });

  await t.test("3. Telegram Executive War Room (@shenlong_advisor_bot) 24/7 Cloud Webhook route is ready", () => {
    const tgAdvisorSrc = fs.readFileSync("c:/shenglong-next/app/api/telegram/advisor/route.ts", "utf8");
    assert.ok(tgAdvisorSrc.includes('const BOSS_TELEGRAM_ID = "8862712587"'), "must lock to Boss ID 8862712587");
    assert.ok(tgAdvisorSrc.includes("@shenlong_advisor_bot"), "must reference @shenlong_advisor_bot");
  });

  await t.test("4. 7-AI Direct Switcher allows 1-tap summoning of all 7 specialist AIs", () => {
    const drawerSrc = fs.readFileSync("c:/shenglong-next/app/components/AiAdvisorDrawer.tsx", "utf8");
    assert.ok(drawerSrc.includes("const SEVEN_AI_AGENTS = ["), "must define SEVEN_AI_AGENTS switcher");
    assert.ok(drawerSrc.includes("const AGENT_CHIPS_MAP"), "must define specialized chips for each of the 7 AIs");
    assert.ok(drawerSrc.includes("點名調動七大 AI"), "must render 7-AI Direct Switcher bar");
  });
});

test("Stage 2 & 3 Deep-Water Engines: Idempotent LINE Order ERP Insert, Marketing/Sales AI Engines, and Micro-Daemons", async (t) => {
  await t.test("1. erp-writeback-engine.cjs compiles idempotent INSERT INTO dbo.gas_oders for approved LINE orders", () => {
    const createPlan = buildDispatchWritebackSql({
      id: "job-line-1",
      orderId: 991234,
      action: "create",
      payload: {
        lineOrderId: "line_1761955000_ab12",
        phone: "0912-345-678",
        address: "三重區文化北路83號",
        floor: "3樓",
        spec: "20kg",
        quantity: 2,
        driver: "小龍",
      },
    });
    assert.equal(createPlan.logPrefix, "CREATE_LINE_ORDER");
    assert.ok(createPlan.sql.includes("INSERT INTO dbo.gas_oders"), "must compile INSERT INTO dbo.gas_oders");
    assert.ok(createPlan.sql.includes("IF NOT EXISTS"), "must include idempotency guard");
    assert.ok(createPlan.sql.includes("N'小龍'"), "must assign driver on creation");

    const legacyHold = buildDispatchWritebackSql({
      id: "job-legacy-create",
      orderId: 100,
      action: "create",
      payload: {},
    });
    assert.equal(legacyHold.logPrefix, "HOLD_CREATE");
    assert.equal(legacyHold.skipAck, true);
  });

  await t.test("2. marketing-sales-engines.ts provides 3-tier retention radar and B2B margin floor calculator", () => {
    const engineSrc = fs.readFileSync("c:/shenglong-next/lib/marketing-sales-engines.ts", "utf8");
    assert.ok(engineSrc.includes("export function runMarketingAiEngine"), "must export runMarketingAiEngine");
    assert.ok(engineSrc.includes("export function runSalesAiEngine"), "must export runSalesAiEngine");
    assert.ok(engineSrc.includes("breakEvenFloor20kg"), "must compute 20kg break-even floor price");
    assert.ok(engineSrc.includes("stoveCrossSellPackages"), "must include stove and water heater cross-sell packages");
  });

  await t.test("3. micro-daemons-manager.cjs defines 3 isolated daemons and 10s rollback guarantee", () => {
    const req = createRequire(import.meta.url);
    const { getMicroDaemonsTopology, buildRollbackPlan } = req("c:/shenglong-next/lib/micro-daemons-manager.cjs");
    const topo = getMicroDaemonsTopology();
    assert.equal(topo.daemons.length, 3);
    assert.equal(topo.rollbackGuaranteeSeconds, 10);
    assert.equal(topo.primaryStockApiTarget, "https://shenglong-next.vercel.app/api/gas-stock");
    const plan = buildRollbackPlan("verification");
    assert.equal(plan.targetRtoSeconds, 10);
  });
});

test("Seven-AI Joint Dry-Run Sandbox Engine & Dual-Track Sync (Telegram + Mobile Web War Room)", async (t) => {
  await t.test("1. seven-ai-dryrun-engine.ts orchestrates all 7 AIs in read-only DRY_RUN_SANDBOX mode", () => {
    const dryRunSrc = fs.readFileSync("c:/shenglong-next/lib/seven-ai-dryrun-engine.ts", "utf8");
    assert.ok(dryRunSrc.includes("export function runSevenAiJointDryRun"), "must export runSevenAiJointDryRun");
    assert.ok(dryRunSrc.includes('mode: "DRY_RUN_SANDBOX"'), "must enforce DRY_RUN_SANDBOX mode");
    assert.ok(dryRunSrc.includes("erpModified: false"), "must guarantee erpModified: false in dry-run");
    assert.ok(dryRunSrc.includes("sandboxSqlPreviews"), "must compile read-only SQL previews without mutating ERP");
  });

  await t.test("2. Dual-track sync wired in /api/ai/advisor, /api/telegram/advisor, and AiAdvisorDrawer.tsx", () => {
    const advisorRouteSrc = fs.readFileSync("c:/shenglong-next/app/api/ai/advisor/route.ts", "utf8");
    assert.ok(advisorRouteSrc.includes("runSevenAiJointDryRun"), "/api/ai/advisor must call runSevenAiJointDryRun");
    assert.ok(advisorRouteSrc.includes("all_dry_run"), "/api/ai/advisor must support all_dry_run agentId");

    const tgRouteSrc = fs.readFileSync("c:/shenglong-next/app/api/telegram/advisor/route.ts", "utf8");
    assert.ok(tgRouteSrc.includes("🚀 七大AI全真聯動試跑 (Dry-Run)"), "Telegram keyboard must include 1-tap Dry-Run button");
    assert.ok(tgRouteSrc.includes("run_dry_run_all"), "Telegram webhook must support run_dry_run_all callback");

    const drawerSrc = fs.readFileSync("c:/shenglong-next/app/components/AiAdvisorDrawer.tsx", "utf8");
    assert.ok(drawerSrc.includes("七大 AI 全真數據沙盒試跑 (Dry-Run 雙軌推播)"), "AiAdvisorDrawer must include 1-tap dual-track Dry-Run button");
  });
});

test("Seven-AI Human-in-the-Loop Production Mode & 4-Shift Auto-Pilot Scheduler", async (t) => {
  await t.test("1. seven-ai-autopilot-scheduler.ts defines 3-tier permission guardrails and 4 daily shifts (closing 21:00, report 21:30)", () => {
    const autoSrc = fs.readFileSync("c:/shenglong-next/lib/seven-ai-autopilot-scheduler.ts", "utf8");
    assert.ok(autoSrc.includes("THREE_TIER_PERMISSION_GUARDRAILS"), "must define 3-tier permission guardrails");
    assert.ok(autoSrc.includes("morning_0800"), "must define 08:00 morning shift");
    assert.ok(autoSrc.includes("peak_realtime"), "must define peak realtime shift (08:30 ~ 21:00)");
    assert.ok(autoSrc.includes("08:30 ~ 21:00"), "must reflect 21:00 closing time");
    assert.ok(autoSrc.includes("afternoon_1430"), "must define 14:30 afternoon shift");
    assert.ok(autoSrc.includes("evening_2130"), "must define 21:30 evening shift after 21:00 closing");
  });

  await t.test("2. /api/ai/autopilot and advisor-bot.cjs wire up daily 08:00, 14:30, 21:30 automatic shift triggers", () => {
    const routeSrc = fs.readFileSync("c:/shenglong-next/app/api/ai/autopilot/route.ts", "utf8");
    assert.ok(routeSrc.includes("executeAutoPilotShift"), "/api/ai/autopilot must execute Auto-Pilot shifts");
    assert.ok(routeSrc.includes("HUMAN_IN_THE_LOOP_AUTOPILOT"), "must enforce HUMAN_IN_THE_LOOP_AUTOPILOT mode");
    assert.ok(routeSrc.includes("🌙 21:30晚報班"), "must display 21:30 evening report button");

    const botSrc = fs.readFileSync("c:/shenglong-next/advisor-bot.cjs", "utf8");
    assert.ok(botSrc.includes("lastAutoPilot0800Date"), "advisor-bot.cjs must schedule 08:00 shift");
    assert.ok(botSrc.includes("lastAutoPilot1430Date"), "advisor-bot.cjs must schedule 14:30 shift");
    assert.ok(botSrc.includes("lastAutoPilot2130Date"), "advisor-bot.cjs must schedule 21:30 shift");
  });
});

test("Backlog & Pending Approvals Completion: Empty Barrel/Transfer Writeback, UPS Power Guardian, and Boss Approvals Hub", async (t) => {
  await t.test("1. erp-writeback-engine.cjs supports emptyReturned, collectedAmount, and transfer payment writeback", () => {
    const plan = buildDispatchWritebackSql({
      id: "job-deliv-ext",
      orderId: 361582,
      action: "deliver",
      payload: {
        driver: "游柏林",
        paymentMethod: "transfer",
        emptyReturned: 2,
        collectedAmount: 1500,
      },
    });
    assert.equal(plan.logPrefix, "DELIVER");
    assert.ok(plan.sql.includes("【轉帳】"), "must record transfer payment tag in oder_remarks");
    assert.ok(plan.sql.includes("【收空瓶:2支】"), "must record empty cylinders returned in oder_remarks");
    assert.ok(plan.sql.includes("【實收:$1500】"), "must record collected amount in oder_remarks");
  });

  await t.test("2. ups-power-guardian.cjs evaluates AC vs UPS battery power and generates SQL CHECKPOINT", () => {
    const req = createRequire(import.meta.url);
    const { evaluatePowerState, buildSqlEmergencyCheckpointSql } = req("c:/shenglong-next/lib/ups-power-guardian.cjs");
    const onBattery = evaluatePowerState({ BatteryStatus: 1, EstimatedChargeRemaining: 85 });
    assert.equal(onBattery.powerSource, "UPS_BATTERY");
    assert.equal(onBattery.requiresEmergencyCheckpoint, true);
    assert.ok(buildSqlEmergencyCheckpointSql().includes("CHECKPOINT;"));
  });

  await t.test("3. boss-approvals-hub.ts and /api/ai/approvals unify Level-2 Human-in-the-Loop approvals", () => {
    const hubSrc = fs.readFileSync("c:/shenglong-next/lib/boss-approvals-hub.ts", "utf8");
    assert.ok(hubSrc.includes("buildLiveBossApprovalItems"), "must export buildLiveBossApprovalItems");
    assert.ok(hubSrc.includes("apr_mkt_orange_wakeup"), "must include orange wakeup approval item");
    assert.ok(hubSrc.includes("apr_mkt_red_barrel"), "must include red barrel recovery approval item");
    assert.ok(hubSrc.includes("apr_fin_debt_tag"), "must include finance debt collection tag item");
  });
});
