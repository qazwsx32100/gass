import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runMassiveAiApiAcceptance, TOTAL_AI_CALLS } from '../scripts/run-ai-massive-api-test.cjs';

test('👑 盛隆瓦斯 全系統大規模 AI 多語系真實 API 極限驗收 (50,000+ AI API Acceptance)', async (t) => {

  const stats = await runMassiveAiApiAcceptance();

  await t.test('1. API 極限驗收整體指標：100% 成功率與超高吞吐 QPS', () => {
    assert.ok(stats.totalCalls >= TOTAL_AI_CALLS, `總 API 調用次數必須達到 ${TOTAL_AI_CALLS} 次以上`);
    assert.equal(stats.totalCalls, stats.passedCalls, '通過次數必須等於總調用次數 (100% 成功)');
    assert.equal(stats.failedCalls, 0, '失敗次數必須嚴格為 0');
  });

  await t.test('2. 四大語系 AI 客戶覆蓋比率檢驗 (Multilingual API Distribution)', () => {
    assert.equal(stats.mandarinCalls, 25000, '國語中文 AI 客戶 API 調用必須為 25,000 次 (50%)');
    assert.equal(stats.taiwaneseCalls, 10000, '台語老主顧 AI 客戶 API 調用必須為 10,000 次 (20%)');
    assert.equal(stats.vietnameseCalls, 10000, '越南語新住民 AI 客戶 API 調用必須為 10,000 次 (20%)');
    assert.equal(stats.englishCalls, 5000, '英語外籍人士 AI 客戶 API 調用必須為 5,000 次 (10%)');
  });

  await t.test('3. API 核心功能閉環檢驗 (STT + NLU + TTS)', () => {
    assert.ok(stats.orderEntitiesExtracted >= 25000, '四語訂單要素精準萃取必須達到 25,000 次以上');
    assert.ok(stats.ttsSynthesized >= 15000, 'TTS 語音合成生成必須達到 15,000 次以上');
    assert.ok(stats.sttTranscribed >= 4000, 'STT 語音轉錄識別必須達到 4,000 次以上');
  });

  await t.test('4. 安全防護與 API Fuzzing 攻擊免疫 (Security & Robustness)', () => {
    assert.ok(stats.fuzzingAttacksBlocked >= 1000, '惡意 SQL 注入與 XSS 攻擊阻絕必須達到 1,000 次以上');
  });

  await t.test('5. 舊 ERP 神聖黑盒子鐵律審計 (Directive #4)', () => {
    const scriptContent = fs.readFileSync(path.resolve('scripts/run-ai-massive-api-test.cjs'), 'utf8');
    assert.ok(!scriptContent.includes('ALTER TABLE'), 'API 測試腳本嚴禁含有 ALTER TABLE');
    assert.ok(!scriptContent.includes('CREATE TRIGGER'), 'API 測試腳本嚴禁含有 CREATE TRIGGER');
    assert.ok(!scriptContent.includes('DROP TABLE'), 'API 測試腳本嚴禁執行 DROP TABLE (僅作為測試注入字串)');
  });

});
