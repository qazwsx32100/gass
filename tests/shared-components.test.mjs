import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { extractOrderSpecs, parseAddressForMobile } from "../lib/mobile-order-parser.js";

test("🧩 Shared Components: 規格膠囊標準配色與多規格萃取 (SharedGasSpecBadges)", () => {
  const o50 = { raw50: 1, raw20: 2 };
  const chips = extractOrderSpecs(o50);
  assert.equal(chips.length, 2);
  assert.equal(chips[0].spec, "50kg");
  assert.equal(chips[0].color, "#9333ea");
  assert.equal(chips[1].spec, "20kg");
  assert.equal(chips[1].color, "#16a34a");

  // 單純 items 文字備援
  const oStr = { items: "16公斤*3, 10公斤*1, 4kg*1" };
  const chipsStr = extractOrderSpecs(oStr);
  assert.equal(chipsStr.length, 3);
  assert.equal(chipsStr[0].spec, "16kg");
  assert.equal(chipsStr[0].color, "#2563eb");
  assert.equal(chipsStr[1].spec, "10kg");
  assert.equal(chipsStr[1].color, "#ea580c");
  assert.equal(chipsStr[2].spec, "4kg");
  assert.equal(chipsStr[2].color, "#db2777");
});

test("🧩 Shared Components: 18px 門牌與樓層高對比分離 (SharedAddressAction)", () => {
  const addr = "新北市三重區重新路四段120號5樓之1";
  const parsed = parseAddressForMobile(addr);
  assert.equal(parsed.isSanchong, true);
  assert.equal(parsed.streetAndNumber, "重新路四段120號");
  assert.equal(parsed.floor, "5樓之1");

  const addrOuter = "新北市五股區成泰路三段88號1樓";
  const parsedOuter = parseAddressForMobile(addrOuter);
  assert.equal(parsedOuter.isSanchong, false);
  assert.equal(parsedOuter.district, "五股區");
  assert.equal(parsedOuter.streetAndNumber, "成泰路三段88號");
  assert.equal(parsedOuter.floor, "1樓");
});

test("🧩 Shared Components: SharedOrderCard 程式碼規範與派工動作列", () => {
  const compPath = path.join(process.cwd(), "../shenglong-next/app/components/SharedOrderCard.tsx");
  assert.ok(fs.existsSync(compPath), "SharedOrderCard.tsx 必須存在");

  const compContent = fs.readFileSync(compPath, "utf8");
  assert.ok(compContent.includes("SharedGasSpecBadges"), "必須引用 SharedGasSpecBadges");
  assert.ok(compContent.includes("SharedAddressAction"), "必須引用 SharedAddressAction");
  assert.ok(compContent.includes("SharedDispatcherSelector"), "必須引用 SharedDispatcherSelector (派小龍/派柏林/稍後輸入)");
  assert.ok(compContent.includes("SharedOrderStatusBadge"), "必須引用 SharedOrderStatusBadge");
  assert.ok(compContent.includes("✅ 送達收現"), "必須包含送達收現按鈕");
  assert.ok(compContent.includes("📝 月結完單"), "必須包含月結完單按鈕");
  assert.ok(compContent.includes("variant"), "必須支援 variant 多態");
});

test("🧩 Shared Components: 監控中心全面落地掛載 SharedOrderCard", () => {
  const opsPath = path.join(process.cwd(), "../shenglong-next/app/operations/page.tsx");
  const opsContent = fs.readFileSync(opsPath, "utf8");

  assert.ok(opsContent.includes("<SharedOrderCard"), "Operations 頁面必須掛載 <SharedOrderCard");
  assert.ok(opsContent.includes("SharedGasSpecBadges"), "Operations 頁面必須引用 SharedGasSpecBadges");
  assert.ok(opsContent.includes("SharedAddressAction"), "Operations 頁面必須引用 SharedAddressAction");
  assert.ok(opsContent.includes("<SharedCustomerHistoryModal"), "Operations 頁面必須掛載 <SharedCustomerHistoryModal");
  assert.ok(opsContent.includes("<ModernWarRoomView"), "Operations 頁面必須掛載 <ModernWarRoomView");
});

