import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("🛡️ 司機端圖 1 風格高密度卡片 (選項 A) ＆ 歷史備註可見性檢驗", async (t) => {
  let driverRoutePath = path.resolve("../shenglong-next/app/api/driver/orders/route.ts");
  let driverPagePath = path.resolve("../shenglong-next/app/driver/page.tsx");

  if (!fs.existsSync(driverRoutePath) || !fs.existsSync(driverPagePath)) {
    driverRoutePath = "C:/shenglong-next/app/api/driver/orders/route.ts";
    driverPagePath = "C:/shenglong-next/app/driver/page.tsx";
  }

  assert.ok(fs.existsSync(driverRoutePath), "app/api/driver/orders/route.ts 必須存在");
  assert.ok(fs.existsSync(driverPagePath), "app/driver/page.tsx 必須存在");

  const routeContent = fs.readFileSync(driverRoutePath, "utf8");
  const pageContent = fs.readFileSync(driverPagePath, "utf8");

  await t.test("1. 後端 API 必須將 safeCustomerRemarks 提供給司機端 (解決看不到歷史備註痛點)", () => {
    assert.match(
      routeContent,
      /customerRemarks:\s*safeCustomerRemarks\s*\|\|\s*undefined/,
      "API 必須將 customerRemarks 提供給外勤人員，不得僅限管理員"
    );
  });

  await t.test("2. 前端 OrderItem 型別必須包含 customerRemarks", () => {
    assert.match(
      pageContent,
      /customerRemarks\?:\s*string;/,
      "OrderItem 型別必須定義 customerRemarks"
    );
  });

  await t.test("3. 卡片頂部必須實裝仿圖 1 狀態膠囊、單號、時間與高亮應收款", () => {
    assert.match(pageContent, /isAssigned \? "📢 待接單" : isAccepted \? "🚚 配送中" : "✅ 已送達"/);
    assert.match(pageContent, /#\{o\.id\}/);
    assert.match(pageContent, /應收:\s*\$\{o\.price \|\| 0\}/);
  });

  await t.test("4. 地址與姓名必須具備清晰視覺層級 (👤 圖示、主要地址大字、樓層附註高亮)", () => {
    assert.match(pageContent, /addrParts\.main \|\| o\.addr/);
    assert.match(pageContent, /addrParts\.extra/);
  });

  await t.test("5. 卡片必須明確展示歷史備註 (💬 歷史備註：{o.customerRemarks}) 與 本次備註", () => {
    assert.match(pageContent, /💬 歷史備註：/);
    assert.match(pageContent, /\{o\.customerRemarks\.trim\(\)\}/);
    assert.match(pageContent, /📝 本次備註：/);
    assert.match(pageContent, /\{o\.orderRemarks\.trim\(\)\}/);
  });

  await t.test("6. 資訊標籤列 (Chips) 必須仿圖 1 陳列規格運費、樓層費、現場標籤、現場備桶與挑桶警示", () => {
    assert.match(pageContent, /🏷️ \{o\.items \|\|/);
    assert.match(pageContent, /運\+\$\{o\.estimatedCommission \|\| 70\}/);
    assert.match(pageContent, /🪜 樓層 \+\$\{Number\(o\.floorFee \?\? o\.tip\)\}/);
    assert.match(pageContent, /🔄 現場備桶: \{currentReport\.backupCount\} 支/);
    assert.match(pageContent, /⚠️ 請挑桶/);
  });

  await t.test("7. 選項 A 底部按鈕排版：左側工具列 (導航/電話/回報) ＆ 右側核心業務按鈕 (一鍵接單/送達收款)", () => {
    // 左側工具
    assert.match(pageContent, />導航<\/span>/);
    assert.match(pageContent, />電話<\/span>/);
    assert.match(pageContent, />\{hasReport \? "已回報" : "回報"\}<\/span>/);

    // 右側主要按鈕 (仿圖 1 一鍵採納樣式)
    assert.match(pageContent, /handleAcceptOrder\(o\.id\)/);
    assert.match(pageContent, />\{operatingId === o\.id \? "接單中\.\.\." : "一鍵接單"\}<\/span>/);
    assert.match(pageContent, /setCollectionTargetOrder\(o\)/);
    assert.match(pageContent, />\{operatingId === o\.id \? "同步中\.\.\." : "送達收款"\}<\/span>/);
  });
});
