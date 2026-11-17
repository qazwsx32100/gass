import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("🛡️ 盛隆監控中心 頂部導覽列按鈕排版 ✕ 提示音效與震動設定置中視窗全鏈路驗證", async (t) => {
  const operationsPagePath = path.resolve("c:/shenglong-next/app/operations/page.tsx");
  const opsContent = fs.readFileSync(operationsPagePath, "utf-8");

  await t.test("1. 頂部主列採用 flexWrap: wrap 與 rowGap，左側品牌標題與狀態資訊不被按鈕擠壓遮蔽", () => {
    // 檢查 header 主容器
    assert.match(opsContent, /flexWrap:\s*"wrap"/);
    assert.match(opsContent, /rowGap:\s*"8px"/);
    assert.match(opsContent, /flex:\s*"1 1 auto"/);

    // 檢查標題列與連線健康度標籤具備彈性空間
    assert.match(opsContent, /MonitoringFreshnessBadge/);
    assert.match(opsContent, /更新 \{stockData\?\.updatedAt/);
  });

  await t.test("2. 右側控制鈕群採用精簡防擠壓設計，避免過寬文字破壞版面", () => {
    // 檢查精簡按鈕標籤
    assert.match(opsContent, /<span>通知<\/span>/);
    assert.match(opsContent, /<span>\{soundEnabled \? "鈴聲" : "靜音"\}<\/span>/);
    assert.match(opsContent, /<span>\{vibrationEnabled \? "震動" : "關震"\}<\/span>/);
    assert.match(opsContent, /<span>工具<\/span>/);
  });

  await t.test("3. 音效與震動設定彈窗升級為全局固定置中浮動視窗 (position: fixed)，徹底根除被螢幕切邊", () => {
    // 檢查固定置中與全螢幕半透明背景
    assert.match(opsContent, /position:\s*"fixed"/);
    assert.match(opsContent, /inset:\s*0/);
    assert.match(opsContent, /zIndex:\s*100005/);
    assert.match(opsContent, /justifyContent:\s*"center"/);
    assert.match(opsContent, /alignItems:\s*"center"/);
    assert.match(opsContent, /maxWidth:\s*"380px"/);

    // 確保不再使用原本導致向左飛出破版之 position: absolute; right: 0
    assert.doesNotMatch(
      opsContent,
      /position:\s*"absolute",\s*top:\s*"calc\(100% \+ 8px\)",\s*right:\s*0,\s*zIndex:\s*9999,\s*width:\s*"300px"/
    );
  });

  await t.test("4. 設定彈窗完整提供新單三連音、來電振鈴測試、震動模式與背景推播", () => {
    assert.match(opsContent, /playOrderChime\(\)/);
    assert.match(opsContent, /playCallChime\(\)/);
    assert.match(opsContent, /triggerVibrateAlert\("test"\)/);
    assert.match(opsContent, /handleSelectVibrationPattern/);
    assert.match(opsContent, /handleManualSubscribePush/);
  });
});
