import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function readRepoFile(relPath) {
  const candidates = [
    path.join(ROOT, relPath),
    path.join("c:/shenglong-next", relPath),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return fs.readFileSync(p, "utf8");
  }
  throw new Error(`File not found: ${relPath}`);
}

test("1. [Cold-Start Snapshot Diff] today-orders route loads persisted baseline before overwriting KV and schedules dual-track alerts", () => {
  const routeSrc = readRepoFile("app/api/today-orders/route.ts");

  // 必須引入 scheduleOperationsNewOrderAlerts
  assert.match(routeSrc, /import\s+\{\s*scheduleOperationsNewOrderAlerts\s*\}\s+from\s+"@\/lib\/operations-new-order-alert"/);

  // 必須提供 loadPersistedOrderBaseline 並在寫入 PRIMARY_KV_URL 之前執行
  assert.match(routeSrc, /export\s+async\s+function\s+loadPersistedOrderBaseline\(/);
  const baselineCallIdx = routeSrc.indexOf("await loadPersistedOrderBaseline()");
  const kvWriteIdx = routeSrc.indexOf('method: "POST"', baselineCallIdx > 0 ? baselineCallIdx : 0);
  assert.ok(baselineCallIdx > 0, "POST must call loadPersistedOrderBaseline() on cold start");
  assert.ok(kvWriteIdx > baselineCallIdx, "loadPersistedOrderBaseline() must run BEFORE overwriting PRIMARY_KV_URL");

  // 必須收集新單並交由 scheduleOperationsNewOrderAlerts 發送，且具備 findRecentFreshOrdersFallback 防門市雙寫時序覆蓋
  assert.match(routeSrc, /const\s+newOrdersForAlert:\s*TodayOrderItem\[\]\s*=\s*\[\]/);
  assert.match(routeSrc, /export\s+function\s+findRecentFreshOrdersFallback\(/);
  assert.match(routeSrc, /scheduleOperationsNewOrderAlerts\(alertsToDispatch\)/);

  // GET 消除 STALE-HIT 舊快取延遲：超過 4 秒強制 await refreshOrdersFromKV()，並支援 ?fresh=1
  assert.match(routeSrc, /searchParams\.get\("fresh"\)\s*===\s*"1"/);
  assert.doesNotMatch(routeSrc, /refreshOrdersFromKV\(\)\.catch\(\(\)\s*=>\s*\{\}\)/);
  assert.match(routeSrc, /"X-Turbo-Cache":\s*"FRESH-HIT"/);
});

test("2. [Dual-Track Alert Module] operations-new-order-alert supports deduplication, batch summary, Web Push, and Telegram inline keyboard", () => {
  const alertSrc = readRepoFile("lib/operations-new-order-alert.ts");

  // 預設發送至盛隆訂單群 -1004402662328
  assert.match(alertSrc, /DEFAULT_ORDER_CHAT_ID\s*=\s*"-1004402662328"/);
  assert.match(alertSrc, /MAX_INDIVIDUAL_ALERTS\s*=\s*5/);

  // 6 小時去重保護
  assert.match(alertSrc, /export\s+function\s+claimUnnotifiedOrders\(/);
  assert.match(alertSrc, /ops_new_order_alert_\$\{id\}/);

  // Telegram 卡片與直達按鈕
  assert.match(alertSrc, /export\s+function\s+buildTelegramOrderMessage\(/);
  assert.match(alertSrc, /開啟監控中心/);
  assert.match(alertSrc, /地圖導航/);
  assert.match(alertSrc, /export\s+function\s+buildTelegramSummaryMessage\(/);

  // 雙軌並行發送 + after() 平台背景完成
  assert.match(alertSrc, /export\s+async\s+function\s+deliverOperationsNewOrderAlerts\(/);
  assert.match(alertSrc, /export\s+function\s+scheduleOperationsNewOrderAlerts\(/);
  assert.match(alertSrc, /after\(async\s*\(\)\s*=>/);
});

test("3. [Subscription Store Hardening] web-push merges cloud & encrypted KV subscriptions and prevents overwriting when cloud read fails", () => {
  const webPushSrc = readRepoFile("lib/web-push.ts");

  assert.match(webPushSrc, /BACKUP_KV_SUBSCRIPTIONS_URL/);
  assert.match(webPushSrc, /export\s+async\s+function\s+readCloudSubscriptions\(\)/);
  assert.match(webPushSrc, /export\s+function\s+mergeSubscriptionLists\(/);
  assert.match(webPushSrc, /async\s+function\s+refreshSubscriptionsFromCloud\(/);

  // 雲端讀取失敗 (cloudList === null) 時絕不執行 PUT 覆寫洗掉其他裝置
  assert.match(webPushSrc, /if\s*\(cloudList\s*===\s*null\)/);

  // sendPushToOperations 發送前必須先呼叫 refreshSubscriptionsFromCloud()
  const sendOpsIdx = webPushSrc.indexOf("export async function sendPushToOperations");
  assert.ok(sendOpsIdx > 0);
  const sendOpsBody = webPushSrc.slice(sendOpsIdx);
  assert.match(sendOpsBody, /await\s+refreshSubscriptionsFromCloud\(\)/);
});

test("4. [Reverse Wake-Up & Morning First Order 0->1] operations page refreshes immediately on push and chimes on first order of the day", () => {
  const opsSrc = readRepoFile("app/operations/page.tsx");

  // Service Worker 收到 OPERATIONS_EVENT 時觸發 sl-ops-push-refresh 事件，立即呼叫 /api/today-orders?fresh=1
  assert.match(opsSrc, /sl-ops-push-refresh/);
  assert.match(opsSrc, /\/api\/today-orders\?fresh=1/);

  // 晨間首單 0 -> 1 防漏基準
  assert.match(opsSrc, /hasInitializedOrderBaselineRef/);
  assert.match(opsSrc, /const\s+isFirstLoad\s*=\s*!hasInitializedOrderBaselineRef\.current\s*&&\s*knownOrderIdsRef\.current\.size\s*===\s*0/);

  // 0ms 開屏秒顯快取 (sl_ops_today_orders_cache_v1)
  assert.match(opsSrc, /sl_ops_today_orders_cache_v1/);

  // 嚴守 AI 犯錯中心鐵律：常態輪詢間隔維持 60000ms (60 秒)
  assert.match(opsSrc, /fetchAllData\(false\);\s*\},\s*60000\)/);
});

test("5. [503 Persistence Root Fix & Driver App 0ms Instant Boot] today-orders POST falls back to PRIMARY_KV_URL and driver app boots cache-first in 0ms", () => {
  const routeSrc = readRepoFile("app/api/today-orders/route.ts");
  const driverPageSrc = readRepoFile("app/driver/page.tsx");
  const driverOrdersApiSrc = readRepoFile("app/api/driver/orders/route.ts");

  // POST /api/today-orders 具備 globalThis.fetch(PRIMARY_KV_URL) 容災回退，根除 503 Order snapshot persistence pending 阻斷司機與監控推播
  assert.match(routeSrc, /globalThis\.fetch\(PRIMARY_KV_URL/);
  // 冷啟動基準排除 3 分鐘內新單 ID，確保 scheduleOrderAssignment (司機 FCM) 與 scheduleOperationsNewOrderAlerts 皆不被吞沒
  assert.match(routeSrc, /const\s+freshIds\s*=\s*new\s+Set\(findRecentFreshOrdersFallback\(payload\.orders\)/);

  // 司機端 App 0ms 開屏秒顯：在 await fetch('/api/driver/verify-token') 之前即解鎖 isValidating 並載入今日快取
  const fastBootIdx = driverPageSrc.indexOf("const fastName = (localName || driverParam");
  const verifyFetchIdx = driverPageSrc.indexOf("await fetch(`/api/driver/verify-token?");
  assert.ok(fastBootIdx > 0 && verifyFetchIdx > fastBootIdx, "Driver app must hydrate local cache at 0ms BEFORE awaiting verify-token");

  // /api/driver/orders 採用 6 路 Promise.all 並行讀取，消除串列 await 瀑布
  assert.match(driverOrdersApiSrc, /const\s*\[\s*todayOrdersResult,\s*pendingDispatches,\s*settings,\s*allGpsRecords,\s*allRemarks,\s*lookups,?\s*\]\s*=\s*await\s+Promise\.all\(/);
});

