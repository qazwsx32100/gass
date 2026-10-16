import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SHENGLONG_STORE_RULES,
  KNOWLEDGE_BASE_ENTRIES,
  matchBestFaq,
  classifyQueryComplexity,
  getOptimizedSystemPrompt
} from '../api/_knowledge-base.js';

test('KnowledgeBase: Store rules metadata integrity', () => {
  assert.equal(SHENGLONG_STORE_RULES.phone, '02-2972-5559');
  assert.ok(SHENGLONG_STORE_RULES.businessHours.includes('08:00 ~ 21:00'));
  assert.ok(SHENGLONG_STORE_RULES.paymentMethod.includes('現金'));
  assert.ok(SHENGLONG_STORE_RULES.emergencyLeakSteps.length >= 4);
  assert.ok(SHENGLONG_STORE_RULES.residualGasPolicy.includes('不退殘氣費'));
  assert.ok(SHENGLONG_STORE_RULES.safetyInspection.includes('300 元'));
});

test('KnowledgeBase: matchBestFaq accurately matches relevant queries', () => {
  // 1. Price query
  const priceMatch = matchBestFaq('請問20公斤瓦斯現在多少錢？');
  assert.ok(priceMatch, 'Should find price match');
  assert.ok(priceMatch.category.includes('價格'));

  // 2. Leak emergency
  const leakMatch = matchBestFaq('聞到好濃的瓦斯味，好像漏氣了！');
  assert.ok(leakMatch, 'Should find leak match');
  assert.ok(leakMatch.category.includes('漏氣'));

  // 3. Delivery / hours
  const deliveryMatch = matchBestFaq('請問晚上幾點還可以送瓦斯？');
  assert.ok(deliveryMatch, 'Should find delivery match');
  assert.ok(deliveryMatch.category.includes('配送'));

  // 4. Deposit
  const depositMatch = matchBestFaq('請問第一次叫瓦斯需要押金嗎？');
  assert.ok(depositMatch, 'Should find deposit match');
  assert.ok(depositMatch.category.includes('押金'));

  // 5. Water heater / yellow flame
  const burnerMatch = matchBestFaq('家裡瓦斯爐火變紅黃色鍋底都變黑了');
  assert.ok(burnerMatch, 'Should find burner/flame match');
  assert.ok(burnerMatch.category.includes('瓦斯爐'));

  // 6. Gas order inquiry
  const orderMatch = matchBestFaq('我想叫一桶瓦斯送三重');
  assert.ok(orderMatch, 'Should find gas order match');
  assert.ok(orderMatch.category.includes('叫瓦斯'));

  // 7. Service area
  const areaMatch = matchBestFaq('請問新莊有送嗎？');
  assert.ok(areaMatch, 'Should find service area match');
  assert.ok(areaMatch.category.includes('服務區域'));

  // 8. Remaining gas
  const remainingMatch = matchBestFaq('請問瓦斯剩下多少怎麼看？');
  assert.ok(remainingMatch, 'Should find remaining gas match');
  assert.ok(remainingMatch.category.includes('剩餘量'));

  // 9. Storage safety
  const storageMatch = matchBestFaq('瓦斯桶可以放室內廚房嗎？');
  assert.ok(storageMatch, 'Should find storage match');
  assert.ok(storageMatch.category.includes('鋼瓶存放'));

  // 10. Pipe installation
  const pipeMatch = matchBestFaq('師傅送來會幫忙接管子嗎？');
  assert.ok(pipeMatch, 'Should find pipe match');
  assert.ok(pipeMatch.category.includes('安裝'));
});

test('KnowledgeBase: getOptimizedSystemPrompt generates comprehensive prompt', () => {
  // Test regular inquiry
  const prompt = getOptimizedSystemPrompt('可以幫忙搬上4樓嗎？');
  assert.ok(prompt.includes('02-2972-5559'));
  assert.ok(prompt.includes('盛隆瓦斯行'));
  assert.ok(prompt.includes('現金'));
  assert.ok(prompt.includes('樓層'));

  // Test emergency leak inquiry
  const leakPrompt = getOptimizedSystemPrompt('瓦斯桶旁邊有嘶嘶叫的漏氣聲');
  assert.ok(leakPrompt.includes('⚠️ 最高安全防線'));
  assert.ok(leakPrompt.includes('關閉瓦斯角閥') || leakPrompt.includes('關閉鋼瓶角閥'));
  assert.ok(leakPrompt.includes('免費前往查漏') || leakPrompt.includes('免費派師傅前往'));
});

test('KnowledgeBase: classifyQueryComplexity correctly separates fast and expert modes', () => {
  // Fast mode queries
  assert.equal(classifyQueryComplexity('請問一桶瓦斯多少錢？'), 'fast');
  assert.equal(classifyQueryComplexity('我想叫一桶20公斤瓦斯'), 'fast');
  assert.equal(classifyQueryComplexity('請問營業時間到幾點？'), 'fast');
  assert.equal(classifyQueryComplexity('可以開三聯式發票報帳嗎？'), 'fast');
  assert.equal(classifyQueryComplexity('放門口可以嗎？'), 'fast');

  // Expert mode queries
  assert.equal(classifyQueryComplexity('瓦斯爐一直打不著沒有火花'), 'expert');
  assert.equal(classifyQueryComplexity('瓦斯爐一放手就熄火怎麼辦'), 'expert');
  assert.equal(classifyQueryComplexity('熱水器忽冷忽熱洗到一半變冷水'), 'expert');
  assert.equal(classifyQueryComplexity('好像聞到很濃的瓦斯味有嘶嘶聲'), 'expert');
  assert.equal(classifyQueryComplexity('為什麼這個月瓦斯用這麼快是不是偷斤減兩'), 'expert');

  // Expert mode prompt includes expert diagnostic instructions
  const expertPrompt = getOptimizedSystemPrompt('瓦斯爐一放手就熄火', 'expert');
  assert.ok(expertPrompt.includes('深度專家診斷與邏輯推理指導'));
  assert.ok(expertPrompt.includes('條理化步驟排除'));
});
