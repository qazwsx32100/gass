const crypto = require('node:crypto');
const { modernizeAddress, addressesMatch } = require('./address-normalization');

const SHEETS = {
  master: '會員資料',
  members: 'LINE會員',
  addresses: '地址',
  products: '產品',
  orders: '訂單',
  items: '訂單明細',
};
const HISTORY_KEYS = ['50kg', '20kg', '18kg', '16kg', '10kg', 'new4kg', '4kg'];
const SESSION_COOKIE = 'sl_member_session';
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const INITIAL_CACHE_TTL_MS = 60_000;
const ADDRESS_OPTIONS_TTL_MS = 10 * 60_000;
const OFFICIAL_ROADS_URL = 'https://www.ris.gov.tw/rs-opendata/api/v1/datastore/ODRP049/113?page=1';

let googleTokenCache = { token: '', expiresAt: 0 };
const initialDataCache = new Map();
const addressOptionsCache = new Map();
let officialRoadCache = { rows: [], expiresAt: 0 };

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function clean(value, max = 200) {
  return String(value ?? '').trim().slice(0, max);
}

function normalizePhone(value) {
  let phone = String(value ?? '').replace(/\D/g, '');
  if (phone.startsWith('886')) phone = `0${phone.slice(3)}`;
  return phone;
}

function normalizeName(value) {
  return String(value ?? '').replace(/[\s　]/g, '').toLowerCase();
}

function maskName(value) {
  const name = clean(value, 60);
  if (!name) return '舊客戶';
  return `${name.slice(0, 1)}${'○'.repeat(Math.max(1, Math.min(2, name.length - 1)))}`;
}

function maskAddress(value) {
  const address = modernizeAddress(value);
  if (!address) return '未留地址';
  return address.replace(/\d+(?=號)/g, '○○').replace(/\d+(?=樓)/g, '○');
}

function extractPhonesFromRemarks(remarks) {
  if (!remarks) return [];
  const text = String(remarks);
  const matches = text.match(/(?:09\d{2}[-\s]?\d{3}[-\s]?\d{3}|0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}|\b\d{7,10}\b)/g) || [];
  return matches.map(normalizePhone).filter((p) => p.length >= 7);
}

function customerCandidatesFromRows(rows, phone) {
  const normalized = normalizePhone(phone);
  if (normalized.length < 7) return [];
  return rows.filter((row) => {
    const primary = normalizePhone(row[4]);
    if (primary === normalized) return true;
    const memoPhones = extractPhonesFromRemarks(row[8]);
    return memoPhones.includes(normalized);
  }).slice(0, 5).map((row) => ({
    customerId: clean(row[0], 80),
    name: maskName(row[3] || row[2]),
    address: maskAddress(row[5]),
    hasAddress: Boolean(clean(row[5])),
    matchedType: normalizePhone(row[4]) === normalized ? '主要電話' : '備註電話',
  }));
}

function roadOptionsFromRows(rows, city, district) {
  const wantedCity = clean(city, 10).replace(/臺/g, '台');
  const wantedDistrict = clean(district, 10);
  if (!['新北市', '台北市'].includes(wantedCity) || !wantedDistrict.endsWith('區')) return [];
  const roads = new Set();
  for (const row of rows) {
    const address = modernizeAddress(row[5]).replace(/臺/g, '台').replace(/[\s　]/g, '');
    const districtAt = address.indexOf(wantedDistrict);
    if (districtAt < 0) continue;
    if (address.includes('市') && !address.includes(wantedCity)) continue;
    const remainder = address.slice(districtAt + wantedDistrict.length);
    const match = remainder.match(/^(.+?(?:大道|路|街))(?:[一二三四五六七八九十\d]+段)?/);
    if (match?.[1]) roads.add(match[1]);
  }
  return [...roads].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
}

function officialRoadOptionsFromRows(rows, city, district) {
  const wantedCity = clean(city, 10).replace(/台/g, '臺');
  const wantedDistrict = clean(district, 10);
  return [...new Set(rows.filter((row) => clean(row.city, 10) === wantedCity && clean(row.site_id, 30).endsWith(wantedDistrict)).map((row) => clean(row.road, 60).replace(/[一二三四五六七八九十\d]+段$/, '')).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'zh-Hant'));
}

