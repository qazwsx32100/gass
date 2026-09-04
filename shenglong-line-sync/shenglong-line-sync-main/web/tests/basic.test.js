const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { modernizeAddress, normalizeAddress, addressesMatch } = require('../api/address-normalization');
const { _test: apiHelpers } = require('../api/index');

test('LIFF frontend uses external browser login support', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert.match(source, /withLoginOnExternalBrowser:\s*true/);
  assert.match(source, /2011207944-VaQEXeyi/);
  assert.match(html, /app\.js\?v=20260826-first-member-flow/);
  assert.doesNotMatch(html, /<script src="https:\/\/static\.line-scdn\.net/);
});

test('service account secret is only referenced server-side', () => {
  const browserSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const serverSource = fs.readFileSync(path.join(__dirname, '..', 'api', 'index.js'), 'utf8');
  assert.doesNotMatch(browserSource, /GOOGLE_SERVICE_ACCOUNT_JSON/);
  assert.match(serverSource, /GOOGLE_SERVICE_ACCOUNT_JSON/);
});

test('order form is captured before awaiting the API response', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert.match(source, /const orderForm = event\.currentTarget;/);
  assert.match(source, /state\.data\.orders = result\.orders/);
  assert.match(source, /orderForm\.reset\(\); openView\('history'\);/);
  assert.doesNotMatch(source, /event\.currentTarget\.reset\(\)/);
  assert.doesNotMatch(source, /orderForm\.reset\(\); await refresh\(\)/);
});

test('modern districts match legacy New Taipei administrative names', () => {
  assert.equal(normalizeAddress('新北市三重區'), normalizeAddress('台北縣三重市'));
  assert.equal(normalizeAddress('蘆洲區'), normalizeAddress('蘆洲市'));
  assert.equal(normalizeAddress('五股區'), normalizeAddress('五股鄉'));
  assert.equal(addressesMatch('三重區', '台北縣三重市重新路一段'), true);
  assert.equal(addressesMatch('五股區成泰路', '台北縣五股鄉成泰路'), true);
});

test('legacy addresses are displayed with current administrative names', () => {
  assert.equal(modernizeAddress('台北縣三重市重新路'), '新北市三重區重新路');
  assert.equal(modernizeAddress('台北縣蘆洲市長安街'), '新北市蘆洲區長安街');
});

test('phone lookup only returns exact normalized matches with masked customer data', () => {
  const rows = [
    ['3884', '', '小龍', '小龍', '0936-460-739', '台北縣三重市錯誤路12號'],
    ['457', '', '龍濱客戶', '龍濱客戶', '', '台北縣三重市龍濱路15號'],
  ];
  const matches = apiHelpers.customerCandidatesFromRows(rows, '+886 936 460 739');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].customerId, '3884');
  assert.equal(matches[0].name, '小○');
  assert.equal(matches[0].address, '新北市三重區錯誤路○○號');
});

test('address dropdown roads come from legacy records without exposing full addresses', () => {
  const rows = [
    ['1', '', '', '', '', '台北縣三重市重新路一段12號'],
    ['2', '', '', '', '', '新北市三重區龍濱路15號'],
    ['3', '', '', '', '', '台北市士林區中正路100號'],
  ];
  assert.deepEqual(apiHelpers.roadOptionsFromRows(rows, '新北市', '三重區'), ['重新路', '龍濱路']);
  assert.deepEqual(apiHelpers.roadOptionsFromRows(rows, '台北市', '士林區'), ['中正路']);
  assert.deepEqual(apiHelpers.officialRoadOptionsFromRows([
    { city: '臺北市', site_id: '臺北市士林區', road: '中山北路六段' },
    { city: '臺北市', site_id: '臺北市大安區', road: '信義路四段' },
  ], '台北市', '士林區'), ['中山北路']);
});

test('registration and other delivery addresses use structured selectors', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const browser = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert.match(html, /id="lookup-customer"/);
  assert.match(html, /id="reg-city"/);
  assert.match(html, /id="reg-road"/);
  assert.match(html, /id="order-city"/);
  assert.doesNotMatch(html, /name="newAddress"/);
  assert.match(browser, /api\('customer-lookup'/);
  assert.match(browser, /api\('address-options'/);
  assert.match(browser, /structuredAddress\('order'/);
});

test('first use separates existing-member confirmation from new-member creation', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const browser = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const server = fs.readFileSync(path.join(__dirname, '..', 'api', 'index.js'), 'utf8');
  assert.match(html, /id="confirm-existing-member"[^>]*>資料正確，繼續/);
  assert.match(html, /id="change-existing-address"[^>]*>地址需要修改/);
  assert.match(html, /id="not-my-member"[^>]*>這不是我的資料/);
  assert.match(html, /id="start-new-member"[^>]*>建立會員資料/);
  assert.match(browser, /connectMember\(candidate\.customerId, '', ''/);
  assert.match(browser, /openRegistrationFields\('new-address'\)/);
  assert.match(browser, /openRegistrationFields\('new'\)/);
  assert.match(server, /if \(!matched && !name\).*建立新會員時請填寫姓名/);
  assert.doesNotMatch(server, /if \(!name \|\| phone\.length < 8\)/);
});

test('member bootstrap uses parallel LINE verification and one Sheets batch read', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'api', 'index.js'), 'utf8');
  assert.match(source, /const \[verify, profileResponse\] = await Promise\.all/);
  assert.match(source, /values:batchGet/);
  assert.match(source, /getBootstrapData\(profile\.userId, true\)/);
  assert.match(source, /Server-Timing/);
});

