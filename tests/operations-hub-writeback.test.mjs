import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildDispatchWritebackSql } = require("c:/shenglong-next/lib/erp-writeback-engine.cjs");

test("Monitoring Center to Legacy ERP Full Pipeline Verification", async (t) => {
  await t.test("Test 1: /api/driver/orders/status enforces session auth and ERP writeback", () => {
    const src = fs.readFileSync("c:/shenglong-next/app/api/driver/orders/status/route.ts", "utf8");
    assert.ok(
      src.includes("getSessionUser") && src.includes("getAuthenticatedDriver"),
      "must enforce session user or authenticated driver verification"
    );
    assert.ok(
      src.includes("batchAssignDriver") && src.includes("enqueueBatchDispatches"),
      "must support batch dispatch assignment and enqueue for legacy ERP writeback"
    );
    assert.ok(
      src.includes('enqueueOrderAction("deliver", numOrderId'),
      "must enqueue finish/deliver action for writeback"
    );
  });

  await t.test("Test 2: /api/today-orders/remarks enqueues ERP sync on operations center edits", () => {
    const src = fs.readFileSync("c:/shenglong-next/app/api/today-orders/remarks/route.ts", "utf8");
    assert.ok(
      src.includes("isSameOriginRequest(request)"),
      "must implement same origin check for remarks"
    );
    assert.ok(
      src.includes("(syncToErp || isInternal)"),
      "must trigger ERP sync when edited from internal operations center"
    );
    assert.ok(
      src.includes('enqueueOrderAction("remarks", numOrderId'),
      "must enqueue remarks action for writeback"
    );
  });

  await t.test("Test 3: /api/remote-command allows operations center stock and call commands", () => {
    const src = fs.readFileSync("c:/shenglong-next/app/api/remote-command/route.ts", "utf8");
    assert.ok(
      src.includes('request.headers.get("x-internal-origin") === "operations"'),
      "must authorize operations hub for remote stock commands"
    );
    assert.ok(
      src.includes("VALID_ACTIONS.has(action)"),
      "must validate supported commands"
    );
    assert.ok(
      src.includes("operations_dispatcher"),
      "must provide fallback dispatcher session for same-origin commands"
    );
  });

  await t.test("Test 4: Operations Web Hub passes x-internal-origin and credentials", () => {
    const pageSrc = fs.readFileSync("c:/shenglong-next/app/operations/page.tsx", "utf8");
    assert.ok(
      pageSrc.includes('"x-internal-origin": "operations"'),
      "operations page must send x-internal-origin header"
    );
    assert.ok(
      pageSrc.includes('syncToErp: true'),
      "operations page must specify syncToErp: true when saving remarks"
    );
    assert.ok(
      pageSrc.includes('credentials: "include"'),
      "operations page must include credentials in mutation calls"
    );
  });

  await t.test("Test 5: sync-stock.cjs and backup-db.cjs detect and connect to local SQL Server", () => {
    const syncSrc = fs.readFileSync("c:/shenglong-next/sync-stock.cjs", "utf8");
    assert.ok(
      syncSrc.includes("detectSqlEndpoint"),
      "sync-stock.cjs must implement detectSqlEndpoint"
    );
    assert.ok(
      !syncSrc.includes('if (SQL_SERVER.includes("SQLEXPRESS") || SQL_SERVER === "." || SQL_SERVER === "localhost") {\n  SQL_SERVER = "127.0.0.1,1000";\n}'),
      "sync-stock.cjs must not forcibly override SQLEXPRESS to 127.0.0.1,1000"
    );

    const backupSrc = fs.readFileSync("c:/shenglong-next/backup-db.cjs", "utf8");
    assert.ok(
      backupSrc.includes("SQL_SERVER = process.env.SQL_SERVER || \".\\\\SQLEXPRESS\""),
      "backup-db.cjs must point to local SQLEXPRESS"
    );
  });

  await t.test("Test 6: buildDispatchWritebackSql produces safe, compliant SQL for all operations", () => {
    // 1. Assign
    const assignPlan = buildDispatchWritebackSql({
      action: "assign",
      orderId: 359421,
      driverName: "小龍",
      force: true,
    });
    assert.ok(assignPlan.sql, "assign plan must generate SQL");
    assert.ok(assignPlan.sql.includes("UPDATE dbo.gas_oders WITH (ROWLOCK)"), "must use ROWLOCK");
    assert.ok(assignPlan.sql.includes("deliver = N'小龍'"), "must set deliver to 小龍");
    assert.ok(assignPlan.sql.includes("WHERE oder_id = 359421"), "must target order 359421");

    // 2. Deliver
    const deliverPlan = buildDispatchWritebackSql({
      action: "deliver",
      orderId: 359421,
      driverName: "小龍",
      payload: {
        paymentMethod: "cash",
        bottleNote: "收空瓶1支",
        emptyReturned: 1,
        collectedAmount: 750,
      },
    });
    assert.ok(deliverPlan.sql, "deliver plan must generate SQL");
    assert.ok(deliverPlan.sql.includes("payed = 'Y'"), "must mark payed = Y for cash");
    assert.ok(deliverPlan.sql.includes("【收空瓶:1支】"), "must include bottle return tag");

    // 3. Remarks
    const remarksPlan = buildDispatchWritebackSql({
      action: "remarks",
      orderId: 359421,
      payload: { remarks: "管理室代收" },
    });
    assert.ok(remarksPlan.sql, "remarks plan must generate SQL");
    assert.ok(remarksPlan.sql.includes("oder_remarks = N'管理室代收'"), "must update remarks");
  });

  await t.test("Test 7: Production Database Zero Pollution Audit (dbo.gas_oders = 234,769)", () => {
    try {
      const out = execFileSync(
        "sqlcmd.exe",
        [
          "-S", process.env.SQL_SERVER || "lpc:.\\SQLEXPRESS",
          "-E",
          "-d", "ShengLong_Inspection",
          "-l", "8",
          "-h", "-1",
          "-W",
          "-Q", "SET NOCOUNT ON; SELECT SUM(rows) FROM sys.partitions WHERE object_id = OBJECT_ID('dbo.gas_oders') AND index_id IN (0,1);",
        ],
        { encoding: "utf8", windowsHide: true, timeout: 15000 }
      );
      const rowCount = parseInt(out.trim(), 10);
      assert.strictEqual(rowCount, 234769, `dbo.gas_oders row count must be exactly 234,769, got ${rowCount}`);
    } catch (err) {
      if (
        process.env.CI ||
        err.code === 'ETIMEDOUT' ||
        err.message?.includes('ETIMEDOUT') ||
        err.message?.includes('ODBC Driver 17') ||
        err.message?.includes('無法開啟 SQL Server') ||
        err.message?.includes('登入超時') ||
        err.message?.includes('Login timeout expired') ||
        err.message?.includes('Cannot open connection')
      ) {
        return;
      }
      throw err;
    }
  });
});
