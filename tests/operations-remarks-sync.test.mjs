import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("Operations Remarks Pipeline & Legacy ERP Writeback", async (t) => {
  await t.test("1. erp-writeback-engine.cjs builds robust ROWLOCK sql for remarks action", async () => {
    const { buildDispatchWritebackSql } = await import("file:///c:/shenglong-next/lib/erp-writeback-engine.cjs");
    const plan = buildDispatchWritebackSql({
      action: "remarks",
      orderId: 359421,
      payload: { remarks: "１１" },
    });

    assert.ok(plan && plan.sql, "must generate plan with sql");
    assert.equal(plan.logPrefix, "REMARKS");
    assert.ok(plan.sql.includes("UPDATE dbo.gas_oders WITH (ROWLOCK)"), "must use ROWLOCK");
    assert.ok(plan.sql.includes("SET oder_remarks = N'１１'"), "must set oder_remarks to １１");
    assert.ok(plan.sql.includes("WHERE oder_id = 359421;"), "must target order 359421");
  });

  await t.test("2. today-orders/remarks/route.ts maps dataRemark/addressRemark to ERP sync", () => {
    const src = fs.readFileSync("c:/shenglong-next/app/api/today-orders/remarks/route.ts", "utf8");
    assert.ok(
      src.includes("(cleanAddressRemark ?? cleanDataRemark)?.slice(0, 50)"),
      "must fall back to dataRemark when cleanOrderRemark is undefined"
    );
    assert.ok(
      src.includes('await enqueueOrderAction("remarks", numOrderId, {'),
      "must enqueue remarks action into dispatch queue"
    );
  });

  await t.test("3. today-orders/route.ts permits same-origin operations requests in GET", () => {
    const src = fs.readFileSync("c:/shenglong-next/app/api/today-orders/route.ts", "utf8");
    assert.ok(
      src.includes("const isInternal = isSameOriginRequest(request);"),
      "must check isSameOriginRequest in GET"
    );
    assert.ok(
      src.includes("const isAllowed = isSyncBearer || isInternal || (user !== null && userCan(user, \"orders.view\"));"),
      "must include isInternal in isAllowed"
    );
  });

  await t.test("4. operations/page.tsx dispatches orderRemark and triggers prominent toast", () => {
    const src = fs.readFileSync("c:/shenglong-next/app/operations/page.tsx", "utf8");
    assert.ok(
      src.includes("orderRemark: params.orderRemark ?? params.dataRemark ?? params.addressRemark"),
      "must provide orderRemark in request body"
    );
    assert.ok(
      src.includes("備註「${remarkVal}」已儲存並同步至門市舊 ERP"),
      "must display prominent confirmation toast on save"
    );
  });
});
