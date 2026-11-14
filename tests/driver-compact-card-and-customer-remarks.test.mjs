import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("🛡️ 司機端訂單畫面 6 大排版修正 ＆ 移除精簡狀態標籤檢驗", async (t) => {
  let driverRoutePath = path.resolve("../shenglong-next/app/api/driver/orders/route.ts");
  let driverPagePath = path.resolve("../shenglong-next/app/driver/page.tsx");

  if (!fs.existsSync(driverRoutePath) || !fs.existsSync(driverPagePath)) {
    driverRoutePath = "C:/shenglong-next/app/api/driver/orders/route.ts";
    driverPagePath = "C:/shenglong-next/app/driver/page.tsx";
  }

  assert.ok(fs.existsSync(driverRoutePath), "app/api/driver/orders/route.ts 必須存在");
  assert.ok(fs.existsSync(driverPagePath), "app/driver/page.tsx 必須存在");

  const pageContent = fs.readFileSync(driverPagePath, "utf8");

  await t.test("1. 歷史備註名稱改為「其他電話」，僅讀取市話與手機資訊並支援直撥", () => {
    assert.match(pageContent, /function extractOtherPhoneNumbers/);
    assert.match(pageContent, /📞 其他電話：/);
    assert.match(pageContent, /href=\{`tel:\$\{cleanDigits\}`\}/);
    assert.match(pageContent, /09\\d\{2\}/);
  });

  await t.test("2. 桶子規格和金額都放在右上角，桶子規格呈現綠色框框", () => {
    assert.match(pageContent, /1\.5px solid #10b981/);
    assert.match(pageContent, /#ecfdf5/);
    assert.match(pageContent, /\{o\.items \|\| \(o\.totalBottles/);
    assert.match(pageContent, /\$\{o\.price \|\| 0\}/);
  });

  await t.test("3. 本次備註名稱改成「訂單備註」", () => {
    assert.match(pageContent, /📝 訂單備註：/);
    assert.match(pageContent, /\{o\.orderRemarks\.trim\(\)\}/);
    assert.doesNotMatch(pageContent, /📝 本次備註：/);
  });

  await t.test("4 & 6. 地址只放路名門牌，地址後面的備註 (C、備1、單等) 與客戶名稱放在下一行同一行", () => {
    assert.match(pageContent, /📍/);
    assert.match(pageContent, /addrParts\.main \|\| o\.addr/);
    assert.match(pageContent, /👤 客戶：\{o\.name \|\| "一般客戶"\}/);
    assert.match(pageContent, /🏷️ \{addrParts\.extra\}/);
  });

  await t.test("5. 時間超過 150 天挑桶訊息放第一行同行，呈現黃色框框", () => {
    assert.match(pageContent, /hasPickAlert && \(/);
    assert.match(pageContent, /1\.5px solid #f59e0b/);
    assert.match(pageContent, /#fef3c7/);
    assert.match(pageContent, /⚠️ 請挑桶/);
  });

  await t.test("6. 依老闆指示：「精簡狀態標籤 這先不用」，卡片不呈現第 5 行冗餘標籤列", () => {
    assert.doesNotMatch(pageContent, /第 5 行：資訊標籤列 \(Chips\)/);
    assert.doesNotMatch(pageContent, /🔄 現場備桶: \{currentReport\.backupCount\} 支/);
  });

  await t.test("7. 選項 A 底部按鈕排版維持完整：左側工具列 (導航/電話/回報) ＆ 右側業務按鈕 (一鍵接單/送達收款)", () => {
    assert.match(pageContent, />導航<\/span>/);
    assert.match(pageContent, />電話<\/span>/);
    assert.match(pageContent, />\{hasReport \? "已回報" : "回報"\}<\/span>/);
    assert.match(pageContent, /handleAcceptOrder\(o\.id\)/);
    assert.match(pageContent, /setCollectionTargetOrder\(o\)/);
  });
});
