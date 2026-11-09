import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("Operations Dispatch to Driver App & ERP Transmission Security & Reliability", async (t) => {
  await t.test("1. driver-session.ts exports isSameOriginRequest and grants admin for internal operations origin", () => {
    const src = fs.readFileSync("c:/shenglong-next/lib/driver-session.ts", "utf8");
    assert.ok(
      src.includes("export function isSameOriginRequest"),
      "must export isSameOriginRequest"
    );
    assert.ok(
      src.includes('request.headers.get("x-internal-origin") === "operations"'),
      "must recognize operations x-internal-origin"
    );
    assert.ok(
      src.includes("const isInternal = isSameOriginRequest(request);"),
      "must check internal request"
    );
    assert.ok(
      src.includes("const isAdmin = Boolean(isInternal || isBearerAuthorized || (user && userCan(user, requiredPermission as any)));"),
      "internal operations center requests must have isAdmin authority to dispatch orders"
    );
  });

  await t.test("2. status/route.ts allows batch_assign with unassign action (稍後輸入)", () => {
    const src = fs.readFileSync("c:/shenglong-next/app/api/driver/orders/status/route.ts", "utf8");
    assert.ok(
      src.includes('const isUnassignAction = ["稍後輸入", "待派工", "未指派", "未指定", "待指派", "暫無", "無"].includes(assignDriverName);'),
      "must detect unassign action"
    );
    assert.ok(
      src.includes('assignDriverName = "稍後輸入"'),
      "must normalize unassign action to 稍後輸入"
    );
    assert.ok(
      src.includes('o.driverStatus = "pending";'),
      "unassigned orders must revert to pending driverStatus"
    );
    assert.ok(
      src.includes("enqueueBatchDispatches(numericOrderIds, assignDriverName, true);"),
      "must enqueue batch dispatches with assignDriverName"
    );
  });

  await t.test("3. assign/route.ts recognizes same-origin operations requests and allows unassignment", () => {
    const src = fs.readFileSync("c:/shenglong-next/app/api/driver/orders/assign/route.ts", "utf8");
    assert.ok(
      src.includes("const isInternal = isSameOriginRequest(request);"),
      "must recognize internal same-origin requests"
    );
    assert.ok(
      src.includes("if (!user && !isInternal)"),
      "must permit internal operations center dispatches even without external cookie session"
    );
    assert.ok(
      src.includes('const driverName = isUnassignAction ? "稍後輸入" : rawDriverName;'),
      "must permit unassigning to 稍後輸入"
    );
  });

  await t.test("4. operations/page.tsx guards batch dispatch against empty selection and shows prominent toast", () => {
    const src = fs.readFileSync("c:/shenglong-next/app/operations/page.tsx", "utf8");
    assert.ok(
      src.includes('setBatchDispatchNotice("⚠️ 請先在下方勾選要指派的訂單！");'),
      "must warn dispatcher when clicking batch dispatch without selecting checkboxes"
    );
    assert.ok(
      src.includes("position: \"sticky\"") && src.includes("top: \"10px\"") && src.includes("zIndex: 999"),
      "must render sticky prominent batch dispatch toast so transmission status is immediately visible across all tabs"
    );
    assert.ok(
      src.includes('⏳ 訂單 #${orderId} 已設為【稍後輸入】'),
      "must give explicit user feedback when resetting an order to unassigned"
    );
  });

  await t.test("5. isSameOriginRequest accurately identifies operations console requests", async () => {
    const { isSameOriginRequest } = await import("file:///c:/shenglong-next/lib/driver-session.ts");

    // Case A: With x-internal-origin header
    const reqA = new Request("https://shenglong.vercel.app/api/driver/orders/status", {
      method: "POST",
      headers: {
        "x-internal-origin": "operations",
      },
    });
    assert.equal(isSameOriginRequest(reqA), true, "x-internal-origin operations must be recognized");

    // Case B: Browser sec-fetch-site: same-origin
    const reqB = new Request("https://shenglong.vercel.app/api/driver/orders/status", {
      method: "POST",
      headers: {
        "sec-fetch-site": "same-origin",
      },
    });
    assert.equal(isSameOriginRequest(reqB), true, "sec-fetch-site same-origin must be recognized");

    // Case C: Browser referer from /operations
    const reqC = new Request("https://shenglong.vercel.app/api/driver/orders/status", {
      method: "POST",
      headers: {
        referer: "https://shenglong.vercel.app/operations",
        host: "shenglong.vercel.app",
      },
    });
    assert.equal(isSameOriginRequest(reqC), true, "referer from /operations must be recognized");

    // Case D: External untrusted request
    const reqD = new Request("https://shenglong.vercel.app/api/driver/orders/status", {
      method: "POST",
      headers: {
        referer: "https://malicious-site.com",
        origin: "https://malicious-site.com",
        host: "shenglong.vercel.app",
      },
    });
    assert.equal(isSameOriginRequest(reqD), false, "untrusted external origin must NOT be recognized");
  });
});
