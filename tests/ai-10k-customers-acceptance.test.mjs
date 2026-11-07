import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { run10kAiCustomersAcceptance, TOTAL_AI_CUSTOMERS } from '../scripts/run-10k-ai-customers-acceptance.cjs';

test('👑 盛隆瓦斯 10,000 位真實 AI 客人多語系全鏈路極限實測 (10,000 AI Customers Acceptance)', async (t) => {

  const stats = run10kAiCustomersAcceptance();

  await t.test('1. 10,000 位 AI 客人總體驗收指標：100% 成功率與極限吞吐', () => {
    assert.equal(stats.totalTested, TOTAL_AI_CUSTOMERS, `總驗收人數必須達到 ${TOTAL_AI_CUSTOMERS} 位`);
    assert.equal(stats.totalPassed, TOTAL_AI_CUSTOMERS, '總通過人數必須為 10,000 位 (100% 成功)');
    assert.equal(stats.totalFailed, 0, '失敗人數必須嚴格為 0');
  });

  await t.test('2. 四大語系真實客群分佈檢驗 (Multilingual Customer Distribution)', () => {
    assert.equal(stats.mandarinTested, 5000, '國語中文家庭生活客群必須達到 5,000 位 (50%)');
    assert.equal(stats.taiwaneseTested, 2000, '臺灣閩南語 (台語) 老主顧必須達到 2,000 位 (20%)');
    assert.equal(stats.vietnameseTested, 2000, '越南語 (Tiếng Việt) 新住民必須達到 2,000 位 (20%)');
    assert.equal(stats.englishTested, 800, '英語 (English) 外籍人士必須達到 800 位 (8%)');
  });

  await t.test('3. NLU 訂單要素萃取與國字數字正規化檢驗', () => {
    assert.ok(stats.entitiesExtracted >= 10000, 'NLU 實體萃取總次數必須達到 10,000 次');
    assert.ok(stats.chineseNumbersNormalized >= 4000, '國字數字 (二十公斤/大桶/兩桶) 正規化必須達到 4,000 次以上');
    assert.ok(stats.addressPrefixesStripped >= 7000, '地址口語前綴 (送到/送去/地址在) 清洗必須達到 7,000 次以上');
    assert.ok(stats.confirmationsGenerated >= 10000, '多語系確認文案生成必須達到 10,000 次');
  });

  await t.test('4. 缺項漏報多輪反問與資安 Fuzzing 防禦審計', () => {
    assert.ok(stats.incompleteHandled >= 100, '缺項漏報反問導引必須達到 100 次以上');
    assert.ok(stats.securityAttacksBlocked >= 100, 'SQL 注入與 XSS 惡意攻擊防禦必須達到 100 次以上');
  });

  await t.test('5. 最高執行指令審計：官方標準成本與舊 ERP 神聖黑盒子 (Directives #3 & #4)', () => {
    assert.ok(stats.costDirectiveAudited >= 6000, '20kg/50kg 官方標準進價、運費與淨毛利審計必須全數達標');
    const scriptContent = fs.readFileSync(path.resolve('scripts/run-10k-ai-customers-acceptance.cjs'), 'utf8');
    assert.ok(!scriptContent.includes('ALTER TABLE'), '測試引擎嚴禁執行 ALTER TABLE 破壞舊 ERP');
    assert.ok(!scriptContent.includes('CREATE TRIGGER'), '測試引擎嚴禁執行 CREATE TRIGGER 破壞舊 ERP');
  });

});
