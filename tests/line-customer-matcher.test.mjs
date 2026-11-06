import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractCustomerCodeFromText,
  extractPhoneFromText,
  extractAddressSnippet,
  inferCustomerSpec,
  matchLineCustomer,
  formatCustomerContextPrompt
} from '../api/_line-customer-matcher.js';

test('【LINE 客服直連 Supabase】1. 客戶代號、電話與地址關鍵字萃取', () => {
  // 1.1 代號萃取
  assert.equal(extractCustomerCodeFromText('我是 26.21.1 叫瓦斯'), '26.21.1');
  assert.equal(extractCustomerCodeFromText('代號:47.2 要送一桶'), '47.2');
  assert.equal(extractCustomerCodeFromText('102.15.3號瓦斯沒了'), '102.15.3');
  assert.equal(extractCustomerCodeFromText('一桶 400.0 元'), null); // 排除金額小數
  assert.equal(extractCustomerCodeFromText('今天天氣真好'), null);

  // 1.2 電話萃取
  assert.equal(extractPhoneFromText('我的電話 0922-734-808'), '0922734808');
  assert.equal(extractPhoneFromText('0912345678 送一桶'), '0912345678');
  assert.equal(extractPhoneFromText('電話 29763869'), '29763869');
  assert.equal(extractPhoneFromText('請送兩桶瓦斯'), null);

  // 1.3 地址片段萃取
  assert.equal(extractAddressSnippet('送到文化北路26巷21號'), '文化北路26巷21號');
  assert.equal(extractAddressSnippet('我家在三重區龍濱路47號2樓'), '三重區龍濱路47號');
});

test('【LINE 客服直連 Supabase】2. 依門市經典代號 26.21.1 秒級識別熟客 (0ms 命中)', () => {
  const match = matchLineCustomer('老闆你好我是 26.21.1 幫我送一桶瓦斯');
  assert.ok(match !== null);
  assert.equal(match.matchType, 'CODE');
  assert.equal(match.matchedTerm, '26.21.1');
  assert.equal(match.customer.code, '26.21.1');
  assert.ok(match.customer.name.includes('羊肉爐'));
  assert.ok(match.customer.addr.includes('文化北路26巷21號'));
  assert.equal(match.customer.phoneClean, '0922734808');
  assert.equal(match.inferredSpec, '20kg');
});

test('【LINE 客服直連 Supabase】3. 依電話號碼秒級識別熟客', () => {
  const match = matchLineCustomer('0922-734-808 瓦斯快沒了');
  assert.ok(match !== null);
  assert.equal(match.matchType, 'PHONE');
  assert.equal(match.customer.code, '26.21.1');
  assert.ok(match.customer.name.includes('羊肉爐'));
});

test('【LINE 客服直連 Supabase】4. 多輪對話歷史上下文關聯識別', () => {
  // 客戶上一句說「我是 26.21.1」，本句只說「送一桶」
  const history = [
    { role: 'user', content: '你好我是 26.21.1' },
    { role: 'assistant', content: '您好！請問有什麼能為您服務？' }
  ];
  const match = matchLineCustomer('送一桶瓦斯', history);
  assert.ok(match !== null);
  assert.equal(match.customer.code, '26.21.1');
});

test('【LINE 客服直連 Supabase】5. 熟客專屬 Prompt 生成與防止重複詢問引導', () => {
  const match = matchLineCustomer('我是 26.21.1 叫瓦斯');
  const prompt = formatCustomerContextPrompt(match);
  assert.ok(prompt.includes('26.21.1'));
  assert.ok(prompt.includes('文化北路26巷21號'));
  assert.ok(prompt.includes('切勿再要求客戶重新提供已經登記過的地址'));
  assert.ok(prompt.includes('20kg'));
});

test('【LINE 客服直連 Supabase】6. 全新陌生客戶無誤報回退 (Fallback)', () => {
  const match = matchLineCustomer('請問你們瓦斯一桶多少錢？');
  assert.equal(match, null);
});