async function getOfficialRoadOptions(city, district) {
  if (officialRoadCache.expiresAt <= Date.now()) {
    const response = await fetch(OFFICIAL_ROADS_URL, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`Official road data failed (${response.status})`);
    const data = await response.json();
    officialRoadCache = { rows: Array.isArray(data.responseData) ? data.responseData : [], expiresAt: Date.now() + 24 * 60 * 60 * 1000 };
  }
  return officialRoadOptionsFromRows(officialRoadCache.rows, city, district);
}

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function sessionKey() {
  const secret = process.env.SESSION_SECRET || process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!secret) throw new Error('SESSION_SECRET is missing');
  return crypto.createHash('sha256').update(`shenglong-member-session-v1:${secret}`).digest();
}

function createSessionToken(lineUserId, now = Date.now()) {
  const payload = base64url(JSON.stringify({ uid: lineUserId, exp: Math.floor(now / 1000) + SESSION_TTL_SECONDS }));
  const signature = crypto.createHmac('sha256', sessionKey()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function verifySessionToken(token, now = Date.now()) {
  try {
    const [payload, signature] = String(token || '').split('.');
    if (!payload || !signature) return '';
    const expected = crypto.createHmac('sha256', sessionKey()).update(payload).digest();
    const received = Buffer.from(signature, 'base64url');
    if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) return '';
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.uid || Number(data.exp) <= Math.floor(now / 1000)) return '';
    return clean(data.uid, 80);
  } catch {
    return '';
  }
}

function cookieValue(req, name) {
  const entry = String(req.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : '';
}

function setMemberSession(res, lineUserId) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(createSessionToken(lineUserId))}; Max-Age=${SESSION_TTL_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Lax`);
  res.setHeader('Vary', 'Cookie');
}

async function getGoogleToken() {
  if (googleTokenCache.token && Date.now() < googleTokenCache.expiresAt - 60_000) {
    return googleTokenCache.token;
  }
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is missing');
  const credentials = JSON.parse(raw);
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64url(JSON.stringify({
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${claim}`);
  signer.end();
  const signature = signer.sign(credentials.private_key).toString('base64url');
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claim}.${signature}`,
    }),
  });
  if (!response.ok) throw new Error(`Google authorization failed (${response.status})`);
  const data = await response.json();
  googleTokenCache = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

function sheetUrl(path) {
  const id = process.env.GOOGLE_SPREADSHEET_ID;
  if (!id) throw new Error('GOOGLE_SPREADSHEET_ID is missing');
  return `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/${path}`;
}

async function sheetGet(range) {
  const token = await getGoogleToken();
  const response = await fetch(sheetUrl(`values/${encodeURIComponent(range)}?majorDimension=ROWS`), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Google Sheets read failed (${response.status})`);
  return (await response.json()).values || [];
}

async function sheetBatchGet(ranges) {
  const token = await getGoogleToken();
  const params = new URLSearchParams({ majorDimension: 'ROWS' });
  for (const range of ranges) params.append('ranges', range);
  const response = await fetch(sheetUrl(`values:batchGet?${params.toString()}`), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Google Sheets batch read failed (${response.status})`);
  const data = await response.json();
  return (data.valueRanges || []).map((range) => range.values || []);
}

async function sheetAppendRows(sheet, rows) {
  const token = await getGoogleToken();
  const response = await fetch(sheetUrl(`values/${encodeURIComponent(`${sheet}!A:Z`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: rows }),
  });
  if (!response.ok) throw new Error(`Google Sheets write failed (${response.status})`);
  return response.json();
}

async function sheetAppend(sheet, values) {
  return sheetAppendRows(sheet, [values]);
}