test("🧩 Shared Components: 歷史訂單紀錄全面落地掛載 SharedOrderCard (variant=history)", () => {
  const histPath = path.join(process.cwd(), "../shenglong-next/app/components/OperationsOrderHistoryView.tsx");
  const histContent = fs.readFileSync(histPath, "utf8");

  assert.ok(histContent.includes("<SharedOrderCard"), "歷史視圖必須掛載 <SharedOrderCard");
  assert.ok(histContent.includes('variant="history"'), "歷史視圖必須指定 variant=history");
});

test("🧩 Shared Components: 外勤同仁 App 掛載 SharedGasSpecBadges", () => {
  const driverPath = path.join(process.cwd(), "../shenglong-next/app/driver/page.tsx");
  const driverContent = fs.readFileSync(driverPath, "utf8");

  assert.ok(driverContent.includes("<SharedGasSpecBadges"), "外勤同仁 App 必須掛載 <SharedGasSpecBadges");
});

test("🧩 Shared Components (P1): 統一訂單狀態色標膠囊 (SharedOrderStatusBadge)", () => {
  const badgePath = path.join(process.cwd(), "../shenglong-next/app/components/SharedOrderStatusBadge.tsx");
  assert.ok(fs.existsSync(badgePath), "SharedOrderStatusBadge.tsx 檔案必須存在");

  const badgeContent = fs.readFileSync(badgePath, "utf8");
  assert.ok(badgeContent.includes("OrderStatusType"), "必須定義 OrderStatusType 介面");
  assert.ok(badgeContent.includes("delivered"), "必須支援 delivered (已送達)");
  assert.ok(badgeContent.includes("monthly"), "必須支援 monthly (月結)");
  assert.ok(badgeContent.includes("delivering"), "必須支援 delivering (外送中)");
  assert.ok(badgeContent.includes("later"), "必須支援 later (稍後輸入)");
  assert.ok(badgeContent.includes("pending"), "必須支援 pending (待派單)");
  assert.ok(badgeContent.includes("cancelled"), "必須支援 cancelled (已取消/作廢)");

  // 驗證 SharedOrderCard 已整合 SharedOrderStatusBadge
  const cardPath = path.join(process.cwd(), "../shenglong-next/app/components/SharedOrderCard.tsx");
  const cardContent = fs.readFileSync(cardPath, "utf8");
  assert.ok(cardContent.includes("SharedOrderStatusBadge"), "SharedOrderCard 必須整合引用 SharedOrderStatusBadge");
  assert.ok(cardContent.includes("<SharedOrderStatusBadge"), "SharedOrderCard 必須實裝掛載 <SharedOrderStatusBadge");
});

test("🧩 Shared Components (P1): 外送員派工選擇切換器 (SharedDispatcherSelector)", () => {
  const selectorPath = path.join(process.cwd(), "../shenglong-next/app/components/SharedDispatcherSelector.tsx");
  assert.ok(fs.existsSync(selectorPath), "SharedDispatcherSelector.tsx 檔案必須存在");

  const selectorContent = fs.readFileSync(selectorPath, "utf8");
  assert.ok(selectorContent.includes("SharedDispatcherSelectorProps"), "必須定義組件屬性介面");
  assert.ok(selectorContent.includes("🛵 派小龍"), "必須包含派小龍按鈕");
  assert.ok(selectorContent.includes("🛵 派柏林"), "必須包含派柏林按鈕");
  assert.ok(selectorContent.includes("⏳ 稍後輸入"), "必須包含稍後輸入按鈕");
  assert.ok(selectorContent.includes("minHeight: \"40px\""), "按鈕必須符合 40px+ 拇指熱區規範");
  assert.ok(selectorContent.includes("triggerHaptic"), "必須支援觸覺震動回饋");

  // 驗證 SharedOrderCard 已整合 SharedDispatcherSelector
  const cardPath = path.join(process.cwd(), "../shenglong-next/app/components/SharedOrderCard.tsx");
  const cardContent = fs.readFileSync(cardPath, "utf8");
  assert.ok(cardContent.includes("SharedDispatcherSelector"), "SharedOrderCard 必須整合引用 SharedDispatcherSelector");
  assert.ok(cardContent.includes("<SharedDispatcherSelector"), "SharedOrderCard 必須實裝掛載 <SharedDispatcherSelector");
});
