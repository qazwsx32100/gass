import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("🛡️ 司機端歷史運費 API 離線與雙向備援端對端檢驗", async (t) => {
  await t.test("1. operationsKvFetch 包含真實 KVDB 降級回退機制", () => {
    const file = path.resolve("C:/shenglong-next/lib/operations-kv-fetch.ts");
    const content = fs.readFileSync(file, "utf8");
    assert.ok(content.includes("[FALLBACK-TO-LEGACY-KV]"), "必須包含 fallback-to-legacy-kv");
    assert.ok(content.includes("fallbackRes.ok"), "必須檢查 fallbackRes.ok 並返回");
  });

  await t.test("2. earnings/route.ts 包含靜態 customer-orders 與 orders-last-known 雙層離線保底", () => {
    const file = path.resolve("C:/shenglong-next/app/api/driver/earnings/route.ts");
    const content = fs.readFileSync(file, "utf8");
    assert.ok(content.includes("orders-last-known.json"), "必須包含 orders-last-known 保底");
    assert.ok(content.includes("customer-orders-2026.json"), "必須包含 customer-orders-2026 保底");
  });

  await t.test("3. next.config.ts 追蹤 earnings 路由打包資源", () => {
    const file = path.resolve("C:/shenglong-next/next.config.ts");
    const content = fs.readFileSync(file, "utf8");
    assert.ok(content.includes('"/api/driver/earnings"'), "next.config.ts 必須追蹤 /api/driver/earnings 靜態檔");
  });
});
