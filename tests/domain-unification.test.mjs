import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Domain Unification & Public Stock Isolation Guard: zero -phi, gas-stock isolated to shenglong-next.vercel.app/gas-stock", () => {
  const forbiddenPhi = ["shenglong-next-phi", "vercel", "app"].join(".");
  const legacySubdomain = ["shenglong-next", "vercel", "app"].join(".");
  const allowedPublicStockUrl = `${legacySubdomain}/gas-stock`;
  const officialDomain = "shenglong.vercel.app";

  // 依老闆指示：shenglong.vercel.app/gas-stock 頁面已刪除，改由 308 自動轉址至 shenglong-next.vercel.app/gas-stock
  assert.equal(
    fs.existsSync("c:/shenglong-next/app/gas-stock/page.tsx"),
    false,
    "app/gas-stock/page.tsx should be deleted from shenglong-next",
  );
  assert.equal(
    fs.existsSync("c:/shenglong-next/app/customers/page.tsx"),
    true,
    "Standalone open customer search page app/customers/page.tsx must exist",
  );

  const criticalFiles = [
    "c:/Gass/api/line-webhook.js",
    "c:/Gass/api/telegram-webhook.js",
    "c:/Gass/api/_telegram.js",
    "c:/shenglong-next/sync-stock.cjs",
    "c:/shenglong-next/advisor-bot.cjs",
    "c:/shenglong-next/heartbeat-emitter.cjs",
    "c:/shenglong-next/remote-access-reporter.cjs",
    "c:/shenglong-next/scripts/build-all-apks.cjs",
    "c:/shenglong-next/app/operations/page.tsx",
    "c:/shenglong-next/app/driver/page.tsx",
    "C:/Users/懶/Desktop/盛隆瓦斯_戰情客戶搜尋中樞.url",
    "C:/Users/懶/Desktop/盛隆瓦斯_系統導航總入口.html",
  ];

  for (const file of criticalFiles) {
    assert.ok(fs.existsSync(file), `Expected file to exist: ${file}`);
    const content = fs.readFileSync(file, "utf8");
    assert.ok(
      !content.includes(forbiddenPhi),
      `Forbidden -phi domain found in ${path.basename(file)}`,
    );

    // 移除唯一允許之公開庫存網址後，不得殘留任何其他 shenglong-next.vercel.app 連結
    const stripped = content.replaceAll(allowedPublicStockUrl, "");
    assert.ok(
      !stripped.includes(legacySubdomain),
      `Unexpected shenglong-next.vercel.app reference (non gas-stock) found in ${path.basename(file)}`,
    );
    assert.ok(
      content.includes(officialDomain),
      `Official shenglong.vercel.app domain must be present in ${path.basename(file)}`,
    );
  }
});
