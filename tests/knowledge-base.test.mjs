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

test('KnowledgeBase: Categories 19 & 20 matching and residual gas rules', () => {
  // Category 19: Commercial equipment & fast-fire stoves
  const commMatch = matchBestFaq('快炒店中壓快速爐火變很小怎麼辦？');
  assert.ok(commMatch, 'Should match commercial gas FAQ');
  assert.ok(commMatch.category.includes('商用瓦斯'));

  // Category 20: Flame quality & legal responsibilities
  const sootMatch = matchBestFaq('請問住宅瓦斯有消防法規存放限制嗎？');
  assert.ok(sootMatch, 'Should match flame quality & legal regulation FAQ');
  assert.ok(sootMatch.category.includes('燃燒品質'));

  // Verify strict store rule: No residual weighing/refund
  const prompt = getOptimizedSystemPrompt('可以現場幫我秤重退殘氣嗎？');
  assert.ok(prompt.includes('現場秤重'), 'Prompt must prohibit on-site weighing');
  assert.ok(prompt.includes('不退殘氣費'), 'Prompt must state no residual gas refund');
});

test('KnowledgeBase: Few-shot examples and orderStateContext injection', async () => {
  const { extractOrderEntities, formatOrderStateContext } = await import('../api/line-webhook.js');

  // Test multi-turn order entity extraction
  const history = [
    { role: 'user', content: '我要叫瓦斯，送三重區正義北路100號' },
    { role: 'assistant', content: '好的！請問送到幾樓？需要幾公斤瓦斯呢？' },
    { role: 'user', content: '3樓沒電梯，要一桶20公斤' }
  ];
  const entities = extractOrderEntities(history, '電話是 0912-345-678');

  assert.ok(entities.address.includes('正義北路100號'));
  assert.ok(entities.spec.includes('20公斤'));
  assert.ok(entities.floor.includes('3樓'));
  assert.ok(entities.floor.includes('無電梯'));
  assert.equal(entities.phone, '0912-345-678');
  assert.equal(entities.isComplete, true);

  // Incomplete entities test
  const partialEntities = extractOrderEntities([], '送重新路二段50號4樓有電梯');
  assert.equal(partialEntities.isComplete, false);
  assert.ok(partialEntities.missing.includes('聯絡電話'));
  assert.ok(partialEntities.missing.includes('瓦斯規格與數量'));

  // Injection into prompt
  const contextText = formatOrderStateContext(entities);
  const promptWithContext = getOptimizedSystemPrompt('電話是 0912-345-678', 'fast', contextText);
  assert.ok(promptWithContext.includes('目前系統從對話中自動掌握之訂單要素'));
  assert.ok(promptWithContext.includes('正義北路100號'));
  assert.ok(promptWithContext.includes('0912-345-678'));
  assert.ok(promptWithContext.includes('盛隆金牌客服典範問答'));

  // Test scattered multi-turn preservation across many messages
  const scatteredHistory = [
    { role: 'user', content: '老闆你好' },
    { role: 'assistant', content: '您好！請問今天需要為您服務什麼呢？' },
    { role: 'user', content: '我家在三重區三和路四段20號' },
    { role: 'assistant', content: '收到三和路四段20號！請問是幾樓呢？' },
    { role: 'user', content: '5樓走樓梯' },
    { role: 'assistant', content: '好的，5樓無電梯！請問需要幾公斤的瓦斯呢？' },
    { role: 'user', content: '一桶16公斤的' }
  ];
  const scatteredEntities = extractOrderEntities(scatteredHistory, '好那我電話留 0988-777-666');
  assert.equal(scatteredEntities.isComplete, true);
  assert.ok(scatteredEntities.address.includes('三和路四段20號'));
  assert.ok(scatteredEntities.floor.includes('5樓'));
  assert.ok(scatteredEntities.floor.includes('無電梯'));
  assert.ok(scatteredEntities.spec.includes('16公斤'));
  assert.equal(scatteredEntities.phone, '0988-777-666');

  // Test address update override (latest wins)
  const updateEntities = extractOrderEntities(scatteredHistory, '抱歉更正一下地址，改送到正義北路88號');
  assert.ok(updateEntities.address.includes('正義北路88號'));
});

test('KnowledgeBase & AI-Chat: Dynamic prompt injection and line entity extraction consistency', async () => {
  const {
    getOptimizedSystemPrompt,
    classifyQueryComplexity,
    SHENGLONG_STORE_RULES
  } = await import('../api/_knowledge-base.js');
  const { extractOrderEntities, formatOrderStateContext } = await import('../api/line-webhook.js');

  // 1. 測試熱水器忽冷忽熱/故障 -> 正確辨識為 expert 深度專家模式
  const heaterQuery = '熱水器忽冷忽熱怎麼自我排查？';
  const heaterMode = classifyQueryComplexity(heaterQuery);
  assert.equal(heaterMode, 'expert');
  const heaterPrompt = getOptimizedSystemPrompt(heaterQuery, heaterMode, '');
  assert.ok(heaterPrompt.includes('深度專家診斷與邏輯推理指導'), 'Heater query must inject expert diagnostic guidelines');
  assert.ok(heaterPrompt.includes('熱水器'), 'Must match relevant knowledge base entry');

  // 2. 測試聞到瓦斯味/疑似漏氣 -> 最高安全防線與緊急避險四步驟
  const leakQuery = '家裡廚房好像聞到瓦斯味，該怎麼辦？';
  const leakPrompt = getOptimizedSystemPrompt(leakQuery, 'expert', '');
  assert.ok(leakPrompt.includes('盛隆緊急安全提醒'), 'Gas leak query must contain emergency safety alert');
  assert.ok(leakPrompt.includes('關閉鋼瓶角閥'), 'Must include valve closure SOP');
  assert.ok(leakPrompt.includes('02-2972-5559'), 'Must include store contact phone');

  // 3. 測試殘氣與秤重規定 -> 嚴格約束無現場秤重退費
  const residualQuery = '請問剩下的瓦斯可以秤重退錢嗎？';
  const residualPrompt = getOptimizedSystemPrompt(residualQuery, 'fast', '');
  assert.ok(residualPrompt.includes('無現場秤重服務，亦不退殘氣費'), 'Residual gas policy must be strictly enforced');

  // 4. 測試多輪對話訂單要素整合
  const orderHistory = [
    { role: 'user', content: '請問叫瓦斯有送三重嗎？' },
    { role: 'assistant', content: '有的，三重全區專車免費配送！請提供地址與規格。' }
  ];
  const orderInput = '我要送新北市三重區重新路二段10號3樓沒電梯，一桶20公斤，電話0912345678';
  const extracted = extractOrderEntities(orderHistory, orderInput);
  const stateContext = formatOrderStateContext(extracted);
  const dynamicPrompt = getOptimizedSystemPrompt(orderInput, 'fast', stateContext);

  assert.equal(extracted.isComplete, true);
  assert.ok(stateContext.includes('訂單要素已齊全'));
  assert.ok(dynamicPrompt.includes('重新路二段10號'));
  assert.ok(dynamicPrompt.includes('20公斤'));
  assert.ok(dynamicPrompt.includes('無電梯'));
});


