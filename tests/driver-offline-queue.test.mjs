import test from "node:test";
import assert from "node:assert/strict";

// 模擬瀏覽器 window.localStorage 環境
const mockStorage = new Map();
if (typeof globalThis.window === "undefined") {
  globalThis.window = {
    localStorage: {
      getItem: (key) => mockStorage.get(key) || null,
      setItem: (key, val) => mockStorage.set(key, String(val)),
      removeItem: (key) => mockStorage.delete(key),
      clear: () => mockStorage.clear(),
    },
  };
} else {
  globalThis.window.localStorage = {
    getItem: (key) => mockStorage.get(key) || null,
    setItem: (key, val) => mockStorage.set(key, String(val)),
    removeItem: (key) => mockStorage.delete(key),
    clear: () => mockStorage.clear(),
  };
}
globalThis.localStorage = globalThis.window.localStorage;

import {
  enqueueOutboxAction,
  dequeueOutboxAction,
  getStoredOutboxQueue,
  updateAndPersistCachedOrders,
  checkRealConnectivity,
  replayOutboxQueue,
  OUTBOX_STORAGE_KEY
} from "../lib/driver-offline-storage.ts";

test("【離線抗斷網】1. 離線寄件匣入隊、去重與狀態升級驗證", () => {
  mockStorage.clear();

  // 1.1 加入接單動作
  const r1 = enqueueOutboxAction(1001, "accept", "小龍");
  assert.equal(r1.nextQueue.length, 1);
  assert.equal(r1.nextQueue[0].orderId, 1001);
  assert.equal(r1.nextQueue[0].action, "accept");

  // 1.2 地下室同單完成送達，應自動升級為 finish 並攜帶收款金額與空瓶數
  const r2 = enqueueOutboxAction(1001, "finish", "小龍", {
    paymentMethod: "cash",
    collectedAmount: 750,
    emptyReturned: 1,
    remarks: "地下室送達"
  });

  // 驗證去重升級：總數依然為 1，但動作升級為 finish 且帶有收款載體
  assert.equal(r2.nextQueue.length, 1);
  assert.equal(r2.nextQueue[0].action, "finish");
  assert.equal(r2.nextQueue[0].payload.collectedAmount, 750);
  assert.equal(r2.nextQueue[0].payload.emptyReturned, 1);

  // 1.3 加入另一筆第 1002 號單
  const r3 = enqueueOutboxAction(1002, "finish", "小龍", {
    paymentMethod: "monthly"
  });
  assert.equal(r3.nextQueue.length, 2);

  // 驗證持久化至 LocalStorage
  const stored = getStoredOutboxQueue();
  assert.equal(stored.length, 2);
});

test("【離線抗斷網】2. 本地單據快照立即落盤與防掉單驗證", () => {
  mockStorage.clear();

  const originalOrders = [
    { id: 2001, driverStatus: "accepted", price: 800, addr: "文化北路100號" },
    { id: 2002, driverStatus: "assigned", price: 750, addr: "長元街50號" }
  ];

  // 司機在地下室點擊「送達」
  const updated = updateAndPersistCachedOrders("小龍", originalOrders, 2001, "finished", {
    collectedAmount: 800,
    emptyReturned: 2,
    paymentMethod: "cash"
  });

  // 驗證記憶體即刻更新
  const target = updated.find((o) => o.id === 2001);
  assert.equal(target.driverStatus, "finished");
  assert.equal(target.collectedAmount, 800);
  assert.equal(target.emptyReturned, 2);
  assert.equal(target.isLegacyPaid, true);

  // 驗證 LocalStorage 持久化快照已落盤（重啟 APP 100% 讀出已完成狀態）
  const cachedJson = mockStorage.get("shenglong_driver_cached_orders_小龍");
  assert.ok(cachedJson !== undefined);
  const parsed = JSON.parse(cachedJson);
  assert.equal(parsed[0].driverStatus, "finished");
  assert.equal(parsed[0].collectedAmount, 800);
});

test("【離線抗斷網】3. 真實網路連通性主動探測 (Active Ping)", async () => {
  // 模擬在線 200 OK
  const mockFetchOk = async () => ({ status: 200 });
  const isConnected = await checkRealConnectivity("/api/test", mockFetchOk);
  assert.equal(isConnected, true);

  // 模擬地下室斷網（Fetch 例外拋出）
  const mockFetchOffline = async () => {
    throw new Error("NetworkError: Failed to fetch");
  };
  const isOffline = await checkRealConnectivity("/api/test", mockFetchOffline);
  assert.equal(isOffline, false);
});

test("【離線抗斷網】4. 恢復連線時 FIFO 批次回放與成功出隊", async () => {
  mockStorage.clear();

  enqueueOutboxAction(3001, "finish", "小龍", { collectedAmount: 750 });
  enqueueOutboxAction(3002, "finish", "小龍", { collectedAmount: 1600 });
  assert.equal(getStoredOutboxQueue().length, 2);

  // 模擬伺服器成功接收
  let callCount = 0;
  const mockFetchSuccess = async (url, options) => {
    callCount++;
    const body = JSON.parse(options.body);
    assert.equal(body.isOfflineReplay, true);
    return { ok: true, status: 200, text: async () => "OK" };
  };

  const replayedItemIds = [];
  const result = await replayOutboxQueue("test_token_123", (item) => {
    replayedItemIds.push(item.orderId);
  }, mockFetchSuccess);

  assert.equal(result.successCount, 2);
  assert.equal(result.remainingCount, 0);
  assert.deepEqual(replayedItemIds, [3001, 3002]);

  // 驗證寄件匣已全數清空
  assert.equal(getStoredOutboxQueue().length, 0);
});
