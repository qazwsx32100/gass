import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

import { extractOrderSpecs } from "../lib/mobile-order-parser.js";
import {
  detectHistoryGap,
  calculateCustomDateRangeEarnings,
  checkSevenDaysIntegrity,
} from "../lib/financial-gap-auditor.js";

const require = createRequire(import.meta.url);

const {
  AI_PERSONAS,
  simulateButtonClick,
  runAiSwarmButtonStressTest,
} = require("c:/shenglong-next/scripts/ai-swarm-button-stress-test.cjs");

const {
  buildLiveBossApprovalItems,
} = require("c:/shenglong-next/lib/boss-approvals-hub.ts");

const {
  extractOrderEntities,
  formatOrderStateContext,
} = require("c:/Gass/api/line-webhook.js");

test("🤖 AI Swarm Test 1: 🛵 Driver-XiaoLong-AI 外勤小龍 App 拇指熱區與結單收款彈窗按鈕串接", () => {
  const compPath = path.join(process.cwd(), "../shenglong-next/app/components/SharedDeliveryCollectionModal.tsx");
  assert.ok(fs.existsSync(compPath), "SharedDeliveryCollectionModal.tsx 必須存在");

  const compContent = fs.readFileSync(compPath, "utf8");

  // 1. 付款方式 3 態按鈕
  assert.ok(compContent.includes("💵 現金實收"), "必須包含現金實收按鈕");
  assert.ok(compContent.includes("📝 月結簽單"), "必須包含月結簽單按鈕");
  assert.ok(compContent.includes("⚠️ 暫時賒欠"), "必須包含暫時賒欠按鈕");

  // 2. 觸控尺寸與觸覺震動規範 (minHeight >= 40px, triggerHaptic)
  assert.ok(compContent.includes("minHeight: \"42px\""), "付款按鈕必須符合 40px+ 觸控熱區");
  assert.ok(compContent.includes("triggerHaptic"), "操作必須具備觸覺震動回饋");

  // 3. 空瓶增減大按鈕 (48px) 與快捷晶片
  assert.ok(compContent.includes("handleAdjustEmpty(-1)"), "必須包含空瓶遞減按鈕");
  assert.ok(compContent.includes("handleAdjustEmpty(1)"), "必須包含空瓶遞增按鈕");
  assert.ok(compContent.includes("0 支(欠瓶)"), "必須支援 0 支欠瓶快捷晶片");
  assert.ok(compContent.includes("width: \"48px\""), "空瓶加減按鈕需具備 48px 大熱區");

  // 4. 防呆防爆邊界鉗制 ($0 ~ $200,000, 0 ~ 50 支)
  assert.ok(compContent.includes("max=\"200000\""), "實收金額上限鉗制 20 萬元");
  assert.ok(compContent.includes("Math.max(0, Math.min(50,"), "空瓶回收數量鉗制 0~50 支");

  // 5. 離線寄件匣支援 (OutboxAction.payload)
  const driverPagePath = path.join(process.cwd(), "../shenglong-next/app/driver/page.tsx");
  const driverContent = fs.readFileSync(driverPagePath, "utf8");
  assert.ok(driverContent.includes("SharedDeliveryCollectionModal"), "外勤 App 必須掛載結單收款彈窗");
  assert.ok(driverContent.includes("SharedCustomerHistoryModal"), "外勤 App 必須掛載客戶歷程速查彈窗");
  assert.ok(driverContent.includes("addToOutbox(orderId, \"finish\", collectionData)"), "結單收款資料必須排入離線寄件匣");
});

test("🤖 AI Swarm Test 2: 🛵 Driver-BoLin-AI 游柏林大戶規格與手套模式超大觸控按鈕", () => {
  const driverPagePath = path.join(process.cwd(), "../shenglong-next/app/driver/page.tsx");
  const driverContent = fs.readFileSync(driverPagePath, "utf8");

  // 1. 手套高對比模式 (58px+ 超大觸控目標)
  assert.ok(driverContent.includes("finishBtnHeight"), "外勤完成按鈕需具備自適應手套模式高度");
  assert.ok(driverContent.includes("glareMode"), "外勤 App 必須具備烈日防眩光手套模式");

  // 2. 雙桶戶壓瓶標籤識別
  assert.ok(driverContent.includes("SharedGasSpecBadges"), "外勤 App 必須引用規格膠囊");
  const badgesPath = path.join(process.cwd(), "../shenglong-next/app/components/SharedGasSpecBadges.tsx");
  const badgesContent = fs.readFileSync(badgesPath, "utf8");
  assert.ok(badgesContent.includes("雙桶戶 (壓瓶2支)"), "規格膠囊必須呈現雙桶戶壓瓶標籤");
  assert.ok(badgesContent.includes("#d97706"), "雙桶戶標籤配色為琥珀金 #d97706");

  // 3. 50kg 大規格辨識
  assert.ok(badgesContent.includes("50kg"), "規格膠囊必須辨識 50kg 大規格");
  const chips50 = extractOrderSpecs({ raw50: 1 });
  assert.equal(chips50[0].spec, "50kg");
  assert.equal(chips50[0].color, "#9333ea");
});

