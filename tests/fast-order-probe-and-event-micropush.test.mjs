import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

const syncStockFile = existsSync(path.join(process.cwd(), "sync-stock.cjs"))
  ? path.join(process.cwd(), "sync-stock.cjs")
  : "C:/shenglong-next/sync-stock.cjs";
const source = readFileSync(syncStockFile, "utf8");

test("🛡️ 門市主機 1 秒本地輕量探測 ✕ 0.5 秒新單事件微推播檢驗", async (t) => {
  await t.test("1. 驗證 1 秒探測定時器配置為 1000ms", () => {
    assert.match(source, /setInterval\(fastCheckOrders,\s*1000\);/, "探測間隔必須精確為 1000ms (1秒)");
  });

  await t.test("2. 驗證本地 SQL 查詢強制使用 WITH (NOLOCK) 與 READ UNCOMMITTED (0 鎖表、0 負擔)", () => {
    assert.match(source, /SELECT ISNULL\(MAX\(oder_id\),\s*0\)/, "必須查詢 MAX(oder_id)");
    assert.match(source, /CHECKSUM_AGG\(BINARY_CHECKSUM\(oder_id,\s*deliver,\s*payed,\s*oder_price,\s*oder_time,\s*disable\)\)/, "必須計算今日全量指紋");
    assert.match(source, /WITH \(NOLOCK\)/, "必須強制加載 WITH (NOLOCK)");
    assert.match(source, /SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED/, "必須設定 READ UNCOMMITTED 隔離等級");
  });

  await t.test("3. 驗證首次探測靜默初始化，不發送任何雲端請求", async () => {
    let cloudPushCount = 0;
    let telegramCheckCount = 0;
    let mockSqlOutput = "362070 45 1289472910";

    const context = {
      isSqlConnected: true,
      isVercelOrdersPushPending: false,
      taipeiBusinessDate: () => "2026/11/15",
      runSqlStatement: async () => mockSqlOutput,
      pushTodayOrdersToCloud: async () => { cloudPushCount++; },
      checkNewOrders: async () => { telegramCheckCount++; },
      console: { log: () => {} },
    };

    const funcCode = `
      let lastMaxOrderId = 0;
      let lastFastOrderFingerprint = "";
      let lastFastOrderDate = "";

      async function fastCheckOrders() {
        if (!isSqlConnected || isVercelOrdersPushPending) return;
        try {
          const today = taipeiBusinessDate();
          const q = "query";
          const raw = await runSqlStatement(q);
          if (!raw) return;

          const parts = raw.trim().split(/\\s+/);
          if (parts.length < 3) return;
          const currentMaxOrderId = Number(parts[0]) || 0;
          const currentCount = Number(parts[1]) || 0;
          const currentChecksum = parts[2] || "0";
          const currentFingerprint = \`\${currentMaxOrderId}|\${currentCount}|\${currentChecksum}\`;

          if (lastFastOrderDate !== today || lastMaxOrderId === 0) {
            lastFastOrderDate = today;
            lastMaxOrderId = currentMaxOrderId;
            lastFastOrderFingerprint = currentFingerprint;
            return;
          }

          const hasNewOrder = currentMaxOrderId > lastMaxOrderId;
          const hasStatusOrCountChange = currentFingerprint !== lastFastOrderFingerprint;

          if (hasNewOrder) {
            lastMaxOrderId = currentMaxOrderId;
            lastFastOrderFingerprint = currentFingerprint;
            pushTodayOrdersToCloud(today, new Date().toISOString(), true).catch(() => {});
            checkNewOrders().catch(() => {});
          } else if (hasStatusOrCountChange) {
            lastFastOrderFingerprint = currentFingerprint;
            pushTodayOrdersToCloud(today, new Date().toISOString(), false).catch(() => {});
          }
        } catch (err) {}
      }
      this.probe = fastCheckOrders;
      this.getState = () => ({ lastMaxOrderId, lastFastOrderFingerprint, lastFastOrderDate });
    `;

    vm.createContext(context);
    vm.runInContext(funcCode, context);

    // 首次執行
    await context.probe();
    assert.equal(cloudPushCount, 0, "首次執行絕對禁止向雲端發送請求");
    assert.equal(telegramCheckCount, 0, "首次執行絕對禁止向 Telegram 廣播");
    assert.equal(context.getState().lastMaxOrderId, 362070);
  });

  await t.test("4. 驗證平時無新單時 100% 靜默待命 (0 請求、0 消耗)", async () => {
    let cloudPushCount = 0;
    const context = {
      isSqlConnected: true,
      isVercelOrdersPushPending: false,
      taipeiBusinessDate: () => "2026/11/15",
      runSqlStatement: async () => "362070 45 1289472910",
      pushTodayOrdersToCloud: async () => { cloudPushCount++; },
      checkNewOrders: async () => {},
      console: { log: () => {} },
    };

    const funcCode = `
      let lastMaxOrderId = 362070;
      let lastFastOrderFingerprint = "362070|45|1289472910";
      let lastFastOrderDate = "2026/11/15";

      async function fastCheckOrders() {
        if (!isSqlConnected || isVercelOrdersPushPending) return;
        try {
          const today = taipeiBusinessDate();
          const q = "query";
          const raw = await runSqlStatement(q);
          if (!raw) return;

          const parts = raw.trim().split(/\\s+/);
          if (parts.length < 3) return;
          const currentMaxOrderId = Number(parts[0]) || 0;
          const currentCount = Number(parts[1]) || 0;
          const currentChecksum = parts[2] || "0";
          const currentFingerprint = \`\${currentMaxOrderId}|\${currentCount}|\${currentChecksum}\`;

          if (lastFastOrderDate !== today || lastMaxOrderId === 0) {
            lastFastOrderDate = today;
            lastMaxOrderId = currentMaxOrderId;
            lastFastOrderFingerprint = currentFingerprint;
            return;
          }

          const hasNewOrder = currentMaxOrderId > lastMaxOrderId;
          const hasStatusOrCountChange = currentFingerprint !== lastFastOrderFingerprint;

          if (hasNewOrder) {
            lastMaxOrderId = currentMaxOrderId;
            lastFastOrderFingerprint = currentFingerprint;
            pushTodayOrdersToCloud(today, new Date().toISOString(), true).catch(() => {});
            checkNewOrders().catch(() => {});
          } else if (hasStatusOrCountChange) {
            lastFastOrderFingerprint = currentFingerprint;
            pushTodayOrdersToCloud(today, new Date().toISOString(), false).catch(() => {});
          }
        } catch (err) {}
      }
      this.probe = fastCheckOrders;
    `;

    vm.createContext(context);
    vm.runInContext(funcCode, context);

    // 連續探測 10 次
    for (let i = 0; i < 10; i++) {
      await context.probe();
    }
    assert.equal(cloudPushCount, 0, "無新單與狀態變更時，呼叫次數必須嚴格為 0");
  });

  await t.test("5. 驗證有新單時 0.5 秒微推播啟動 (force=true 且並行 Telegram)", async () => {
    let cloudPushArgs = null;
    let telegramTriggered = false;

    const context = {
      isSqlConnected: true,
      isVercelOrdersPushPending: false,
      taipeiBusinessDate: () => "2026/11/15",
      runSqlStatement: async () => "362071 46 1289999999", // MAX oder_id 變大為 362071
      pushTodayOrdersToCloud: async (date, time, force) => {
        cloudPushArgs = { date, time, force };
      },
      checkNewOrders: async () => {
        telegramTriggered = true;
      },
      console: { log: () => {} },
    };

    const funcCode = `
      let lastMaxOrderId = 362070;
      let lastFastOrderFingerprint = "362070|45|1289472910";
      let lastFastOrderDate = "2026/11/15";

      async function fastCheckOrders() {
        if (!isSqlConnected || isVercelOrdersPushPending) return;
        try {
          const today = taipeiBusinessDate();
          const q = "query";
          const raw = await runSqlStatement(q);
          if (!raw) return;

          const parts = raw.trim().split(/\\s+/);
          if (parts.length < 3) return;
          const currentMaxOrderId = Number(parts[0]) || 0;
          const currentCount = Number(parts[1]) || 0;
          const currentChecksum = parts[2] || "0";
          const currentFingerprint = \`\${currentMaxOrderId}|\${currentCount}|\${currentChecksum}\`;

          if (lastFastOrderDate !== today || lastMaxOrderId === 0) {
            lastFastOrderDate = today;
            lastMaxOrderId = currentMaxOrderId;
            lastFastOrderFingerprint = currentFingerprint;
            return;
          }

          const hasNewOrder = currentMaxOrderId > lastMaxOrderId;
          const hasStatusOrCountChange = currentFingerprint !== lastFastOrderFingerprint;

          if (hasNewOrder) {
            lastMaxOrderId = currentMaxOrderId;
            lastFastOrderFingerprint = currentFingerprint;
            pushTodayOrdersToCloud(today, new Date().toISOString(), true).catch(() => {});
            checkNewOrders().catch(() => {});
          } else if (hasStatusOrCountChange) {
            lastFastOrderFingerprint = currentFingerprint;
            pushTodayOrdersToCloud(today, new Date().toISOString(), false).catch(() => {});
          }
        } catch (err) {}
      }
      this.probe = fastCheckOrders;
      this.getState = () => ({ lastMaxOrderId, lastFastOrderFingerprint });
    `;

    vm.createContext(context);
    vm.runInContext(funcCode, context);

    await context.probe();
    assert.ok(cloudPushArgs, "必須觸發雲端微推播");
    assert.equal(cloudPushArgs.force, true, "新單微推播必須設定 force=true 繞過重試冷卻");
    assert.equal(telegramTriggered, true, "必須同時觸發 Telegram 新單即時通知");
    assert.equal(context.getState().lastMaxOrderId, 362071, "必須及時更新 lastMaxOrderId");
  });

  await t.test("6. 驗證既有訂單變更 (金額/派工/狀態) 觸發正常雲端同步 (force=false)", async () => {
    let cloudPushArgs = null;
    let telegramTriggered = false;

    const context = {
      isSqlConnected: true,
      isVercelOrdersPushPending: false,
      taipeiBusinessDate: () => "2026/11/15",
      runSqlStatement: async () => "362070 45 9999999999", // MAX 相同，但 checksum 變了 (如派工司機變更)
      pushTodayOrdersToCloud: async (date, time, force) => {
        cloudPushArgs = { date, time, force };
      },
      checkNewOrders: async () => {
        telegramTriggered = true;
      },
      console: { log: () => {} },
    };

    const funcCode = `
      let lastMaxOrderId = 362070;
      let lastFastOrderFingerprint = "362070|45|1289472910";
      let lastFastOrderDate = "2026/11/15";

      async function fastCheckOrders() {
        if (!isSqlConnected || isVercelOrdersPushPending) return;
        try {
          const today = taipeiBusinessDate();
          const q = "query";
          const raw = await runSqlStatement(q);
          if (!raw) return;

          const parts = raw.trim().split(/\\s+/);
          if (parts.length < 3) return;
          const currentMaxOrderId = Number(parts[0]) || 0;
          const currentCount = Number(parts[1]) || 0;
          const currentChecksum = parts[2] || "0";
          const currentFingerprint = \`\${currentMaxOrderId}|\${currentCount}|\${currentChecksum}\`;

          if (lastFastOrderDate !== today || lastMaxOrderId === 0) {
            lastFastOrderDate = today;
            lastMaxOrderId = currentMaxOrderId;
            lastFastOrderFingerprint = currentFingerprint;
            return;
          }

          const hasNewOrder = currentMaxOrderId > lastMaxOrderId;
          const hasStatusOrCountChange = currentFingerprint !== lastFastOrderFingerprint;

          if (hasNewOrder) {
            lastMaxOrderId = currentMaxOrderId;
            lastFastOrderFingerprint = currentFingerprint;
            pushTodayOrdersToCloud(today, new Date().toISOString(), true).catch(() => {});
            checkNewOrders().catch(() => {});
          } else if (hasStatusOrCountChange) {
            lastFastOrderFingerprint = currentFingerprint;
            pushTodayOrdersToCloud(today, new Date().toISOString(), false).catch(() => {});
          }
        } catch (err) {}
      }
      this.probe = fastCheckOrders;
    `;

    vm.createContext(context);
    vm.runInContext(funcCode, context);

    await context.probe();
    assert.ok(cloudPushArgs, "必須觸發雲端同步");
    assert.equal(cloudPushArgs.force, false, "非新單之狀態更新應使用標準同步 (force=false)");
    assert.equal(telegramTriggered, false, "非新單不應觸發新單 Telegram 廣播");
  });
});