async function verifyLine(accessToken) {
  if (!accessToken) throw Object.assign(new Error('請先從 LINE 登入'), { status: 401 });
  const [verify, profileResponse] = await Promise.all([
    fetch(`https://api.line.me/oauth2/v2.1/verify?access_token=${encodeURIComponent(accessToken)}`),
    fetch('https://api.line.me/v2/profile', { headers: { Authorization: `Bearer ${accessToken}` } }),
  ]);
  if (!verify.ok) throw Object.assign(new Error('LINE 登入已失效，請重新開啟'), { status: 401 });
  const tokenInfo = await verify.json();
  if (String(tokenInfo.client_id) !== String(process.env.LINE_LOGIN_CHANNEL_ID)) {
    throw Object.assign(new Error('LINE 頻道驗證失敗'), { status: 401 });
  }
  if (!profileResponse.ok) throw Object.assign(new Error('無法取得 LINE 會員資料'), { status: 401 });
  return profileResponse.json();
}

function findMemberInRows(rows, lineUserId) {
  const row = rows.find((item) => item[0] === lineUserId);
  if (!row) return null;
  return {
    lineUserId: row[0], customerId: row[1] || '', displayName: row[2] || '',
    contactName: row[3] || '', phone: row[4] || '', status: row[5] || '',
    priceHistory: priceHistoryFromValues(row.slice(9, 23)),
  };
}

async function findMember(lineUserId) {
  return findMemberInRows(await sheetGet(`${SHEETS.members}!A2:W1000`), lineUserId);
}

function priceHistoryFromValues(values) {
  return Object.fromEntries(HISTORY_KEYS.map((key, index) => {
    const price = Number(values[index * 2] || 0);
    const useCount = Number(values[index * 2 + 1] || 0);
    return [key, { price: price > 0 ? price : null, hasHistory: useCount > 0 && price > 0 }];
  }));
}

function publicMember(member) {
  if (!member) return null;
  const { priceHistory, ...safeMember } = member;
  return safeMember;
}

function historyKeyForProduct(product) {
  const text = `${product.code} ${product.name} ${product.spec}`.replace(/\s/g, '');
  if ((text.includes('新') && /4(?:公斤|kg)/i.test(text))) return 'new4kg';
  const match = text.match(/(50|20|18|16|10|4)(?:公斤|kg)/i);
  return match ? `${match[1]}kg` : '';
}

function addressesFromRows(rows, lineUserId) {
  return rows.filter((row) => row[1] === lineUserId && row[6] !== '停用').map((row) => ({
    id: row[0], label: row[3] || '配送地址', address: modernizeAddress(row[4] || ''), isDefault: row[5] === '是',
  }));
}

async function getAddresses(lineUserId) {
  return addressesFromRows(await sheetGet(`${SHEETS.addresses}!A2:I2000`), lineUserId);
}

function productsFromRows(rows) {
  return rows.filter((row) => row[5] !== '停用').map((row) => ({
    code: row[0], name: row[1], spec: row[2], unit: row[3], price: Number(row[4] || 0), sort: Number(row[6] || 0),
  })).sort((a, b) => a.sort - b.sort);
}

function productsWithHistory(rows, member) {
  return productsFromRows(rows).map((product) => {
    const history = member?.priceHistory?.[historyKeyForProduct(product)] || { price: null, hasHistory: false };
    return { ...product, price: history.hasHistory ? history.price : null, hasHistory: history.hasHistory };
  });
}

async function getProducts() {
  return productsFromRows(await sheetGet(`${SHEETS.products}!A2:G100`));
}

function orderItemsFromRows(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const orderId = row[1] || '';
    if (!orderId) continue;
    const rawPrice = Number(row[5] || 0);
    const rawSubtotal = Number(row[6] || 0);
    const price = rawPrice > 0 ? rawPrice : null;
    const subtotal = rawSubtotal > 0 ? rawSubtotal : null;
    const item = { code: row[2] || '', name: row[3] || '', quantity: Number(row[4] || 0), price, subtotal };
    grouped.set(orderId, [...(grouped.get(orderId) || []), item]);
  }
  return grouped;
}