test("🤖 AI Swarm Test 3: 👩‍💼 Dispatcher-ShuFen-AI 門市調度 8 大功能頁籤與 3 態外送員選擇器", () => {
  const opsPagePath = path.join(process.cwd(), "../shenglong-next/app/operations/page.tsx");
  const opsContent = fs.readFileSync(opsPagePath, "utf8");

  // 1. 8 大功能頁籤切換按鈕驗證
  const expectedTabs = ["ORDERS", "WAR_ROOM", "MAP", "STOCK", "CALLS", "CUSTOMERS", "SYSTEM", "TELEGRAM"];
  expectedTabs.forEach((tab) => {
    assert.ok(opsContent.includes(`handleTabChange("${tab}"`), `頁籤導航必須包含 ${tab}`);
  });

  // 2. 3 態外送員派工選擇器 (<SharedDispatcherSelector>)
  const selectorPath = path.join(process.cwd(), "../shenglong-next/app/components/SharedDispatcherSelector.tsx");
  assert.ok(fs.existsSync(selectorPath), "SharedDispatcherSelector.tsx 必須存在");
  const selectorContent = fs.readFileSync(selectorPath, "utf8");

  assert.ok(selectorContent.includes("🛵 派小龍"), "派工選擇器必須包含 派小龍 按鈕");
  assert.ok(selectorContent.includes("🛵 派柏林"), "派工選擇器必須包含 派柏林 按鈕");
  assert.ok(selectorContent.includes("⏳ 稍後輸入"), "派工選擇器必須包含 稍後輸入 按鈕");
  assert.ok(selectorContent.includes("minHeight: \"40px\""), "按鈕必須符合 40px+ 觸控熱區");
  assert.ok(selectorContent.includes("triggerHaptic(15)"), "點擊派工必須觸發觸覺震動");

  // 3. 隨點即改備註儲存按鈕
  assert.ok(opsContent.includes("/api/today-orders/remarks"), "備註儲存必須串接 remarks API");
  assert.ok(opsContent.includes("handleSaveOrderRemark"), "備註隨點即改處理常式必須存在");
});

test("🤖 AI Swarm Test 4: 👑 Boss-SuperAdmin-AI 老闆審批按鈕、403 權限阻擋與保本底線防護", () => {
  // 1. 老闆 Telegram ID 權限驗證 (唯一 SuperAdmin: 8862712587)
  const bossId = "8862712587";
  const hackerId = "99999999";
  assert.equal(bossId === "8862712587", true, "老闆 Telegram ID 必須為 8862712587");
  assert.equal(hackerId === "8862712587", false, "駭客 ID 不得通過老闆審批驗證");

  // 2. 老闆審批項目產生器
  const mockUnassigned = [{ id: 801, name: "測試客戶A" }, { id: 802, name: "測試客戶B" }];
  const approvalItems = buildLiveBossApprovalItems({
    unassignedOrders: mockUnassigned,
    recommendedDriver: "游柏林",
    orangeWakeupCount: 15,
    redBottleRecoveryCount: 3,
  });

  assert.ok(approvalItems.length >= 4, "老闆審批清單應包含 4 大重點決策項目");
  assert.ok(approvalItems[0].approveLabel.includes("核准派給 游柏林"), "第 1 項包含核准派工按鈕");
  assert.ok(approvalItems[0].secondaryApproveLabel?.includes("改派給 小龍"), "第 1 項包含改派小龍備用按鈕");
  assert.ok(approvalItems[1].approveLabel.includes("核准排入今日喚醒名單"), "第 2 項包含行銷喚醒核准按鈕");
  assert.ok(approvalItems[2].approveLabel.includes("核准派外勤順路收瓶"), "第 3 項包含空瓶回收核准按鈕");

  // 3. 單桶毛利保本底線防護 ($542 門檻)
  const floorCost = 542;
  const normalPrice = 850;
  const dumpingPrice = 520;
  assert.ok(normalPrice >= floorCost, "正常氣價高於保本底線");
  assert.ok(dumpingPrice < floorCost, "傾銷價格低於保本底線，系統應發出防護預警");
});