test('signed member session expires and rejects tampering', () => {
  const previous = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = 'test-only-member-session-secret';
  try {
    const now = Date.now();
    const token = apiHelpers.createSessionToken('U123', now);
    assert.equal(apiHelpers.verifySessionToken(token, now + 1000), 'U123');
    assert.equal(apiHelpers.verifySessionToken(`${token}x`, now + 1000), '');
    assert.equal(apiHelpers.verifySessionToken(token, now + 8 * 24 * 60 * 60 * 1000), '');
  } finally {
    if (previous === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previous;
  }
});

test('fast bootstrap skips order sheets and loads history lazily', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'api', 'index.js'), 'utf8');
  const browser = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const initialLoader = server.slice(server.indexOf('async function getBootstrapData'), server.indexOf('async function register'));
  assert.match(server, /action === 'fast-bootstrap'/);
  assert.match(server, /HttpOnly; Secure; SameSite=Lax/);
  assert.doesNotMatch(initialLoader, /SHEETS\.orders|SHEETS\.items/);
  assert.match(browser, /const fastDataPromise = api\('fast-bootstrap'\)/);
  assert.match(browser, /async function loadOrders\(\)/);
  assert.match(browser, /api\('orders'\)/);
});

test('repeat visits use an encrypted device snapshot without storing plain member data', () => {
  const browser = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert.match(browser, /AES-GCM/);
  assert.match(browser, /generateKey\([^;]+false, \['encrypt', 'decrypt'\]/s);
  assert.match(browser, /loadEncryptedSnapshot\(\)/);
  assert.match(browser, /ciphertext: bytesToBase64/);
  assert.doesNotMatch(browser, /localStorage\.setItem\([^\n]+contactName/);
});

test('customer history prices require both prior use and a positive price', () => {
  const history = apiHelpers.priceHistoryFromValues([
    1500, 2, 900, 0, 850, 1, 800, 3, 600, 4, 300, 1, 250, 2,
  ]);
  assert.deepEqual(history['50kg'], { price: 1500, hasHistory: true });
  assert.deepEqual(history['20kg'], { price: 900, hasHistory: false });
  assert.deepEqual(history['4kg'], { price: 250, hasHistory: true });
});

test('gas products use customer history price instead of the catalog price', () => {
  const member = { priceHistory: apiHelpers.priceHistoryFromValues([
    0, 0, 920, 2, 0, 0, 780, 1, 0, 0, 0, 0, 0, 0,
  ]) };
  const rows = [
    ['GAS-20', '桶裝瓦斯 20 公斤', '20公斤', '桶', 999, '啟用', 1],
    ['GAS-10', '桶裝瓦斯 10 公斤', '10公斤', '桶', 599, '啟用', 2],
  ];
  const products = apiHelpers.productsWithHistory(rows, member);
  assert.equal(products[0].price, 920);
  assert.equal(products[0].hasHistory, true);
  assert.equal(products[1].price, null);
  assert.equal(products[1].hasHistory, false);
});

test('order history keeps unknown specification prices pending', () => {
  const orders = [['SL-1', 'U1', 'C1', '王先生', '0912', '', '台北縣三重市重新路', '待確認', 'LINE LIFF', '', '', 'REQ', '2026-08-24T01:00:00.000Z']];
  const items = [
    ['I1', 'SL-1', 'GAS-20', '桶裝瓦斯 20 公斤', 1, 920, 920],
    ['I2', 'SL-1', 'GAS-10', '桶裝瓦斯 10 公斤', 1, 0, 0],
  ];
  const [order] = apiHelpers.ordersFromRows(orders, 'U1', items);
  assert.equal(order.total, null);
  assert.equal(order.items[0].subtotal, 920);
  assert.equal(order.items[1].subtotal, null);
  assert.equal(order.address, '新北市三重區重新路');
});

test('member sync includes customer gas history without debt fields', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'scripts', 'sync_customers_to_sheet.py'), 'utf8');
  assert.match(source, /price_50kg, use_50kg/);
  assert.match(source, /update_line_member_prices/);
  assert.doesNotMatch(source, /owe_money/);
});