function ordersFromRows(rows, lineUserId, itemRows = []) {
  const itemsByOrder = orderItemsFromRows(itemRows);
  return rows.filter((row) => row[1] === lineUserId).slice(-20).reverse().map((row) => ({
    id: row[0], address: modernizeAddress(row[6] || ''), status: row[7] || '', note: row[9] || '',
    total: Number(row[10] || 0) > 0 ? Number(row[10]) : null, createdAt: row[12] || '',
    items: itemsByOrder.get(row[0]) || [],
  }));
}

async function getOrders(lineUserId) {
  const [orderRows, itemRows] = await sheetBatchGet([`${SHEETS.orders}!A2:N5000`, `${SHEETS.items}!A2:I10000`]);
  return ordersFromRows(orderRows, lineUserId, itemRows);
}

async function getBootstrapData(lineUserId, forceRefresh = false) {
  const cached = initialDataCache.get(lineUserId);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached.data;
  const [memberRows, addressRows, productRows] = await sheetBatchGet([
    `${SHEETS.members}!A2:W1000`,
    `${SHEETS.addresses}!A2:I2000`,
    `${SHEETS.products}!A2:G100`,
  ]);
  const member = findMemberInRows(memberRows, lineUserId);
  const data = {
    member: publicMember(member),
    addresses: member ? addressesFromRows(addressRows, lineUserId) : [],
    products: productsWithHistory(productRows, member),
  };
  if (initialDataCache.size >= 200) initialDataCache.delete(initialDataCache.keys().next().value);
  initialDataCache.set(lineUserId, { data, expiresAt: Date.now() + INITIAL_CACHE_TTL_MS });
  return data;
}

function invalidateInitialData(lineUserId) {
  initialDataCache.delete(lineUserId);
}

const DEFAULT_PRICES = {
  '50kg': 2100,
  '20kg': 850,
  '18kg': 800,
  '16kg': 750,
  '10kg': 550,
  'new4kg': 350,
  '4kg': 350,
};

