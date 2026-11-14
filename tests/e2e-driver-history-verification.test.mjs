import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Auto load .env if SHENGLONG_GAS_STOCK_SYNC_SECRET not set
if (!process.env.SHENGLONG_GAS_STOCK_SYNC_SECRET) {
  const envPath = path.resolve("C:/shenglong-next/.env");
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const match = line.match(/^SHENGLONG_GAS_STOCK_SYNC_SECRET=(.*)$/);
      if (match) {
        process.env.SHENGLONG_GAS_STOCK_SYNC_SECRET = match[1].trim().replace(/^['"]|['"]$/g, "");
        break;
      }
    }
  }
}

import { operationsKvFetch } from "../../shenglong-next/lib/operations-kv-fetch.ts";
import { decryptPrivateKv } from "../../shenglong-next/lib/private-kv.ts";

test("🛡️ 端對端驗證：operationsKvFetch 讀取 driver_history_v1 並成功解密小龍歷史訂單", async () => {
  const res = await operationsKvFetch("https://kvdb.io/XwdpBD41akmYGtk8ReuBTE/driver_history_v1");
  assert.equal(res.status, 200, "HTTP 必須為 200");
  const raw = await res.json();
  const decrypted = decryptPrivateKv(raw, "driver_history_v1");
  assert.ok(Array.isArray(decrypted.orders), "orders 必須為陣列");
  assert.ok(decrypted.orders.length > 500, `訂單數量 (${decrypted.orders.length}) 必須大於 500`);

  const xlOrders = decrypted.orders.filter(o => o.driver === "小龍");
  assert.ok(xlOrders.length > 100, `小龍訂單數 (${xlOrders.length}) 必須大於 100`);

  const nov13 = xlOrders.filter(o => (o.date || "").includes("2026/11/13"));
  assert.ok(nov13.length > 0, "11/13 必須有小龍訂單");
  console.log("✔ 成功驗證：11/13 小龍配送訂單筆數 =", nov13.length);

  const novMonth = xlOrders.filter(o => (o.date || "").startsWith("2026/11"));
  assert.ok(novMonth.length > 0, "2026/11 必須有小龍訂單");
  console.log("✔ 成功驗證：2026/11 小龍配送訂單總筆數 =", novMonth.length);
});
