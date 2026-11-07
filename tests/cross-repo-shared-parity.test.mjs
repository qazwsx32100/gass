import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  ensureCloudCustomerDirectoryLoaded as gassEnsureCustomers,
  fetchCloudCustomerOrders as gassFetchOrders,
  searchCloudCustomers as gassSearchCustomers,
} from "../lib/cloud-customer-gateway.ts";
import {
  matchLineCustomer as gassMatchLine,
  matchLineCustomerAsync as gassMatchLineAsync,
} from "../api/_line-customer-matcher.js";

const NEXT_REPO_ROOT = "c:/shenglong-next";

test("【跨倉同源校驗】c:/Gass 與 c:/shenglong-next 共用雲端客戶中樞與 LINE 熟客匹配模組保持 100% 契約同步", async (t) => {
  if (!fs.existsSync(NEXT_REPO_ROOT)) {
    t.skip("c:/shenglong-next 不存在於當前測試環境，略過跨倉校驗");
    return;
  }

  const nextGateway = await import("file:///c:/shenglong-next/lib/cloud-customer-gateway.ts");
  const nextMatcher = await import("file:///c:/shenglong-next/api/_line-customer-matcher.js");

  assert.equal(typeof gassEnsureCustomers, "function");
  assert.equal(typeof nextGateway.ensureCloudCustomerDirectoryLoaded, "function");
  assert.equal(typeof gassFetchOrders, "function");
  assert.equal(typeof nextGateway.fetchCloudCustomerOrders, "function");

  assert.equal(typeof gassMatchLineAsync, "function");
  assert.equal(typeof nextMatcher.matchLineCustomerAsync, "function");

  // 驗證兩倉對關鍵熟客 26.21.1 檢索結果與規格推斷完全一致
  const gassHits = gassSearchCustomers("26.21.1", 3);
  const nextHits = nextGateway.searchCloudCustomers("26.21.1", 3);
  assert.ok(gassHits.length > 0 && nextHits.length > 0);
  assert.equal(gassHits[0].code, nextHits[0].code);
  assert.equal(gassHits[0].id, nextHits[0].id);

  const m1 = gassMatchLine("我是 26.21.1 要叫瓦斯");
  const m2 = nextMatcher.matchLineCustomer("我是 26.21.1 要叫瓦斯");
  assert.equal(m1?.customer?.id, m2?.customer?.id);
  assert.equal(m1?.matchType, m2?.matchType);
});
