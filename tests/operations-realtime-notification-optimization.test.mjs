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

  // 必須收集新單並交由 scheduleOperationsNewOrderAlerts 發送
  assert.match(routeSrc, /const\s+newOrdersForAlert:\s*TodayOrderItem\[\]\s*=\s*\[\]/);
  assert.match(routeSrc, /scheduleOperationsNewOrderAlerts\(newOrdersForAlert\)/);

  // GET 支援 ?fresh=1 供推播喚醒跨容器讀取最新快照
  assert.match(routeSrc, /searchParams\.get\("fresh"\)\s*===\s*"1"/);
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

test("3. [Subscription Store Hardening] web-push merges cloud subscriptions and prevents overwriting when cloud read fails", () => {
  const webPushSrc = readRepoFile("lib/web-push.ts");

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

  // 嚴守 AI 犯錯中心鐵律：常態輪詢間隔維持 60000ms (60 秒)
  assert.match(opsSrc, /fetchAllData\(false\);\s*\},\s*60000\)/);
});
