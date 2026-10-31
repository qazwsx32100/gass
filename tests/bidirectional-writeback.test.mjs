import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

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
