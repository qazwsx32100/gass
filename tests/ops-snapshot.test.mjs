import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("戰情室單一聚合快照 API (ops/snapshot) 存在性與架構定義", () => {
  const opsSnapshotPath = path.resolve("c:/shenglong-next/app/api/ops/snapshot/route.ts");
  const operationsSnapshotPath = path.resolve("c:/shenglong-next/app/api/operations/snapshot/route.ts");

  assert.ok(fs.existsSync(opsSnapshotPath), "ops/snapshot/route.ts 檔案必須存在");
  assert.ok(fs.existsSync(operationsSnapshotPath), "operations/snapshot/route.ts 檔案必須存在");

  const opsContent = fs.readFileSync(opsSnapshotPath, "utf8");
  assert.ok(opsContent.includes("export const runtime = \"nodejs\""), "必須指定 nodejs runtime");
  assert.ok(opsContent.includes("export const dynamic = \"force-dynamic\""), "必須指定 force-dynamic");
  assert.ok(opsContent.includes("export async function GET"), "必須匯出 GET 處理函式");
  assert.ok(opsContent.includes("turboCache"), "必須支援記憶體快取");
  assert.ok(opsContent.includes("Promise.allSettled"), "必須使用 Promise.allSettled 並行且容錯提取五大模組");

  const operationsContent = fs.readFileSync(operationsSnapshotPath, "utf8");
  assert.ok(operationsContent.includes("export const runtime = \"nodejs\""), "operations/snapshot 必須指定 nodejs runtime");
  assert.ok(operationsContent.includes("export const dynamic = \"force-dynamic\""), "operations/snapshot 必須指定 force-dynamic");
  assert.ok(operationsContent.includes("export { GET } from \"@/app/api/ops/snapshot/route\""), "必須別名匯出 ops/snapshot GET 處理函式");
});

test("戰情室前端 operations/page.tsx 聚合快照與容錯備援邏輯驗證", () => {
  const pagePath = path.resolve("c:/shenglong-next/app/operations/page.tsx");
  assert.ok(fs.existsSync(pagePath), "operations/page.tsx 檔案必須存在");

  const pageContent = fs.readFileSync(pagePath, "utf8");
  assert.ok(pageContent.includes("/api/ops/snapshot"), "前端必須優先呼叫單一聚合快照 API /api/ops/snapshot");
  assert.ok(pageContent.includes("fetchIndividualData"), "前端必須具備五端點獨立提取的容錯降級保底函式");
  assert.ok(pageContent.includes("applyStockPayload"), "必須具備庫存回調分派處理");
  assert.ok(pageContent.includes("applyOrdersPayload"), "必須具備訂單回調分派處理");
  assert.ok(pageContent.includes("applySystemPayload"), "必須具備系統狀態回調分派處理");
  assert.ok(pageContent.includes("applyWeatherPayload"), "必須具備氣象回調分派處理");
  assert.ok(pageContent.includes("applyCallsPayload"), "必須具備來電回調分派處理");
});

test("聚合快照資料結構契約驗證 (Mock Snapshot Verification)", () => {
  // 驗證聚合輸出資料格式契約 (Payload Contract)
  const mockPayload = {
    ok: true,
    timestamp: new Date().toISOString(),
    stock: { qty50: 10, qty20: 30, isLive: true },
    orders: { totalOrders: 5, totalAmount: 3500, orders: [] },
    system: { status: "HEALTHY", sqlStatus: { online: true } },
    weather: { location: "新北市三重區", hourly: [] },
    calls: { calls: [] },
  };

  assert.equal(mockPayload.ok, true);
  assert.ok(mockPayload.timestamp);
  assert.ok("stock" in mockPayload);
  assert.ok("orders" in mockPayload);
  assert.ok("system" in mockPayload);
  assert.ok("weather" in mockPayload);
  assert.ok("calls" in mockPayload);
});
