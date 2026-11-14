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
  assert.ok(!selectorContent.includes("🛵 派柏林"), "已徹底除名移除派柏林按鈕");
  assert.ok(selectorContent.includes("⏳ 稍後輸入"), "必須包含稍後輸入按鈕");
  assert.ok(selectorContent.includes("minHeight: \"40px\""), "按鈕必須符合 40px+ 拇指熱區規範");
  assert.ok(selectorContent.includes("triggerHaptic"), "必須支援觸覺震動回饋");

  // 驗證 SharedOrderCard 已整合 SharedDispatcherSelector
  const cardPath = path.join(process.cwd(), "../shenglong-next/app/components/SharedOrderCard.tsx");
  const cardContent = fs.readFileSync(cardPath, "utf8");
  assert.ok(cardContent.includes("SharedDispatcherSelector"), "SharedOrderCard 必須整合引用 SharedDispatcherSelector");
  assert.ok(cardContent.includes("<SharedDispatcherSelector"), "SharedOrderCard 必須實裝掛載 <SharedDispatcherSelector");
});

test("🧩 Shared Components (P1): 現場收款與空瓶回收面板 (SharedDeliveryCollectionModal)", () => {
  const modalPath = path.join(process.cwd(), "../shenglong-next/app/components/SharedDeliveryCollectionModal.tsx");
  assert.ok(fs.existsSync(modalPath), "SharedDeliveryCollectionModal.tsx 檔案必須存在");

  const modalContent = fs.readFileSync(modalPath, "utf8");
  assert.ok(modalContent.includes("SharedDeliveryCollectionModalProps"), "必須定義組件屬性介面");
  assert.ok(modalContent.includes("isDoubleBottle"), "必須支援單雙桶客戶辨識");
  assert.ok(modalContent.includes("collectedAmount"), "必須支援實收金額輸入");
  assert.ok(modalContent.includes("emptyReturned"), "必須支援空瓶回收計數");
  assert.ok(modalContent.includes("200000"), "必須遵守 20 萬元防爆鉗制");
  assert.ok(modalContent.includes("50"), "必須遵守 50 支空瓶防爆鉗制");

  // 驗證 SharedOrderCard 已整合 SharedDeliveryCollectionModal
  const cardPath = path.join(process.cwd(), "../shenglong-next/app/components/SharedOrderCard.tsx");
  const cardContent = fs.readFileSync(cardPath, "utf8");
  assert.ok(cardContent.includes("SharedDeliveryCollectionModal"), "SharedOrderCard 必須整合引用 SharedDeliveryCollectionModal");
  assert.ok(cardContent.includes("<SharedDeliveryCollectionModal"), "SharedOrderCard 必須實裝掛載 <SharedDeliveryCollectionModal");
});

test("🧩 Shared Components (P1): 外勤端 App 結單收款與空瓶回收無縫整合 (Driver App Collection Modal)", () => {
  const driverPagePath = path.join(process.cwd(), "../shenglong-next/app/driver/page.tsx");
  assert.ok(fs.existsSync(driverPagePath), "app/driver/page.tsx 檔案必須存在");

  const driverContent = fs.readFileSync(driverPagePath, "utf8");
  assert.ok(driverContent.includes("SharedDeliveryCollectionModal"), "外勤端必須導入 SharedDeliveryCollectionModal");
  assert.ok(driverContent.includes("collectionTargetOrder"), "外勤端必須維護結單彈窗目標訂單狀態");
  assert.ok(driverContent.includes("<SharedDeliveryCollectionModal"), "外勤端必須實裝掛載 <SharedDeliveryCollectionModal");
  assert.ok(driverContent.includes("handleFinishOrder(targetId, {"), "外勤端確認送達必須傳遞收款與空瓶明細至 handleFinishOrder");
  assert.ok(driverContent.includes("payload?:"), "離線寄件匣 OutboxAction 必須支援 payload 持久化暫存");
  assert.ok(driverContent.includes("isOfflineReplay"), "離線補傳邏輯必須帶上 emptyReturned 與 collectedAmount");
});

