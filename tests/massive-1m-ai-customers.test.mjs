/**
 * tests/massive-1m-ai-customers.test.mjs
 * 盛隆瓦斯 - 1,000,000 位 AI 客人全鏈路極限壓力測試與八大 AI 決策驗收測試套件
 *
 * 驗收範圍：
 * 1. 1,000,000 位 AI 客群畫像分佈 (65%住家、20%夜市熱炒、8%餐飲大戶、5%沉睡壓瓶、2%漏氣與安檢)
 * 2. 吞吐量 (QPS > 40,000 /s) 與低延遲 (< 30s)
 * 3. 記憶體防洩漏審查 (Heap Delta < 100 MB)
 * 4. 正式資料庫零污染 (dbo.gas_oders 筆數維持 234,769 筆完全不變)
 * 5. 八大 AI 智慧決策 (0秒漏氣紅色攔截、保本底線 100% 合規、舊 ERP ROWLOCK 防死鎖保護率 100%)
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  runOneMillionAiCustomersStress,
  generateCustomerProfile,
} = require('../scripts/run-1m-ai-customers-stress.cjs');

describe('盛隆瓦斯 1,000,000 位 AI 客人全鏈路極限壓力測試 (1M Virtual AI Customers)', () => {
  test('客戶畫像生成器規格與類別精準度 (Customer Archetypes & Pricing Rules)', () => {
    // 驗證住家戶 (0..64)
    const resSample = generateCustomerProfile(0);
    assert.strictEqual(resSample.archetype, 'residential');
    assert.ok(['20kg', '16kg', '4kg'].includes(resSample.spec));
    assert.ok(resSample.price >= 400);

    // 驗證生意攤 (65..84)
    const stallSample = generateCustomerProfile(65);
    assert.strictEqual(stallSample.archetype, 'stall');
    assert.strictEqual(stallSample.spec, '20kg (生意攤)');
    assert.strictEqual(stallSample.price, 620);

    // 驗證大型餐飲大戶 (85..92)
    const restSample = generateCustomerProfile(85);
    assert.strictEqual(restSample.archetype, 'restaurant');
    assert.strictEqual(restSample.spec, '50kg');
    assert.strictEqual(restSample.price, 1600);

    // 驗證沉睡壓瓶戶 (93..97)
    const dormantSample = generateCustomerProfile(93);
    assert.strictEqual(dormantSample.archetype, 'dormant');
    assert.strictEqual(dormantSample.action, 'dormant_reclaim');

    // 驗證緊急安全與安檢諮詢 (98..99)
    const safetySample1 = generateCustomerProfile(98);
    const safetySample2 = generateCustomerProfile(99);
    assert.strictEqual(safetySample1.archetype, 'safety_emergency');
    assert.strictEqual(safetySample2.archetype, 'safety_emergency');
    assert.strictEqual(safetySample1.action, 'leak_emergency');
    assert.strictEqual(safetySample2.action, 'faq_consult');
  });

  test('全鏈路 1,000,000 位 AI 客人串流壓測執行與正式庫零污染驗收', async () => {
    const result = await runOneMillionAiCustomersStress();

    // 1. 總量驗證
    assert.strictEqual(result.totalCustomers, 1000000, '總 AI 客人數必須精確達到 1,000,000 位');

    // 2. 效能與吞吐量驗證
    assert.ok(result.totalDuration < 30.0, `壓測總耗時 ${result.totalDuration}s 必須小於 30 秒`);
    assert.ok(result.overallQps > 40000, `平均吞吐量 ${result.overallQps} QPS 必須大於 40,000 客人/秒`);
    assert.ok(result.memoryDeltaMb < 100, `記憶體增量 ${result.memoryDeltaMb} MB 必須小於 100 MB`);

    // 3. 正式庫零污染鐵律驗收
    assert.strictEqual(result.prodOrderCountBefore, 234769, '測試前正式庫訂單數必須為 234,769 筆');
    assert.strictEqual(result.prodOrderCountAfter, 234769, '測試後正式庫訂單數必須維持 234,769 筆 (零污染)');

    // 4. 客群畫像比例驗證
    const { archetypeCounts, aiDispatches } = result.telemetry;
    assert.strictEqual(archetypeCounts.residential, 650000, '住家戶必須精確為 650,000 位 (65%)');
    assert.strictEqual(archetypeCounts.stall, 200000, '夜市熱炒生意攤必須精確為 200,000 位 (20%)');
    assert.strictEqual(archetypeCounts.restaurant, 80000, '大型餐飲大戶必須精確為 80,000 位 (8%)');
    assert.strictEqual(archetypeCounts.dormant, 50000, '沉睡壓瓶戶必須精確為 50,000 位 (5%)');
    assert.strictEqual(archetypeCounts.safety_emergency, 20000, '安全與急難戶必須精確為 20,000 位 (2%)');

    // 5. 八大 AI 智慧中樞決策合規性驗證
    // 客服 AI: 10,000 次漏氣 0 秒紅色攔截 100% 阻斷
    assert.strictEqual(aiDispatches.leakRedAlertsIntercepted, 10000, '漏氣 0 秒紅色攔截必須 100% 達成 (10,000 次)');
    assert.strictEqual(aiDispatches.faq300Resolved, 10000, 'FAQ 300 題問答必須 100% 解決 (10,000 次)');

    // 業務 AI: 保本底線防禦 0 違規
    assert.strictEqual(aiDispatches.marginFloorViolations, 0, '所有成交訂單定價必須 100% 高於保本底線 ($556/$529)');

    // 營運 AI: 派工小龍與游柏林
    assert.ok(aiDispatches.operationsLongAssigned > 300000, '營運 AI 小龍派工量充裕');
    assert.ok(aiDispatches.operationsYouAssigned > 300000, '營運 AI 游柏林派工量充裕');

    // 行政 AI: 產生 T-SQL 雙向回寫事務與 ROWLOCK 行級鎖驗證
    assert.strictEqual(aiDispatches.adminWritebackSqlJobs, 761667, '產生 761,667 筆訂單回寫事務');
    assert.strictEqual(aiDispatches.rowlockVerified, 761667, '回寫事務 100% 具備 ROWLOCK 行級防死鎖機制');

    // 行銷 AI: 沉睡喚醒
    assert.strictEqual(aiDispatches.marketingDormantReclaimed, 50000, '沉睡壓瓶戶喚醒率 100% (50,000 位)');
  });
});
