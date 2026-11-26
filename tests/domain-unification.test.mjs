import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Domain Unification & Public Stock Guard: zero -phi, gas-stock unified to shenglong.vercel.app/gas-stock", () => {
  const forbiddenPhi = ["shenglong-next-phi", "vercel", "app"].join(".");
  const legacySubdomain = ["shenglong-next", "vercel", "app"].join(".");
  const officialDomain = "shenglong.vercel.app";

  const nextRoot = fs.existsSync("d:/test/shenglong-next") ? "d:/test/shenglong-next" : "c:/shenglong-next";
  const gassRoot = fs.existsSync("d:/test/gass") ? "d:/test/gass" : "c:/Gass";

  assert.equal(
    fs.existsSync(`${nextRoot}/app/gas-stock/page.tsx`),
    true,
    "app/gas-stock/page.tsx must exist in shenglong-next",
  );
  assert.equal(
    fs.existsSync(`${nextRoot}/app/customers/page.tsx`),
    true,
    "Standalone open customer search page app/customers/page.tsx must exist",
  );

  const criticalFiles = [
    `${gassRoot}/api/line-webhook.js`,
    `${gassRoot}/api/telegram-webhook.js`,
    `${gassRoot}/api/_telegram.js`,
    `${nextRoot}/sync-stock.cjs`,
    `${nextRoot}/advisor-bot.cjs`,
    `${nextRoot}/heartbeat-emitter.cjs`,
    `${nextRoot}/remote-access-reporter.cjs`,
    `${nextRoot}/scripts/build-all-apks.cjs`,
    `${nextRoot}/app/operations/page.tsx`,
    `${nextRoot}/app/driver/page.tsx`,
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
