import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { run100kAiFullSystemAcceptance, TOTAL_AI_COUNT } from "../scripts/run-100k-ai-full-system-acceptance.cjs";

test("👑 盛隆瓦斯 全系統十萬位 AI 智能代理全鏈路極限驗收 (100,000 AI Swarm Acceptance)", async (t) => {

  const stats = run100kAiFullSystemAcceptance();

  await t.test("1. 十萬位 AI 總體驗收指標：100% 成功率與超高吞吐 QPS", () => {
    assert.equal(stats.totalTested, TOTAL_AI_COUNT, "總驗收人數必須達到 100,000 位");
    assert.equal(stats.totalPassed, TOTAL_AI_COUNT, "總通過人數必須為 100,000 位");
    assert.equal(stats.totalFailed, 0, "失敗人數必須嚴格為 0");
  });

  await t.test("2. 七大核心業務子系統覆蓋比率檢驗 (100k AI Persona Distribution)", () => {
    assert.equal(stats.residentialTested, 50000, "住家家庭戶 AI 必須為 50,000 位 (50%)");
    assert.equal(stats.commercialStallsTested, 20000, "夜市熱炒生意攤 AI 必須為 20,000 位 (20%)");
    assert.equal(stats.largeRestaurantsTested, 10000, "大型餐飲飯店 AI 必須為 10,000 位 (10%)");
    assert.equal(stats.deliveryDriversTested, 8000, "外勤司機配送 AI 必須為 8,000 位 (8%)");
    assert.equal(stats.storeDispatchTested, 5000, "門市接單調度 AI 必須為 5,000 位 (5%)");
    assert.equal(stats.aiAssistantsTested, 4000, "八大 AI 特助集群 AI 必須為 4,000 位 (4%)");
    assert.equal(stats.cloudSecurityTested, 3000, "雲端同步資安 AI 必須為 3,000 位 (3%)");
  });

  await t.test("3. 最高執行指令審計：官方標準成本、運費與利潤核算權威基準 (Directive #3)", () => {
    assert.ok(stats.twoWheelerNavCalls >= 8000, "兩輪機車導航 travelmode=two_wheeler 必須達到 8,000 次調用");
    assert.ok(stats.gpsDoorPinsSaved >= 8000, "Uber 模式大門高精經緯度 GPS 必須達到 8,000 次秒存");
    assert.ok(stats.dispatchesLocked >= 8000, "外勤防搶單狀態必須達到 8,000 次鎖定");
    assert.ok(stats.antiDeadlockReleases >= 5000, "45秒防死鎖自動解鎖釋放必須達到 5,000 次");
    assert.ok(stats.gasLeakAlertsTriggered >= 400, "0秒瓦斯漏氣最高紅色攔截必須精準觸發");
    assert.ok(stats.kvEncryptionsVerified >= 3000, "Private KV (AES-256-GCM) 雙向加解密必須 100% 吻合");
  });

  await t.test("4. 舊 ERP 神聖黑盒子鐵律審計 (Directive #4)", () => {
    const scriptContent = fs.readFileSync(path.resolve("scripts/run-100k-ai-full-system-acceptance.cjs"), "utf8");
    assert.ok(!scriptContent.includes("ALTER TABLE"), "腳本嚴禁含有 ALTER TABLE");
    assert.ok(!scriptContent.includes("CREATE TRIGGER"), "腳本嚴禁含有 CREATE TRIGGER");
    assert.ok(!scriptContent.includes("DROP TABLE"), "腳本嚴禁含有 DROP TABLE");
    assert.ok(scriptContent.includes("WITH (ROWLOCK)"), "回寫作業必須強制使用行級鎖 WITH (ROWLOCK)");
  });

});
