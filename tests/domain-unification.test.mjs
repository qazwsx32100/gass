import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Domain Unification & Public Stock Guard: zero -phi, gas-stock unified to shenglong.vercel.app/gas-stock", () => {
  const forbiddenPhi = ["shenglong-next-phi", "vercel", "app"].join(".");
  const legacySubdomain = ["shenglong-next", "vercel", "app"].join(".");
  const officialDomain = "shenglong.vercel.app";

  assert.equal(
    fs.existsSync("c:/shenglong-next/app/gas-stock/page.tsx"),
    true,
    "app/gas-stock/page.tsx must exist in shenglong-next",
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
    [
      "C:/Users/懶/Desktop/盛隆瓦斯_正式系統規格資產全集/03_系統入口與控制台/盛隆瓦斯_戰情客戶搜尋中樞.url",
      "C:/Users/懶/Desktop/盛隆瓦斯_戰情客戶搜尋中樞.url",
    ].find((p) => fs.existsSync(p)) || "C:/Users/懶/Desktop/盛隆瓦斯_正式系統規格資產全集/03_系統入口與控制台/盛隆瓦斯_戰情客戶搜尋中樞.url",
    [
      "C:/Users/懶/Desktop/盛隆瓦斯_正式系統規格資產全集/03_系統入口與控制台/盛隆瓦斯_系統導航總入口.html",
      "C:/Users/懶/Desktop/盛隆瓦斯_系統導航總入口.html",
    ].find((p) => fs.existsSync(p)) || "C:/Users/懶/Desktop/盛隆瓦斯_正式系統規格資產全集/03_系統入口與控制台/盛隆瓦斯_系統導航總入口.html",
  ];

  for (const file of criticalFiles) {
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, "utf8");
    assert.ok(
      !content.includes(forbiddenPhi),
      `Forbidden -phi domain found in ${path.basename(file)}`,
    );
    assert.ok(
      !content.includes(legacySubdomain),
      `Unexpected shenglong-next.vercel.app reference found in ${path.basename(file)}`,
    );
    assert.ok(
      content.includes(officialDomain),
      `Official shenglong.vercel.app domain must be present in ${path.basename(file)}`,
    );
  }
});