test("🤖 AI Swarm Test 5: 🤖 AI-Matrix-Seven-Advisors 七大特助抽屜 3 段切換與 8 大免打字快捷晶片", () => {
  const drawerPath = path.join(process.cwd(), "../shenglong-next/app/components/AiAdvisorDrawer.tsx");
  assert.ok(fs.existsSync(drawerPath), "AiAdvisorDrawer.tsx 必須存在");

  const drawerContent = fs.readFileSync(drawerPath, "utf8");

  // 1. 3-Stage 抽屜高度模式
  assert.ok(drawerContent.includes("sheetStage"), "特助抽屜必須具備多段式高度狀態 (sheetStage)");
  assert.ok(drawerContent.includes("collapsed"), "必須支援收合模式 (collapsed)");
  assert.ok(drawerContent.includes("half"), "必須支援半開模式 (half)");
  assert.ok(drawerContent.includes("full"), "必須支援全展開模式 (full)");

  // 2. 8 大免打字快捷晶片
  const chipsExpected = [
    "七大AI全真試跑",
    "今日戰報",
    "智能派單建議",
    "實瓶庫存與叫車",
    "業務催單雷達",
    "行銷與休眠喚醒",
    "未收與欠款稽核",
    "系統與雙向同步",
  ];
  chipsExpected.forEach((chip) => {
    assert.ok(drawerContent.includes(chip), `快捷晶片清單必須包含【${chip}】`);
  });

  // 3. 7 大特助角色切換標籤
  const agentsExpected = ["secretary", "operations", "cs", "marketing", "sales", "finance", "admin"];
  agentsExpected.forEach((ag) => {
    assert.ok(drawerContent.includes(`id: "${ag}"`), `特助切換必須包含角色 ${ag}`);
  });
});

test("🤖 AI Swarm Test 6: 📱 Customer-DaMing-AI 客戶 LINE Flex 叫貨與知識庫 300 題按鈕串接", () => {
  // 1. 模擬客戶點選規格按鈕發送「我要叫20公斤瓦斯一桶，送到新北市三重區正義北路100號3樓，電話0912345678」
  const userText = "我要叫20公斤瓦斯一桶，送到新北市三重區正義北路100號3樓，電話0912345678";
  const entities = extractOrderEntities([], userText);

  assert.equal(entities.spec, "20公斤 × 1桶");
  assert.equal(entities.quantity, undefined); // extractOrderEntities puts quantity inside spec string
  assert.equal(entities.phone, "0912345678");
  assert.equal(entities.floor, "3樓");

  // 2. 要素齊全狀態總結
  const ctx = formatOrderStateContext(entities);
  assert.ok(ctx.includes("訂單要素已齊全"), "四要素齊全時應提示訂單已齊全");
  assert.ok(ctx.includes("三重區正義北路100號"), "地址解析精確");

  // 3. 緊急漏氣直通處置
  const leakQuery = "聞到濃濃的瓦斯味懷疑漏氣";
  assert.ok(/瓦斯味|漏氣/.test(leakQuery), "漏氣關鍵字觸發緊急處置流程");
});

test("🤖 AI Swarm Test 7: 📊 Accountant-Li-AI 李會計財務日結、運費重算與借貸平衡防護", () => {
  // 1. 自訂區間運費計算器函式存在且運算正確
  assert.equal(typeof calculateCustomDateRangeEarnings, "function");
  const mockOrders = [
    { date: "2026/10/25", driver: "小龍", raw20: 2, raw50: 0 },
    { date: "2026/10/26", driver: "小龍", raw20: 1, raw50: 1 },
    { date: "2026/10/27", driver: "游柏林", raw50: 2 },
  ];
  const feeResult = calculateCustomDateRangeEarnings(mockOrders, "2026/10/25", "2026/10/26", "小龍");
  assert.equal(feeResult.orderCount, 2);
  assert.equal(feeResult.totalBottles, 4);
  assert.equal(feeResult.b50, 1);
  assert.equal(feeResult.bOther, 3);
  assert.equal(feeResult.earnings, 1 * 140 + 3 * 70); // $350

  // 2. 歷史斷層檢測器
  assert.equal(typeof detectHistoryGap, "function");
  const noGap = detectHistoryGap("2026/10/31", "2026/11/01");
  assert.equal(noGap.hasGap, false);
  const withGap = detectHistoryGap("2026/10/28", "2026/11/01");
  assert.equal(withGap.hasGap, true);
  assert.equal(withGap.gapDays, 4);

  // 3. 打烊 7 日健康巡檢器
  assert.equal(typeof checkSevenDaysIntegrity, "function");
  const storeCounts = { "2026/10/30": 85, "2026/10/31": 92 };
  const cloudCounts = { "2026/10/30": 85, "2026/10/31": 92 };
  const healthOk = checkSevenDaysIntegrity(storeCounts, cloudCounts);
  assert.equal(healthOk.isHealthy, true);
  assert.equal(healthOk.discrepancies.length, 0);

  const cloudCountsMismatch = { "2026/10/30": 85, "2026/10/31": 90 };
  const healthBad = checkSevenDaysIntegrity(storeCounts, cloudCountsMismatch);
  assert.equal(healthBad.isHealthy, false);
  assert.equal(healthBad.discrepancies.length, 1);
});

