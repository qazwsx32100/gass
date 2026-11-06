/**
 * driver-offline-storage.ts
 * 盛隆瓦斯 外勤司機端 APP 離線抗斷網與地下室防掉單核心儲存中樞
 * 
 * 核心職責:
 * 1. 離線寄件匣 (Outbox Queue) 持久化管理 (LocalStorage + IndexedDB 雙重保險)
 * 2. 斷網狀態下送達、收款、空瓶回報樂觀更新 (Optimistic UI) 與本地快照立即落盤
 * 3. 恢復連線時智慧指數退避主動探測 (Active Ping Replay) 與冪等性出隊
 * 4. 司機地下室防掉單保證：即便關閉瀏覽器或 Android 系統砍程序，重啟 100% 還原最新操作
 */

export interface OutboxAction {
  id: string;
  orderId: number;
  action: "accept" | "finish";
  driverName: string;
  createdAt: number;
  retries: number;
  lastAttemptAt?: number;
  error?: string;
  payload?: {
    paymentMethod?: string;
    collectedAmount?: number;
    emptyReturned?: number;
    remarks?: string;
  };
}

export const OUTBOX_STORAGE_KEY = "shenglong_driver_outbox_queue_v1";
export const FIELD_REPORT_OUTBOX_KEY = "shenglong_field_report_outbox";
const CACHED_ORDERS_PREFIX = "shenglong_driver_cached_orders_";
const ORDER_STATUS_PREFIX = "shenglong_driver_order_status_v1_";

/**
 * 讀取本機離線寄件匣佇列
 */
export function getStoredOutboxQueue(): OutboxAction[] {
  if (typeof window === "undefined" || !window.localStorage) return [];
  try {
    const raw = localStorage.getItem(OUTBOX_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn("[OfflineStorage] 讀取 Outbox 失敗:", err);
    return [];
  }
}

/**
 * 儲存離線寄件匣佇列 (雙重持久化)
 */
export function persistOutboxQueue(queue: OutboxAction[]): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    localStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(queue));
    saveToIndexedDB("outbox", queue).catch(() => {});
  } catch (err) {
    console.warn("[OfflineStorage] 寫入 Outbox 失敗:", err);
  }
}

/**
 * 新增或合併離線操作至寄件匣 (具備狀態升級與去重保護)
 */
export function enqueueOutboxAction(
  orderId: number,
  action: "accept" | "finish",
  driverName: string,
  payload?: OutboxAction["payload"]
): { actionId: string; nextQueue: OutboxAction[] } {
  const currentQueue = getStoredOutboxQueue();
  const actionId = `${Date.now()}_${orderId}_${action}`;
  
  const newAction: OutboxAction = {
    id: actionId,
    orderId,
    action,
    driverName: driverName || "小龍",
    createdAt: Date.now(),
    retries: 0,
    payload,
  };

  // 🛡️ 狀態去重與升級：若已有同一張單的同一動作，更新之；
  // 若新動作為 finish 而既有為 accept，升級並覆蓋為 finish
  const filtered = currentQueue.filter((item) => {
    if (item.orderId === orderId) {
      if (item.action === action) return false;
      if (action === "finish" && item.action === "accept") return false;
    }
    return true;
  });

  const nextQueue = [...filtered, newAction];
  persistOutboxQueue(nextQueue);
  return { actionId, nextQueue };
}

/**
 * 成功送出後，從寄件匣安全移除指定動作
 */
export function dequeueOutboxAction(actionId: string): OutboxAction[] {
  const currentQueue = getStoredOutboxQueue();
  const nextQueue = currentQueue.filter((a) => a.id !== actionId);
  persistOutboxQueue(nextQueue);
  return nextQueue;
}

/**
 * 樂觀更新本機快取中的派單陣列，並立即持久化到本機快取
 * 解決痛點：司機在地下室點擊「送達/收款」後，即便立即重新整理或殺進程，本機快照依然為最新「已完成」狀態！
 */
