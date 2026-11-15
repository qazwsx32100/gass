import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("🛡️ 司機端訂單畫面 排版順序 ＆ 結單 ＆ 按鈕移除圖片 ＆ 配送中刪除 ＆ 來電電話優先檢驗", async (t) => {
  let driverRoutePath = path.resolve("../shenglong-next/app/api/driver/orders/route.ts");
  let driverPagePath = path.resolve("../shenglong-next/app/driver/page.tsx");

  if (!fs.existsSync(driverRoutePath) || !fs.existsSync(driverPagePath)) {
    driverRoutePath = "C:/shenglong-next/app/api/driver/orders/route.ts";
    driverPagePath = "C:/shenglong-next/app/driver/page.tsx";
  }

  assert.ok(fs.existsSync(driverRoutePath), "app/api/driver/orders/route.ts 必須存在");
  assert.ok(fs.existsSync(driverPagePath), "app/driver/page.tsx 必須存在");

  const pageContent = fs.readFileSync(driverPagePath, "utf8");

  await t.test("1. 電話的部分 優先以打來的電話為主，顯示「來電電話：」", () => {
    assert.match(pageContent, /function formatPhoneNumber/);
    assert.match(pageContent, /📞 來電電話：/);
    assert.match(pageContent, /href=\{`tel:\$\{incomingPhoneDial\}`\}/);
    assert.match(pageContent, /incomingPhoneDisplay/);
  });

  await t.test("2. 其他電話是備註裡的電話，僅讀取市話與手機資訊並支援直撥", () => {
    assert.match(pageContent, /function extractOtherPhoneNumbers/);
    assert.match(pageContent, /📞 其他電話：/);
    assert.match(pageContent, /href=\{`tel:\$\{cleanDigits\}`\}/);
    assert.match(pageContent, /09\\d\{2\}/);
  });

  await t.test("3. 司機訂單 第一行右側「配送中」狀態標籤刪除不顯示", () => {
    // 確保第一行狀態不出現「配送中」
    assert.doesNotMatch(pageContent, /🚚 配送中/);
    assert.match(pageContent, /依指示「已送達」與「配送中」皆刪除不顯示/);
  });

  await t.test("4. 第一行順序：1.桶子規格 2.金額 3.請挑桶 全部置左", () => {
    assert.match(pageContent, /全部置左：1\. 桶子規格\(綠框\) 2\. 金額 3\. 請挑桶\(黃框\)/);
    // 檢查順序：規格在前，金額居中，請挑桶在後
    const specIdx = pageContent.indexOf('{o.items || (o.totalBottles');
    const priceIdx = pageContent.indexOf('${totalDisplayPrice || 0}');
    const pickIdx = pageContent.indexOf('⚠️ 請挑桶');
    assert.ok(specIdx !== -1 && priceIdx !== -1 && pickIdx !== -1, "三者必須在第一行存在");
    assert.ok(specIdx < priceIdx, "1. 桶子規格必須在 2. 金額之前");
    assert.ok(priceIdx < pickIdx, "2. 金額必須在 3. 請挑桶之前");
  });

  await t.test("5. 本次備註名稱改成「訂單備註」", () => {
    assert.match(pageContent, /📝 訂單備註：/);
    assert.match(pageContent, /\{o\.orderRemarks\.trim\(\)\}/);
    assert.doesNotMatch(pageContent, /📝 本次備註：/);
  });

  await t.test("6. 地址只放路名門牌，地址後面的備註與客戶名稱放在下一行同一行，且刪除「客戶」二字", () => {
    assert.match(pageContent, /📍/);
    assert.match(pageContent, /addrParts\.main \|\| o\.addr/);
    assert.match(pageContent, /👤 \{o\.name \|\| "一般客戶"\}/);
    assert.doesNotMatch(pageContent, /👤 客戶：/);
    assert.match(pageContent, /🏷️ \{addrParts\.extra\}/);
  });

  await t.test("7. 請挑桶顯示天數且呈現黃色框框", () => {
    assert.match(pageContent, /hasPickAlert && \(/);
    assert.match(pageContent, /2px solid #f59e0b/);
    assert.match(pageContent, /#fef3c7/);
    assert.match(pageContent, /⚠️ 請挑桶\{maxPickDays \? ` \$\{maxPickDays\}天` : ""\}/);
    assert.match(pageContent, /fontSize:\s*"16\.5px"/);
  });

  await t.test("8. 完成訂單 右下角的「結單」標籤刪除不顯示", () => {
    assert.doesNotMatch(pageContent, />\s*結單\s*<\/span>/);
    assert.doesNotMatch(pageContent, /✓ 已送達完成/);
  });

  await t.test("9. 導航、電話、回報 刪除圖片（無圖示 emoji，純文字按鈕）", () => {
    // 檢查卡片底部導航、電話、回報純文字標籤存在
    assert.match(pageContent, />\s*<span>導航<\/span>\s*<\/a>/);
    assert.match(pageContent, />\s*<span>電話<\/span>\s*<\/a>/);
    assert.match(pageContent, />\s*<span>\{hasReport \? "已回報" : "回報"\}<\/span>\s*<\/button>/);
    // 確保卡片按鈕內無圖示
    assert.doesNotMatch(pageContent, /href=\{navUrl\}[\s\S]*?>🗺️<\/span>/);
    assert.doesNotMatch(pageContent, /href=\{`tel:\$\{dialTel\}`\}[\s\S]*?>📞<\/span>/);
  });

  await t.test("10. 回報 下方防覆蓋安全保護標語 刪除", () => {
    assert.doesNotMatch(pageContent, /<strong>防覆蓋安全保護：<\/strong>/);
    assert.doesNotMatch(pageContent, /現場回報資料將送達調度台，由管理員在後台確認後手動儲存客戶備註/);
    assert.match(pageContent, /依指示：現場狀況回報下方防覆蓋安全保護標語已刪除/);
  });

  await t.test("11. 今日運費 後面的 | 刪除", () => {
    assert.match(pageContent, /<span>💰 今日運費：<\/span>/);
    assert.match(pageContent, /依指示：今日運費後方 \| 已刪除/);
    assert.doesNotMatch(pageContent, />💰 今日運費：[\s\S]*?<span>｜<\/span>[\s\S]*?今日樓層費/);
  });

  await t.test("12. 字體選擇的部分 先隱藏", () => {
    assert.match(pageContent, /依指示：字體選擇的部分 先隱藏/);
    assert.match(pageContent, /五段式字體切換[\s\S]*?\{false && \(/);
  });

  await t.test("13. 訂單金額顯示為總金額（瓦斯費＋樓層費），且訂單右下角顯示 運費$70 樓層費$30", () => {
    assert.match(pageContent, /totalDisplayPrice/);
    assert.match(pageContent, /gasPrice \+ floorFee/);
    assert.match(pageContent, /運費\s*\$\{comm\}/);
    assert.match(pageContent, /樓層費\s*\$\{floorFee\}/);
  });

  await t.test("14. 依指示：[ ✅ 送達收款 ] 刪除", () => {
    assert.doesNotMatch(pageContent, />\s*送達收款\s*<\/span>/);
    assert.match(pageContent, /依指示：\[ ✅ 送達收款 \] 刪除/);
  });

  await t.test("15. 依指示：新的訂單下方也必定要有 導航 電話 回報", () => {
    assert.match(pageContent, /依指示：新的訂單下方也必定要有 導航 電話 回報/);
    assert.match(pageContent, />\s*<span>導航<\/span>\s*<\/a>/);
    assert.match(pageContent, />\s*<span>電話<\/span>\s*<\/a>/);
    assert.match(pageContent, />\s*<span>電話<\/span>\s*<\/button>/);
    assert.match(pageContent, />\s*<span>\{hasReport \? "已回報" : "回報"\}<\/span>\s*<\/button>/);
    // 新單懸浮橫幅亦包含導航、電話、回報
    assert.match(pageContent, /新派單到達即時懸浮大橫幅[\s\S]*?依指示：新的訂單 下方也要有 導航 電話 回報/);
  });
  await t.test("16. 依指示：卡片上的距離標籤拿掉不顯示", () => {
    assert.doesNotMatch(pageContent, /formatDistanceMeters\(getDistanceMeters/);
    assert.match(pageContent, /依(?:老闆)?指示：距離標籤刪除不顯示/);
  });
});
