import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Domain Unification Guard: zero residual -phi or legacy shenglong-next.vercel.app in runtime code", () => {
  const forbiddenPhi = ["shenglong-next-phi", "vercel", "app"].join(".");
  const forbiddenGhost = ["shenglong-next", "vercel", "app"].join(".");
  const officialDomain = "shenglong.vercel.app";

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
    "c:/shenglong-next/app/gas-stock/page.tsx",
    "C:/Users/懶/Desktop/盛隆瓦斯_戰情客戶搜尋中樞.url",
    "C:/Users/懶/Desktop/盛隆瓦斯_系統導航總入口.html",
  ];

  for (const file of criticalFiles) {
    assert.ok(fs.existsSync(file), `Expected file to exist: ${file}`);
    const content = fs.readFileSync(file, "utf8");
    assert.ok(
      !content.includes(forbiddenPhi),
      `Forbidden -phi domain found in ${path.basename(file)}`
    );
    assert.ok(
      !content.includes(forbiddenGhost),
      `Forbidden ghost shenglong-next.vercel.app domain found in ${path.basename(file)}`
    );
    assert.ok(
      content.includes(officialDomain),
      `Official shenglong.vercel.app domain must be present in ${path.basename(file)}`
    );
  }
});