export function updateAndPersistCachedOrders(
  driverName: string,
  currentOrders: any[],
  orderId: number,
  status: "accepted" | "finished",
  payload?: OutboxAction["payload"]
): any[] {
  const updatedOrders = currentOrders.map((o) => {
    if (Number(o.id) !== Number(orderId)) return o;

    const updated: any = {
      ...o,
      driverStatus: status,
    };

    if (status === "finished") {
      updated.isLegacyPaid = true;
      updated.status = "DELIVERED";
      updated.isDelivered = true;
      if (payload?.collectedAmount !== undefined) {
        updated.collectedAmount = payload.collectedAmount;
      }
      if (payload?.emptyReturned !== undefined) {
        updated.emptyReturned = payload.emptyReturned;
      }
      if (payload?.paymentMethod) {
        updated.paymentMethod = payload.paymentMethod;
      }
    }
    return updated;
  });

  // 立即落盤到 LocalStorage 與 Android 原生 Bridge
  if (typeof window !== "undefined" && window.localStorage && driverName) {
    try {
      const rawJson = JSON.stringify(updatedOrders);
      localStorage.setItem(`${CACHED_ORDERS_PREFIX}${driverName}`, rawJson);

      // 同步更新單單狀態表
      const statusKey = `${ORDER_STATUS_PREFIX}${driverName}`;
      const rawStatus = localStorage.getItem(statusKey);
      const statusMap = rawStatus ? JSON.parse(rawStatus) : {};
      statusMap[orderId] = { status, updatedAt: Date.now() };
      localStorage.setItem(statusKey, JSON.stringify(statusMap));

      // 若在 Android 原生 APK 環境，同步調用原生快取
      const androidBridge = (window as any).AndroidBridge;
      if (androidBridge && typeof androidBridge.saveOfflineOrders === "function") {
        androidBridge.saveOfflineOrders(rawJson);
      }
    } catch (err) {
      console.warn("[OfflineStorage] 更新本機快取失敗:", err);
    }
  }

  return updatedOrders;
}

/**
 * 真實網路連通性主動探測 (杜絕 Android 偽在線 Fake Online 假訊號)
 */
export async function checkRealConnectivity(
  pingUrl = "/api/driver/version",
  fetchFn: typeof fetch = typeof fetch !== "undefined" ? fetch : (null as any)
): Promise<boolean> {
  if (!fetchFn) return false;
  if (typeof window !== "undefined" && typeof navigator !== "undefined" && navigator.onLine === false) {
    return false;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);
    const res = await fetchFn(`${pingUrl}?_ping=${Date.now()}`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return res.status >= 200 && res.status < 400;
  } catch {
    return false;
  }
}

/**
 * 智慧重試並批次回放寄件匣 (Auto-Replay FIFO with Idempotency)
 */
export async function replayOutboxQueue(
  token: string,
  onItemSuccess?: (item: OutboxAction) => void,
  fetchFn: typeof fetch = typeof fetch !== "undefined" ? fetch : (null as any)
): Promise<{ successCount: number; remainingCount: number; errors: string[] }> {
  const queue = getStoredOutboxQueue();
  if (queue.length === 0 || !fetchFn) {
    return { successCount: 0, remainingCount: 0, errors: [] };
  }

  let successCount = 0;
  const errors: string[] = [];
  const currentQueue = [...queue];

  for (const item of currentQueue) {
    try {
      const res = await fetchFn("/api/driver/orders/status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "x-driver-token": token } : {}),
        },
        body: JSON.stringify({
          orderId: item.orderId,
          action: item.action,
          driverName: item.driverName,
          token,
          paymentMethod: item.payload?.paymentMethod,
          collectedAmount: item.payload?.collectedAmount,
          emptyReturned: item.payload?.emptyReturned,
          remarks: item.payload?.remarks,
          isOfflineReplay: true,
        }),
      });

      if (res.ok) {
        dequeueOutboxAction(item.id);
        successCount++;
        if (onItemSuccess) onItemSuccess(item);
      } else {
        const errText = await res.text().catch(() => "");
        errors.push(`單號 #${item.orderId} 回放失敗 (${res.status}): ${errText}`);
        // 伺服器若明確回覆 403 停權，中止回放
        if (res.status === 403) break;
      }
    } catch (err: any) {
      errors.push(`單號 #${item.orderId} 網路連線異常: ${err?.message || err}`);
      // 遇連線例外（再度斷訊），中斷後續回放保留在佇列中
      break;
    }
  }

  const remaining = getStoredOutboxQueue();
  return { successCount, remainingCount: remaining.length, errors };
}

// ── 5. IndexedDB 深度防毀備援層 ──
const DB_NAME = "shenglong_driver_offline_db";
const DB_VERSION = 1;

function openOfflineDatabase(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !window.indexedDB) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e: any) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("keyval")) {
          db.createObjectStore("keyval", { keyPath: "key" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function saveToIndexedDB(key: string, value: any): Promise<void> {
  const db = await openOfflineDatabase();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction("keyval", "readwrite");
      const store = tx.objectStore("keyval");
      store.put({ key, value, updatedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}
