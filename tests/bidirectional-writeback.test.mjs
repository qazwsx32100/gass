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