test("🧩 Shared Components (P2): 雙桶戶壓瓶標籤與外勤歷史速查 (Double Bottle Badge & Driver History Modal)", () => {
  // 1. 驗證 SharedGasSpecBadges 雙桶戶標籤支援
  const badgesPath = path.join(process.cwd(), "../shenglong-next/app/components/SharedGasSpecBadges.tsx");
  const badgesContent = fs.readFileSync(badgesPath, "utf8");
  assert.ok(badgesContent.includes("isDoubleBottle"), "規格膠囊必須支援雙桶戶辨識");
  assert.ok(badgesContent.includes("雙桶戶 (壓瓶2支)"), "規格膠囊必須呈現「雙桶戶 (壓瓶2支)」膠囊");

  // 2. 驗證 SharedCustomerHistoryModal 獨立共用元件
  const historyModalPath = path.join(process.cwd(), "../shenglong-next/app/components/SharedCustomerHistoryModal.tsx");
  assert.ok(fs.existsSync(historyModalPath), "SharedCustomerHistoryModal.tsx 必須存在");
  const historyContent = fs.readFileSync(historyModalPath, "utf8");
  assert.ok(historyContent.includes("/api/customer-history"), "歷史彈窗必須介接 customer-history API");

  // 3. 驗證 Driver App 嚴格遵循外勤最高鐵律：拔除干擾彈窗，回歸專注配送
  const driverPagePath = path.join(process.cwd(), "../shenglong-next/app/driver/page.tsx");
  const driverContent = fs.readFileSync(driverPagePath, "utf8");
  assert.ok(!driverContent.includes("SharedCustomerHistoryModal"), "Driver App 依外勤最高鐵律不可含有 SharedCustomerHistoryModal 彈窗");
  assert.ok(!driverContent.includes("<span>叫貨歷史</span>"), "Driver App 依外勤最高鐵律不可含有干擾叫貨歷史按鈕");
});

test("🛵 Google Maps 定位防飄移三步全聯動 (Two Wheeler + Uber Mode + Google Maps API)", async () => {
  // 1. 驗證 navigation-address.ts 機車模式與座標導航
  const navFilePath = path.join(process.cwd(), "../shenglong-next/lib/navigation-address.ts");
  assert.ok(fs.existsSync(navFilePath), "navigation-address.ts 必須存在");
  const navContent = fs.readFileSync(navFilePath, "utf8");
  assert.ok(navContent.includes('two_wheeler'), "導航必須支援 two_wheeler 兩輪機車模式");
  assert.ok(navContent.includes('destination_place_id'), "導航必須支援 destination_place_id 商業精準參數");

  // 2. 驗證 Driver App 的 Uber 自動沉澱模式與現場「標記大門」按鈕
  const driverPagePath = path.join(process.cwd(), "../shenglong-next/app/driver/page.tsx");
  const driverContent = fs.readFileSync(driverPagePath, "utf8");
  assert.ok(driverContent.includes("handleQuickPinDoor"), "外勤端必須具備 handleQuickPinDoor 現場秒存大門定位函式");
  assert.ok(driverContent.includes("Uber 模式：外勤同仁送達現場完成訂單時"), "結單時必須自動沉澱大門精準 GPS");
  assert.ok(driverContent.includes("📍 標記大門"), "訂單卡片未定點時必須提供「📍 標記大門」按鈕");
  assert.ok(driverContent.includes("travelmode=two_wheeler"), "外勤端 Google 導航必須升級為 travelmode=two_wheeler 機車模式");

  // 3. 驗證 Google Maps Platform 官方商業服務與 API 路由
  const gmsPath = path.join(process.cwd(), "../shenglong-next/lib/google-maps-service.ts");
  assert.ok(fs.existsSync(gmsPath), "lib/google-maps-service.ts 必須存在");
  const gmsContent = fs.readFileSync(gmsPath, "utf8");
  assert.ok(gmsContent.includes("geocodeAddressWithGoogle"), "必須提供 geocodeAddressWithGoogle 地址解析函式");
  assert.ok(gmsContent.includes("getRoadDistanceWithGoogle"), "必須提供 getRoadDistanceWithGoogle 實際機車路網行駛距離精算");
  assert.ok(gmsContent.includes("ROOFTOP"), "必須支援 ROOFTOP 屋頂級精準座標判定");

  const geocodeApiPath = path.join(process.cwd(), "../shenglong-next/app/api/customer/geocode/route.ts");
  assert.ok(fs.existsSync(geocodeApiPath), "app/api/customer/geocode/route.ts 必須存在");
  const geocodeContent = fs.readFileSync(geocodeApiPath, "utf8");
  assert.ok(geocodeContent.includes("geocodeAddressWithGoogle"), "Geocode API 必須呼叫 geocodeAddressWithGoogle 服務");
});

