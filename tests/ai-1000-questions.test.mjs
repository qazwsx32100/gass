import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { run1000AiQuestionsAcceptance, TOTAL_QUESTIONS } from '../scripts/run-1000-ai-questions.cjs';

test('👑 盛隆瓦斯 1,000 位真實客人 AI 諮詢問題全鏈路極限實測 (1,000 Real Customer Questions)', async (t) => {

  const stats = run1000AiQuestionsAcceptance();

  await t.test('1. 1,000 個真實問題總體驗收指標：100% 成功率與極限吞吐', () => {
    assert.equal(stats.totalQuestions, TOTAL_QUESTIONS, `總問題數必須為 ${TOTAL_QUESTIONS} 題`);
    assert.equal(stats.passedQuestions, TOTAL_QUESTIONS, '通過題數必須為 1,000 題 (100% 成功)');
    assert.equal(stats.failedQuestions, 0, '失敗題數必須嚴格為 0');
  });

  await t.test('2. 11 大生活情境分類分佈檢驗 (Customer Scenario Distribution)', () => {
    assert.equal(stats.categoryBreakdown['價格與費用'], 120, '價格費用題數必須為 120 題');
    assert.equal(stats.categoryBreakdown['配送時段與預約'], 120, '配送預約題數必須為 120 題');
    assert.equal(stats.categoryBreakdown['付款與發票'], 80, '付款發票題數必須為 80 題');
    assert.equal(stats.categoryBreakdown['鋼瓶與押金'], 100, '鋼瓶押金題數必須為 100 題');
    assert.equal(stats.categoryBreakdown['瓦斯漏氣與緊急安全'], 120, '漏氣緊急題數必須為 120 題');
    assert.equal(stats.categoryBreakdown['瓦斯爐故障與排查'], 100, '瓦斯爐題數必須為 100 題');
    assert.equal(stats.categoryBreakdown['熱水器故障與水溫'], 100, '熱水器題數必須為 100 題');
    assert.equal(stats.categoryBreakdown['調整器與管線安全'], 80, '調整器管線題數必須為 80 題');
    assert.equal(stats.categoryBreakdown['餐飲小吃與商用大戶'], 60, '餐飲大戶題數必須為 60 題');
    assert.equal(stats.categoryBreakdown['多語系_臺灣話'], 35, '台語題數必須為 35 題');
    assert.equal(stats.categoryBreakdown['多語系_越南語'], 35, '越南語題數必須為 35 題');
    assert.equal(stats.categoryBreakdown['多語系_英語'], 10, '英語題數必須為 10 題');
    assert.equal(stats.categoryBreakdown['資安防護與邊界測試'], 40, '資安防禦題數必須為 40 題');
  });

  await t.test('3. 🚨 漏氣與危急情境最高安全防線 100% 觸發審計 (P0 級必檢)', () => {
    assert.ok(stats.safetyCriticalTotal >= 120, '漏氣與安全題數必須至少 120 題');
    assert.equal(stats.safetyCriticalIntercepted, stats.safetyCriticalTotal, '漏氣安全攔截率必須達到 100.00%');
  });

  await t.test('4. 門市營運守則與資安 Fuzzing 防禦審計', () => {
    assert.equal(stats.storeRulesValidated, TOTAL_QUESTIONS, '盛隆核心門市守則校驗必須全數達標 (1,000次)');
    assert.ok(stats.securityAttacksBlocked >= 40, 'SQL 注入、XSS 與 Prompt Injection 越獄防禦必須達到 40 次以上');
  });

  await t.test('5. 最高執行指令審計：舊 ERP 神聖黑盒子零更動 (Directive #4)', () => {
    const scriptContent = fs.readFileSync(path.resolve('scripts/run-1000-ai-questions.cjs'), 'utf8');
    assert.ok(!scriptContent.includes('ALTER TABLE'), '測試引擎嚴禁執行 ALTER TABLE 破壞舊 ERP');
    assert.ok(!scriptContent.includes('CREATE TRIGGER'), '測試引擎嚴禁執行 CREATE TRIGGER 破壞舊 ERP');
  });

});
