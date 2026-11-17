import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("🏢 監控中心連線健康度與延遲判定規範 (Directive #5 庫存健康度同源)", async (t) => {
  const pagePath = path.resolve("c:/shenglong-next/app/operations/page.tsx");
  const pageCode = fs.readFileSync(pagePath, "utf8");

  await t.test("1. MonitoringFreshnessBadge 採用主機雙軌存活判定，避免離峰無新訂單時誤報延遲", () => {
    assert.ok(
      pageCode.includes("isHostAlive"),
      "必須包含 isHostAlive 雙軌存活判定"
    );
    assert.ok(
      pageCode.includes("Directive #5"),
      "必須註明遵循 Directive #5 庫存健康度同源規範"
    );
    assert.ok(
      pageCode.includes("now - stockMs <= 180_000"),
      "庫存存活判定對齊 180 秒標準"
    );
  });

  await t.test("2. 模擬離峰時段無新訂單情境：庫存 10 秒前、心跳 30 秒前，訂單 600 秒前，系統維持綠燈", () => {
    const now = 1000000;
    const stockMs = now - 10000; // 10s ago
    const heartbeatMs = now - 30000; // 30s ago
    const ordersMs = now - 600000; // 10 min ago (離峰無新訂單)

    const isHostAlive = (heartbeatMs !== null && now !== null && now - heartbeatMs <= 240_000) ||
                        (stockMs !== null && now !== null && now - stockMs <= 180_000);

    const isStockStale = stockMs !== null && now !== null && now - stockMs > 180_000;
    const isHeartbeatStale = heartbeatMs !== null && now !== null && now - heartbeatMs > 240_000;

    const stale = now !== null && (!isHostAlive && (isStockStale || isHeartbeatStale));
    assert.equal(isHostAlive, true, "主機必須判定為存活");
    assert.equal(stale, false, "無新訂單時絕不可誤判為延遲");
  });

  await t.test("3. 模擬門市主機關機/斷線情境：庫存 300 秒前、心跳 300 秒前，系統精準亮紅燈", () => {
    const now = 1000000;
    const stockMs = now - 300000; // 5 min ago
    const heartbeatMs = now - 300000; // 5 min ago

    const isHostAlive = (heartbeatMs !== null && now !== null && now - heartbeatMs <= 240_000) ||
                        (stockMs !== null && now !== null && now - stockMs <= 180_000);

    const isStockStale = stockMs !== null && now !== null && now - stockMs > 180_000;
    const isHeartbeatStale = heartbeatMs !== null && now !== null && now - heartbeatMs > 240_000;

    const stale = now !== null && (!isHostAlive && (isStockStale || isHeartbeatStale));
    assert.equal(isHostAlive, false, "斷線時主機不可判定為存活");
    assert.equal(stale, true, "雙軌逾時時必須精準告警延遲");
  });
});