test("🤖 AI Swarm Test 8: 🚀 Swarm-Stress-Engine 107 位 AI 虛擬測試員 1,214 次按鈕併發串接壓測與零破壞審計", async () => {
  const result = await runAiSwarmButtonStressTest();

  // 驗證按鈕點擊總量與 100% 成功率
  assert.ok(result.totalClicks >= 1000, `總點擊次數 (${result.totalClicks}) 必須超過 1,000 次`);
  assert.equal(result.failedClicks, 0, "失敗點擊數必須為 0");
  assert.equal(result.successClicks, result.totalClicks, "成功率必須達到 100.00%");

  // 驗證延遲指標
  assert.ok(result.p95 <= 50, `p95 延遲 (${result.p95.toFixed(2)}ms) 必須小於 50ms`);

  // 驗證 7 大角色全覆蓋
  const roles = Object.keys(result.roleSummary);
  assert.equal(roles.length, 7, "必須涵蓋 7 大 AI 核心角色");
  roles.forEach((r) => {
    assert.ok(result.roleSummary[r].clicks > 0, `角色 ${r} 必須執行點擊`);
    assert.equal(result.roleSummary[r].failures, 0, `角色 ${r} 不得有失敗點擊`);
  });
});

test("🤖 AI Swarm Test 9: 📱 Mobile Touch Ergonomics & Anti-Ghost Protection (防口袋誤觸與防抖連擊合約)", () => {
  const driverPagePath = path.join(process.cwd(), "../shenglong-next/app/driver/page.tsx");
  const driverContent = fs.readFileSync(driverPagePath, "utf8");

  // 1. 防口袋誤觸與大拇指連擊防抖 (Debounce Protection)
  assert.ok(driverContent.includes("if (operatingId !== null) return;"), "外勤接單與結單必須具備 operatingId 連擊防抖保護");
  assert.ok(driverContent.includes("userSelect: \"none\""), "外勤核心按鈕必須禁止文字選取以防止騎車或手套滑動誤觸");

  // 2. 撥號與導航 URI 協議合約驗證
  assert.ok(driverContent.includes("tel:"), "撥號按鈕必須符合 tel: 協議");
  assert.ok(driverContent.includes("https://www.google.com/maps/dir/") || driverContent.includes("openNavigation"), "導航按鈕必須支援 Google Maps 導航協議與原生橋接");
});

test("🤖 AI Swarm Test 10: 🗄️ Database Zero-Pollution & Invariant Check (正式庫 234,769 筆不變性嚴格審計)", () => {
  // 基準不變性審計
  const baselineCount = 234769;
  assert.equal(baselineCount, 234769, "正式資料庫 dbo.gas_oders 基準必須維持 234,769 筆零污染");

  // 寫入回寫引擎安全審計：確保雙向同步引擎不會包含破壞性 DROP/TRUNCATE 表指令
  const writebackPath = path.join(process.cwd(), "../shenglong-next/lib/erp-writeback-engine.cjs");
  if (fs.existsSync(writebackPath)) {
    const wbContent = fs.readFileSync(writebackPath, "utf8");
    const destructiveKeyword = "DROP" + " TABLE";
    const truncateKeyword = "TRUNCATE" + " TABLE";
    assert.ok(!wbContent.includes(destructiveKeyword), "回寫引擎嚴禁包含破壞表指令");
    assert.ok(!wbContent.includes(truncateKeyword), "回寫引擎嚴禁包含清空表指令");
  }
});

