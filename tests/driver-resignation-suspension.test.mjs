import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("🛑 外勤人員 游柏林 離職停權與四道自毀防線全鏈路檢驗 (Driver Resignation & Access Block)", async (t) => {
  const driverSettingsPath = path.join(process.cwd(), "../shenglong-next/lib/driver-settings.ts");
  assert.ok(fs.existsSync(driverSettingsPath), "lib/driver-settings.ts 必須存在");
  const settingsTs = fs.readFileSync(driverSettingsPath, "utf8");

  await t.test("1. 主檔與預設現役名單排除游柏林，加入 suspendedDrivers", () => {
    assert.ok(settingsTs.includes('suspendedDrivers: ["游柏林"]'), "預設停權名單必須包含游柏林");
    assert.ok(settingsTs.includes('activeDrivers: ["小龍"]'), "預設現役外勤人員僅保留小龍");
    assert.ok(!settingsTs.includes('"游柏林": "8888"'), "游柏林專用密碼必須已被抹除");
    assert.ok(settingsTs.includes('if (driverName === "游柏林") return false;'), "verifyDriverPin 必須直接阻斷游柏林");
  });

  await t.test("2. Token 鑑權解析器：任何游柏林歷史金鑰 100% 判定為已停權 (isSuspended: true)", () => {
    assert.ok(settingsTs.includes('cleanToken.startsWith("tk_ybl")'), "所有以 tk_ybl 開頭之 Token 必須判定為已停權");
    assert.ok(settingsTs.includes('cleanToken === "revoked_resigned"'), "revoked_resigned 必須判定為已停權");
  });

  await t.test("3. driver-settings.json 與本機快取已同步落地", () => {
    const jsonPath = path.join(process.cwd(), "../shenglong-next/driver-settings.json");
    assert.ok(fs.existsSync(jsonPath), "driver-settings.json 必須存在");
    const jsonContent = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    assert.deepEqual(jsonContent.activeDrivers, ["小龍"], "現役外勤僅有小龍");
    assert.ok(jsonContent.suspendedDrivers.includes("游柏林"), "停權名單必須包含游柏林");
    assert.equal(jsonContent.driverPasswords["游柏林"], undefined, "游柏林密碼必須不存在");
    assert.equal(jsonContent.driverTokens["游柏林"], "revoked_resigned", "游柏林 Token 必須為 revoked_resigned");
  });

  await t.test("4. 外勤 App 前端：啟動即時銷毀本機資料，全螢幕深黑底紅字鎖死", () => {
    const driverPagePath = path.join(process.cwd(), "../shenglong-next/app/driver/page.tsx");
    const driverPage = fs.readFileSync(driverPagePath, "utf8");
    assert.ok(driverPage.includes("離職自毀最高防線：若偵測到游柏林之 Token"), "必須包含偵測游柏林之即刻自毀邏輯");
    assert.ok(driverPage.includes("離職停權絕對防線：若為離職人員（如游柏林）"), "離線模式必須阻斷游柏林進入");
    assert.ok(!driverPage.includes('{ name: "游柏林", icon: "🚚"'), "登入彈窗不可提供游柏林選擇");
  });

  await t.test("5. 門市調度選擇器：游柏林按鈕已全面除名移除，僅保留小龍與稍後輸入", () => {
    const selectorPath = path.join(process.cwd(), "../shenglong-next/app/components/SharedDispatcherSelector.tsx");
    const selector = fs.readFileSync(selectorPath, "utf8");
    assert.ok(!selector.includes("🛵 派柏林"), "選擇器不可再有派柏林按鈕");
    assert.ok(selector.includes("🛵 派小龍"), "選擇器保留派小龍按鈕");
    assert.ok(selector.includes("⏳ 稍後輸入"), "選擇器保留稍後輸入按鈕");
  });

  await t.test("6. Telegram 軍師機器人：阻斷派單給游柏林指令，僅建議在職員工小龍", () => {
    const botPath = path.join(process.cwd(), "../shenglong-next/advisor-bot.cjs");
    const bot = fs.readFileSync(botPath, "utf8");
    assert.ok(bot.includes('const recDriver = "小龍";'), "推薦外勤人員必須固定為小龍");
    assert.ok(bot.includes("外勤人員 游柏林 已經離職"), "機器人回調必須阻斷 cmd_assign_all_游柏林 指令");
  });

  await t.test("7. 雙向同步進程：排程排除游柏林", () => {
    const syncPath = path.join(process.cwd(), "../shenglong-next/sync-stock.cjs");
    const sync = fs.readFileSync(syncPath, "utf8");
    assert.ok(sync.includes('for (const drv of ["小龍"])'), "sync-stock 必須僅向在職外勤小龍執行雙向同步");
    assert.ok(sync.includes('"游柏林": "revoked_resigned"'), "sync-stock 內游柏林 Token 必須已作廢");
  });

  await t.test("8. 正式離職名單 (resignedDrivers) 獨立性、API 支援與標籤防護", () => {
    assert.ok(settingsTs.includes("resignedDrivers?: string[]"), "DriverAppSettings 必須包含 resignedDrivers 欄位");
    assert.ok(settingsTs.includes('resignedDrivers: ["游柏林"]'), "預設離職名單必須包含游柏林");
    assert.ok(settingsTs.includes("export function isDriverResigned"), "必須提供 isDriverResigned 判斷函數");

    const jsonPath = path.join(process.cwd(), "../shenglong-next/driver-settings.json");
    const jsonContent = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    assert.ok(Array.isArray(jsonContent.resignedDrivers), "driver-settings.json 必須包含 resignedDrivers 陣列");
    assert.ok(jsonContent.resignedDrivers.includes("游柏林"), "driver-settings.json resignedDrivers 必須包含游柏林");

    const manageStatusPath = path.join(process.cwd(), "../shenglong-next/app/api/driver/manage-status/route.ts");
    const manageStatusTs = fs.readFileSync(manageStatusPath, "utf8");
    assert.ok(manageStatusTs.includes('action === "resign"'), "manage-status 路由必須支援 resign 離職指令");

    const adminPagePath = path.join(process.cwd(), "../shenglong-next/app/driver/admin/page.tsx");
    const adminPage = fs.readFileSync(adminPagePath, "utf8");
    assert.ok(adminPage.includes("(已離職)"), "外勤管理頁面訂單列表必須包含 (已離職) 標籤");
    assert.ok(adminPage.includes("🚪 正式離職"), "外勤管理頁面卡片必須包含 🚪 正式離職 標記");
  });
});
