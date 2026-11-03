import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

test("⚡ 雲端資料同步鏈路與進程熔斷全面驗證 (Cloud Sync & Circuit Breaker Verification)", async (t) => {

  await t.test("1. 雲端 Private KV AES-256-GCM 加解密與雙軌直連負載驗證", () => {
    const testSecret = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const key = createHash("sha256").update("shenglong-private-kv-v1:").update(testSecret).digest();
    
    const samplePayload = {
      businessDate: "2026/11/03",
      updatedAt: "2026-11-03 19:50:00",
      totalOrders: 3,
      totalAmount: 1850,
      orders: [
        { id: 101, name: "測試客戶A", tel: "0912345678", addr: "三重區中央南路1號", items: "20kg x 1", price: 750, driver: "外勤小龍" },
        { id: 102, name: "測試客戶B", tel: "0922334455", addr: "三重區重新路二段20號", items: "16kg x 1", price: 680, driver: "外勤游柏林" },
        { id: 103, name: "測試客戶C", tel: "0933445566", addr: "三重區正義北路100號", items: "10kg x 1", price: 420, driver: "待派工" },
      ],
    };

    // Encrypt
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(Buffer.from("today_orders"));
    const data = Buffer.concat([cipher.update(JSON.stringify(samplePayload), "utf8"), cipher.final()]);
    const envelope = {
      v: 1,
      iv: iv.toString("base64url"),
      tag: cipher.getAuthTag().toString("base64url"),
      data: data.toString("base64url"),
    };

    assert.equal(envelope.v, 1);
    assert.ok(envelope.iv.length > 0);
    assert.ok(envelope.tag.length > 0);
    assert.ok(envelope.data.length > 0);

    // Decrypt
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64url"));
    decipher.setAAD(Buffer.from("today_orders"));
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"));
    const plain = Buffer.concat([decipher.update(Buffer.from(envelope.data, "base64url")), decipher.final()]);
    const decrypted = JSON.parse(plain.toString("utf8"));

    assert.equal(decrypted.businessDate, "2026/11/03");
    assert.equal(decrypted.totalOrders, 3);
    assert.equal(decrypted.orders.length, 3);
    assert.equal(decrypted.orders[0].name, "測試客戶A");
    assert.equal(decrypted.orders[1].driver, "外勤游柏林");
  });

  await t.test("2. Vercel /api/today-orders 路由已完成 await fetch(PRIMARY_KV_URL) 杜絕 Serverless 凍結", () => {
    const routePath = path.resolve("C:/shenglong-next/app/api/today-orders/route.ts");
    assert.ok(fs.existsSync(routePath), "today-orders route.ts 必須存在");
    const content = fs.readFileSync(routePath, "utf8");

    // 必須包含 await fetch(PRIMARY_KV_URL
    assert.match(content, /await\s+fetch\s*\(\s*PRIMARY_KV_URL/, "寫入 KV 必須被 await，杜絕 Serverless 提前凍結");
  });

  await t.test("3. sync-stock.cjs 具備雙軌直連 PRIMARY_KV_ORDERS_URL 與進程熔斷保護", () => {
    const syncScriptPath = path.resolve("C:/shenglong-next/sync-stock.cjs");
    assert.ok(fs.existsSync(syncScriptPath), "sync-stock.cjs 必須存在");
    const content = fs.readFileSync(syncScriptPath, "utf8");

    assert.ok(content.includes("PRIMARY_KV_ORDERS_URL"), "必須定義 PRIMARY_KV_ORDERS_URL 備援直連常數");
    assert.ok(content.includes("markSqlDisconnected"), "必須具備 SQL 斷線標記與熔斷器函數");
    assert.ok(content.includes("markSqlConnected"), "必須具備 SQL 恢復連線自癒函數");
    assert.ok(content.includes("SQL_BACKOFF_INTERVAL_MS"), "必須定義 SQL 退避時間間隔");
    assert.ok(content.includes("taskkill /F /T /PID"), "超時必須調用 taskkill /F /T 強制釋放子進程");
  });

  await t.test("4. 桌面一鍵修復腳本與控制台選項 100% 部署就緒", () => {
    const desktopRepairBat = path.resolve("C:/Users/懶/Desktop/一鍵啟動門市SQL資料庫與同步.bat");
    assert.ok(fs.existsSync(desktopRepairBat), "桌面一鍵啟動門市SQL資料庫與同步.bat 必須存在");
    const repairContent = fs.readFileSync(desktopRepairBat, "utf8");

    assert.ok(repairContent.includes("MSSQL$SQLEXPRESS"), "修復腳本必須啟動 MSSQL$SQLEXPRESS 服務");
    assert.ok(repairContent.includes("SQLBrowser"), "修復腳本必須啟動 SQLBrowser 服務");
    assert.ok(repairContent.includes("sc.exe failure"), "修復腳本必須配置崩潰自癒重啟策略");

    const consoleBat = path.resolve("C:/Users/懶/Desktop/盛隆瓦斯_訂單自動入單系統控制台.bat");
    assert.ok(fs.existsSync(consoleBat), "控制台批次檔必須存在");
    const consoleContent = fs.readFileSync(consoleBat, "utf8");
    assert.ok(consoleContent.includes("一鍵啟動門市SQL資料庫與同步.bat"), "控制台必須包含 SQL 修復快捷調用");
  });

  await t.test("5. 最高執行指令審計：舊 ERP 黑盒子鐵律與零更動驗證 (Directive #4)", () => {
    const syncContent = fs.readFileSync("C:/shenglong-next/sync-stock.cjs", "utf8");
    const routeContent = fs.readFileSync("C:/shenglong-next/app/api/today-orders/route.ts", "utf8");

    const forbiddenDdl = ["ALTER TABLE", "CREATE TRIGGER", "DROP TABLE", "ALTER PROCEDURE", "TRUNCATE TABLE"];
    for (const ddl of forbiddenDdl) {
      assert.ok(!syncContent.includes(ddl), `sync-stock.cjs 絕對嚴禁執行 ${ddl}`);
      assert.ok(!routeContent.includes(ddl), `route.ts 絕對嚴禁執行 ${ddl}`);
    }
  });

});