async function notifyDispatchWebhook(orderPayload) {
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const fallbackChatId = process.env.ADMIN_CHAT_ID;
  const orderChatId = process.env.TELEGRAM_ORDER_CHAT_ID || fallbackChatId;
  const reportChatId = process.env.TELEGRAM_REPORT_CHAT_ID || fallbackChatId;

  if (telegramToken && (orderChatId || reportChatId)) {
    try {
      const itemsText = (orderPayload.items || []).map((i) => `${i.name} × ${i.quantity}`).join(', ');
      const discountText = orderPayload.discount > 0 ? ` (已折抵 $${orderPayload.discount})` : '';
      const text = 
`📦 *【盛隆瓦斯 - 收到 LINE 新訂單】*
────────────────────────
👤 *客戶姓名*：${orderPayload.customerName}
📞 *聯絡電話*：${orderPayload.phone}
📍 *配送地址*：${orderPayload.address}
⚡ *叫貨規格*：${itemsText}
💰 *應收金額*：$${orderPayload.total}${discountText}
📝 *備註*：${orderPayload.note || '無'}
⏰ *下單時間*：${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}
────────────────────────`;

      const orderId = orderPayload.orderId || `ord_${Date.now()}`;
      const baseUrl = (process.env.APP_BASE_URL || process.env.ERP_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://erp-weld-three-96.vercel.app')).replace(/\/$/, '');
      const historyUrl = `${baseUrl}/api/customer-history?phone=${encodeURIComponent(orderPayload.phone || '')}&name=${encodeURIComponent(orderPayload.customerName || '')}`;

      const navRow = [];
      if (orderPayload.address) {
        navRow.push({
          text: '🗺️ 地圖導航',
          url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(orderPayload.address)}`
        });
      }

      navRow.push({
        text: '📜 歷史紀錄',
        url: historyUrl
      });

      const ackRow = [
        {
          text: '✅ 接單確認',
          callback_data: `act:ack_order:${orderId}`
        }
      ];

      const replyMarkup = { inline_keyboard: [navRow, ackRow] };
      const targetChats = new Set();
      if (orderChatId) targetChats.add(orderChatId);
      if (reportChatId) targetChats.add(reportChatId);

      const sendPromises = Array.from(targetChats).map((chatId) =>
        fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: 'Markdown',
            reply_markup: replyMarkup
          }),
          signal: AbortSignal.timeout(4000),
        }).catch((e) => console.warn(`Telegram send to ${chatId} failed:`, e.message))
      );

      await Promise.allSettled(sendPromises);
    } catch (err) {
      console.warn('Telegram notify error:', err.message);
    }
  }
}

async function lookupCustomers(body) {
  const phone = normalizePhone(body.phone);
  if (phone.length < 7) throw Object.assign(new Error('請輸入正確的電話號碼'), { status: 400 });
  const master = await sheetGet(`${SHEETS.master}!A2:I5000`);
  return { phone, candidates: customerCandidatesFromRows(master, phone) };
}

async function getAddressOptions(body) {
  const city = clean(body.city, 10).replace(/臺/g, '台');
  const district = clean(body.district, 10);
  const cacheKey = `${city}|${district}`;
  const cached = addressOptionsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.roads;
  const master = await sheetGet(`${SHEETS.master}!A2:F5000`);
  let roads = roadOptionsFromRows(master, city, district);
  if (!roads.length && city === '台北市') {
    try { roads = await getOfficialRoadOptions(city, district); } catch (error) { console.error(JSON.stringify({ level: 'warn', message: 'Official road fallback failed', error: error.message })); }
  }
  addressOptionsCache.set(cacheKey, { roads, expiresAt: Date.now() + ADDRESS_OPTIONS_TTL_MS });
  return roads;
}

async function register(profile, body) {
  const existing = await findMember(profile.userId);
  if (existing) return existing;
  const name = clean(body.name, 60);
  const phone = normalizePhone(body.phone);
  const inputAddress = modernizeAddress(clean(body.address, 200));
  if (phone.length < 7) throw Object.assign(new Error('請填寫正確電話'), { status: 400 });

  const master = await sheetGet(`${SHEETS.master}!A2:Z5000`);
  const phoneMatches = master.filter((row) => normalizePhone(row[4]) === phone || extractPhonesFromRemarks(row[8]).includes(phone));
  const requestedCustomerId = clean(body.customerId, 80);
  let matched = null;
  if (body.lookupConfirmed) {
    matched = requestedCustomerId ? phoneMatches.find((row) => clean(row[0], 80) === requestedCustomerId) : null;
    if (requestedCustomerId && !matched) throw Object.assign(new Error('客戶資料已更新，請重新查詢電話'), { status: 409 });
  } else {
    const wantedName = normalizeName(name);
    const candidates = phoneMatches.filter((row) => {
      const storedName = normalizeName(row[3] || row[2]);
      const nameMatches = storedName && wantedName && (storedName === wantedName || storedName.includes(wantedName) || wantedName.includes(storedName));
      const addressMatches = inputAddress && addressesMatch(row[5], inputAddress);
      return nameMatches || addressMatches;
    });
    matched = candidates.length === 1 ? candidates[0] : null;
  }
  if (!matched && !name) throw Object.assign(new Error('建立新會員時請填寫姓名'), { status: 400 });
  const customerId = matched?.[0] || `LINE-${crypto.randomUUID()}`;
  const contactName = matched?.[3] || matched?.[2] || name;
  const address = inputAddress || modernizeAddress(matched?.[5]);
  const priceValues = matched ? matched.slice(12, 26) : Array(14).fill('');
  if (!address) throw Object.assign(new Error('查無既有地址，請填寫配送地址'), { status: 400 });
  const now = new Date().toISOString();
  await sheetAppend(SHEETS.members, [profile.userId, customerId, clean(profile.displayName, 60), contactName, phone, '啟用', now, now, now, ...priceValues]);
  await sheetAppend(SHEETS.addresses, [crypto.randomUUID(), profile.userId, customerId, '預設地址', address, '是', '啟用', now, now]);
  invalidateInitialData(profile.userId);
  return { lineUserId: profile.userId, customerId, displayName: profile.displayName, contactName, phone, status: '啟用', priceHistory: priceHistoryFromValues(priceValues) };
}

async function createOrder(profile, body) {
  const [memberRows, addressRows, productRows, prior, itemRows] = await sheetBatchGet([
    `${SHEETS.members}!A2:W1000`,
    `${SHEETS.addresses}!A2:I2000`,
    `${SHEETS.products}!A2:G100`,
    `${SHEETS.orders}!A2:N5000`,
    `${SHEETS.items}!A2:I10000`,
  ]);
  const member = findMemberInRows(memberRows, profile.userId);
  if (!member) throw Object.assign(new Error('請先完成會員資料'), { status: 409 });
  const requestId = clean(body.requestId, 80);
  if (!requestId) throw Object.assign(new Error('訂單識別碼遺失'), { status: 400 });
  const duplicate = prior.find((row) => row[1] === profile.userId && row[11] === requestId);
  if (duplicate) {
    const order = ordersFromRows([duplicate], profile.userId, itemRows)[0];
    return { orderId: duplicate[0], duplicate: true, order, orders: ordersFromRows(prior, profile.userId, itemRows) };
  }

  const products = productsWithHistory(productRows, member);
  const allowed = new Map(products.map((p) => [p.code, p]));
  const items = (Array.isArray(body.items) ? body.items : []).map((item) => ({ code: clean(item.code, 30), quantity: Math.max(0, Math.min(20, Number(item.quantity) || 0)) })).filter((item) => item.quantity > 0 && allowed.has(item.code));
  if (!items.length) throw Object.assign(new Error('請至少選擇一項瓦斯規格'), { status: 400 });

  const addresses = addressesFromRows(addressRows, profile.userId);
  let selected = addresses.find((item) => item.id === body.addressId);
  let deliveryAddress = selected?.address || clean(body.newAddress, 200);
  let addressId = selected?.id || '';
  const now = new Date().toISOString();
  if (!deliveryAddress) throw Object.assign(new Error('請選擇或填寫配送地址'), { status: 400 });
  if (!selected && body.saveAddress) {
    addressId = crypto.randomUUID();
    await sheetAppend(SHEETS.addresses, [addressId, profile.userId, member.customerId, clean(body.addressLabel, 30) || '其他地址', deliveryAddress, '否', '啟用', now, now]);
  }
  const orderId = `SL-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const detailRows = items.map((item) => {
    const product = allowed.get(item.code);
    const unitPrice = product.hasHistory && product.price ? Number(product.price) : (DEFAULT_PRICES[item.code] || 800);
    const subtotal = unitPrice * item.quantity;
    return { product, quantity: item.quantity, unitPrice, subtotal };
  });

  const subtotal = detailRows.reduce((sum, row) => sum + row.subtotal, 0);
  const discount = Math.max(0, Number(body.discount) || 0);
  const total = Math.max(0, subtotal - discount);
  const note = clean(body.note, 300);

  const fullNote = [note, discount > 0 ? `[優惠折抵 $${discount}：${clean(body.promoName || body.promoCode, 40)}]` : ''].filter(Boolean).join(' | ');

  await sheetAppend(SHEETS.orders, [orderId, profile.userId, member.customerId, member.contactName, member.phone, addressId, deliveryAddress, '待確認', 'LINE LIFF', fullNote, total, requestId, now, now]);
  await sheetAppendRows(SHEETS.items, detailRows.map((row) => [
    crypto.randomUUID(), orderId, row.product.code, row.product.name, row.quantity,
    row.unitPrice, row.subtotal, now,
  ]));
  if (!selected && body.saveAddress) invalidateInitialData(profile.userId);

  // 非同步推播至 Telegram / 派工中樞
  notifyDispatchWebhook({
    orderId,
    customerName: member.contactName,
    phone: member.phone,
    address: deliveryAddress,
    items: detailRows.map((r) => ({ name: r.product.name, quantity: r.quantity })),
    discount,
    total,
    note: fullNote,
  }).catch((e) => console.warn('Dispatch webhook warning:', e.message));

  const order = {
    id: orderId, address: modernizeAddress(deliveryAddress), status: '待確認', note: fullNote,
    total, createdAt: now,
    items: detailRows.map((row) => ({
      code: row.product.code, name: row.product.name, quantity: row.quantity,
      price: row.unitPrice, subtotal: row.subtotal,
    })),
  };
  return { orderId, duplicate: false, order, orders: [order, ...ordersFromRows(prior, profile.userId, itemRows)].slice(0, 20) };
}

module.exports = async (req, res) => {
  const startedAt = Date.now();
  const requestedAction = clean(req.query.action || req.body?.action, 30) || 'bootstrap';
  const reply = (status, body) => {
    const duration = Date.now() - startedAt;
    res.setHeader('Server-Timing', `app;dur=${duration}`);
    console.log(JSON.stringify({ level: 'info', message: 'Request completed', action: requestedAction, status, duration_ms: duration }));
    return json(res, status, body);
  };
  try {
    if (req.method === 'OPTIONS') return reply(204, {});
    if (!['GET', 'POST'].includes(req.method)) return reply(405, { ok: false, message: 'Method not allowed' });
    const action = requestedAction;
    const sessionUserId = verifySessionToken(cookieValue(req, SESSION_COOKIE));

    if (action === 'fast-bootstrap') {
      if (req.method !== 'GET') return reply(405, { ok: false, message: '請使用正確的操作方式' });
      if (!sessionUserId) return reply(401, { ok: false, message: '快速會員憑證尚未建立' });
      const bootstrap = await getBootstrapData(sessionUserId);
      setMemberSession(res, sessionUserId);
      return reply(200, { ok: true, fast: true, profile: { displayName: bootstrap.member?.displayName || 'LINE 會員', pictureUrl: '' }, ...bootstrap });
    }

    if (action === 'orders') {
      let lineUserId = sessionUserId;
      if (!lineUserId) {
        const accessToken = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
        lineUserId = (await verifyLine(accessToken)).userId;
      }
      setMemberSession(res, lineUserId);
      return reply(200, { ok: true, orders: await getOrders(lineUserId) });
    }

    const accessToken = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const profile = await verifyLine(accessToken);

    if (action === 'bootstrap') {
      const bootstrap = await getBootstrapData(profile.userId, true);
      setMemberSession(res, profile.userId);
      return reply(200, { ok: true, profile: { displayName: profile.displayName, pictureUrl: profile.pictureUrl || '' }, ...bootstrap });
    }
    if (req.method !== 'POST') return reply(405, { ok: false, message: '請使用正確的操作方式' });
    if (action === 'customer-lookup') {
      return reply(200, { ok: true, ...(await lookupCustomers(req.body || {})) });
    }
    if (action === 'address-options') {
      return reply(200, { ok: true, roads: await getAddressOptions(req.body || {}) });
    }
    if (action === 'register') {
      const member = await register(profile, req.body || {});
      setMemberSession(res, profile.userId);
      return reply(200, { ok: true, member: publicMember(member), addresses: await getAddresses(profile.userId) });
    }
    if (action === 'order') {
      setMemberSession(res, profile.userId);
      return reply(200, { ok: true, ...(await createOrder(profile, req.body || {})) });
    }
    return reply(404, { ok: false, message: '找不到此功能' });
  } catch (error) {
    const status = Number(error.status) || 500;
    console.error(JSON.stringify({ level: 'error', message: 'Request failed', action: requestedAction, status, error: error.message, duration_ms: Date.now() - startedAt }));
    return reply(status, { ok: false, message: status >= 500 ? '系統暫時忙碌，請稍後再試' : error.message });
  }
};

module.exports._test = {
  createSessionToken, verifySessionToken, priceHistoryFromValues, historyKeyForProduct,
  productsWithHistory, ordersFromRows, customerCandidatesFromRows, roadOptionsFromRows, officialRoadOptionsFromRows,
};
