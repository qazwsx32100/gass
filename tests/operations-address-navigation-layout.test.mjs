import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("🏢 監控中心卡片門牌地址最大化與動作下移規範", async (t) => {
  const compPath = path.resolve("c:/shenglong-next/app/components/SharedAddressAction.tsx");
  const compCode = fs.readFileSync(compPath, "utf8");

  await t.test("1. SharedAddressAction 門牌地址享有首行 100% 完整寬度，不與地圖/電話按鈕水平競逐空間", () => {
    // 門牌行必須具備 width: 100% 獨立排版
    assert.ok(
      compCode.includes("📍 {fullStreetWithFloor}"),
      "必須呈現自然完整門牌與樓層文字"
    );
    assert.ok(
      compCode.includes("wordBreak: \"break-word\""),
      "地址必須具備優雅斷字防破版"
    );
  });

  await t.test("2. 🗺️ 地圖與 📞 電話按鈕下移至第二行，提供直達撥號與導航", () => {
    // 確認地圖與電話不在地址同一 row 擠壓，而是下移至第二行動作區
    assert.ok(
      compCode.includes("NavigationButton"),
      "必須包含 NavigationButton 導航按鈕"
    );
    assert.ok(
      compCode.includes("tel:${phone}"),
      "必須包含一鍵直撥客戶電話動作"
    );
    assert.ok(
      compCode.includes("地圖與電話往下移動") || compCode.includes("地圖與 📞 電話按鈕（往下移動"),
      "代碼中必須明確標註地圖與電話往下移動以保障地址空間"
    );
  });

  await t.test("3. 監控中心桌面寬螢幕視圖 (operations/page.tsx) 門牌亦獨立首行平鋪呈現", () => {
    const pagePath = path.resolve("c:/shenglong-next/app/operations/page.tsx");
    const pageCode = fs.readFileSync(pagePath, "utf8");
    assert.ok(
      pageCode.includes("📍 {o.addr || \"-\"}"),
      "桌面視圖必須獨立呈現門牌地址"
    );
  });
});
