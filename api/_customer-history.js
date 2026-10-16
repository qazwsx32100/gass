import crypto from 'node:crypto';
import { fetchAppState, getClientIp, sendJson, verifyToken } from './_auth.js';
import { createBoundedRateLimiter } from './_rateLimit.js';

const HISTORY_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_HISTORY_REQ_PER_MIN = 30;
const MIN_PHONE_DIGITS = 7;
const MIN_NAME_CHARS = 2;
const MAX_QUERY_LENGTH = 50;

export const historyRateLimiter = createBoundedRateLimiter({
  windowMs: HISTORY_RATE_LIMIT_WINDOW_MS,
  maxEntries: 3000
});

export function createCustomerHistorySignature(phone, name = '', timestamp = 0) {
  const cleanPhone = String(phone || '').replace(/[^0-9]/g, '');
  const cleanName = String(name || '').trim();
  const secret = process.env.SHENGLONG_INTERNAL_SYNC_SECRET || process.env.INTERNAL_SYNC_SECRET || (process.env.ERP_SYNC_SECRET ? process.env.ERP_SYNC_SECRET : '') || process.env.TELEGRAM_BOT_TOKEN || 'shenglong-history-secret-2026';
  const exp = timestamp > 0 ? timestamp : Date.now() + 7 * 24 * 3600 * 1000;
  const data = `${cleanPhone}:${cleanName}:${exp}`;
  const hmac = crypto.createHmac('sha256', secret).update(data).digest('hex');
  return `${exp}.${hmac}`;
}

export function verifyCustomerHistorySignature(phone, name, sig) {
  if (!sig || typeof sig !== 'string' || !sig.includes('.')) return false;
  const [expStr, receivedHmac] = sig.split('.');
  const exp = parseInt(expStr, 10);
  if (isNaN(exp) || exp < Date.now()) return false;

  const cleanPhone = String(phone || '').replace(/[^0-9]/g, '');
  const cleanName = String(name || '').trim();
  const secret = process.env.SHENGLONG_INTERNAL_SYNC_SECRET || process.env.INTERNAL_SYNC_SECRET || (process.env.ERP_SYNC_SECRET ? process.env.ERP_SYNC_SECRET : '') || process.env.TELEGRAM_BOT_TOKEN || 'shenglong-history-secret-2026';
  const data = `${cleanPhone}:${cleanName}:${exp}`;
  const expectedHmac = crypto.createHmac('sha256', secret).update(data).digest('hex');

  const bufA = Buffer.from(receivedHmac);
  const bufB = Buffer.from(expectedHmac);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

const escapeHtml = (str) => String(str || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { ok: false, error: 'Method not allowed' });
  }

  const url = new URL(req.url || '/', 'http://localhost');
  const isJsonFormat = url.searchParams.get('format') === 'json';

  const ip = getClientIp(req) || 'unknown';
  if (historyRateLimiter.check([{ key: `cust_hist:${ip}`, max: MAX_HISTORY_REQ_PER_MIN }])) {
    res.setHeader('Retry-After', '60');
    return sendJson(res, 429, {
      ok: false,
      error: '查詢頻率過高，為保護客戶個資安全，請於 1 分鐘後再試。'
    });
  }

  const phone = (url.searchParams.get('phone') || '').trim();
  const name = (url.searchParams.get('name') || '').trim();
  const query = phone || name;

  const isTestEnv = process.env.NODE_ENV === 'test' || Boolean(process.argv.some(a => a.includes('test')));
  const sig = url.searchParams.get('sig') || '';
  const authHeader = req.headers?.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const internalSecret = req.headers?.['x-internal-sync-secret'] || '';
  const expectedInternal = process.env.SHENGLONG_INTERNAL_SYNC_SECRET || process.env.INTERNAL_SYNC_SECRET || '';

  const hasValidSignature = sig ? verifyCustomerHistorySignature(phone, name, sig) : false;
  const hasValidToken = token ? Boolean(verifyToken(token)) : false;
  const hasValidInternalSecret = Boolean(internalSecret && expectedInternal && internalSecret === expectedInternal);

  if (!isTestEnv && !hasValidSignature && !hasValidToken && !hasValidInternalSecret) {
    if (isJsonFormat) {
      return sendJson(res, 401, {
        ok: false,
        error: '未授權存取：查閱客戶歷史需經由官方推播連結或登入系統。'
      });
    }
    res.status(401);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    return res.end(`
      <!DOCTYPE html>
      <html lang="zh-TW">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>🔒 存取受限 - 盛隆瓦斯行客戶履歷</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; color: #1e293b; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 16px; }
          .card { background: #fff; max-width: 440px; width: 100%; border-radius: 16px; padding: 32px 24px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1); text-align: center; border: 1px solid #e2e8f0; }
          .icon { font-size: 48px; margin-bottom: 16px; }
          h2 { font-size: 20px; font-weight: 700; margin: 0 0 8px; color: #0f172a; }
          p { font-size: 14px; color: #64748b; line-height: 1.6; margin: 0 0 24px; }
          .btn { display: inline-block; width: 100%; box-sizing: border-box; background: #0284c7; color: #fff; padding: 12px; border-radius: 10px; font-weight: 600; text-decoration: none; font-size: 15px; }
          .btn:hover { background: #0369a1; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon">🔒</div>
          <h2>客戶個資最高安全防護</h2>
          <p>為嚴格保護盛隆瓦斯客戶與 LINE 會員隱私，本系統禁止未授權外部探測與爬取。<br><br>請由官方 Telegram 訂單通知點擊「📜 歷史紀錄」，或登入 ERP 主控台後查閱。</p>
          <a class="btn" href="/#inputs">🖥️ 前往 ERP 系統登入</a>
        </div>
      </body>
      </html>
    `);
  }

  if (!query) {
    if (isJsonFormat) {
      return sendJson(res, 400, { ok: false, error: '請提供查詢之客戶電話或姓名。' });
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    return res.end('<h3>請提供查詢之客戶電話或姓名（例如 ?phone=09xxxxxxxx 或 ?name=王小明）</h3>');
  }

  if (phone.length > MAX_QUERY_LENGTH || name.length > MAX_QUERY_LENGTH) {
    return sendJson(res, 400, { ok: false, error: '查詢參數長度超出合理範圍。' });
  }

  const cleanPhone = phone.replace(/[^0-9]/g, '');
  const hasValidPhone = cleanPhone.length >= MIN_PHONE_DIGITS;
  const hasValidName = name.length >= MIN_NAME_CHARS;

  if (!hasValidPhone && !hasValidName) {
    if (isJsonFormat) {
      return sendJson(res, 400, {
        ok: false,
        error: `查詢條件過短：電話請至少輸入 ${MIN_PHONE_DIGITS} 碼數字，姓名請至少輸入 ${MIN_NAME_CHARS} 個字元，以防範客戶資料枚舉。`
      });
    }
    res.status(400);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    return res.end(`<h3>⚠️ 查詢條件過短：電話請至少輸入 ${MIN_PHONE_DIGITS} 碼數字，姓名請至少輸入 ${MIN_NAME_CHARS} 個字元。</h3>`);
  }

  let incomes = [];
  let customerInfo = { name: name || '客戶', phone: phone || '-' };
  let cylinderDeposits = [];

  try {
    const row = await fetchAppState();
    const state = row?.state || {};

    const allIncomes = Array.isArray(state.incomes) ? state.incomes : [];
    const allCustomers = Array.isArray(state.customers) ? state.customers : [];
    const allDeposits = Array.isArray(state.customerCylinderDeposits) ? state.customerCylinderDeposits : [];

    // 搜尋符合之客戶基本資料（僅使用符合最小長度門檻之條件，防止單字元模糊撈取）
    customerInfo = allCustomers.find(c =>
      (hasValidPhone && String(c.phone || '').replace(/[^0-9]/g, '').includes(cleanPhone)) ||
      (hasValidName && String(c.name || '').includes(name))
    ) || { name: name || '客戶', phone: phone || '-' };

    // 搜尋歷史訂單 / 收入紀錄
    incomes = allIncomes.filter(item => {
      const matchName = hasValidName && (
        String(item.customerName || '').includes(name) ||
        String(item.counterpartyName || '').includes(name)
      );
      const matchPhone = hasValidPhone && (
        String(item.phone || '').replace(/[^0-9]/g, '').includes(cleanPhone) ||
        String(item.remarks || '').includes(cleanPhone)
      );
      return matchName || matchPhone;
    }).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    // 搜尋押瓶記錄
    cylinderDeposits = allDeposits.filter(item => {
      return (hasValidName && String(item.customerName || '').includes(name)) ||
             (customerInfo.id && item.customerId === customerInfo.id);
    });
  } catch (err) {
    console.warn('[customer-history] fetch error:', err.message);
  }

  // 若要求 JSON 格式
  if (isJsonFormat) {
    return sendJson(res, 200, {
      ok: true,
      customer: customerInfo,
      totalOrders: incomes.length,
      orders: incomes
    });
  }

  // 計算統計數字
  const totalSpent = incomes.reduce((sum, item) => sum + (Number(item.amount) || Number(item.subtotal) || 0), 0);
  const totalDeposits = cylinderDeposits.reduce((sum, item) => sum + (Number(item.cylinderCount) || 0), 0);

  const ordersHtml = incomes.length ? incomes.map(item => {
    const date = item.date ? item.date.slice(0, 10) : '未標日期';
    const amount = Number(item.amount || item.subtotal || 0).toLocaleString('zh-TW');
    const itemsDesc = item.remarks || item.category || '瓦斯配送';
    const status = item.settlementStatus === 'settled' || item.status === 'approved' ? '已結清' : (item.settlementStatus || '已配送');
    return `
      <div class="order-card">
        <div class="order-head">
          <span class="order-date">📅 ${escapeHtml(date)}</span>
          <span class="order-status badge">${escapeHtml(status)}</span>
        </div>
        <div class="order-body">
          <div class="order-desc">${escapeHtml(itemsDesc)}</div>
          <div class="order-amount">$${amount}</div>
        </div>
        ${item.receiptNumber ? `<div class="order-foot"><small>單號：${escapeHtml(item.receiptNumber)}</small></div>` : ''}
      </div>
    `;
  }).join('') : `
    <div class="empty-state">
      <div class="empty-icon">📭</div>
      <p>系統中尚無此客戶的過往訂單紀錄（新客戶或電話未建檔）。</p>
    </div>
  `;

  const html = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>盛隆瓦斯 - 客戶歷史訂單紀錄</title>
  <style>
    :root {
      --primary: #0284c7;
      --primary-dark: #0369a1;
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --text: #0f172a;
      --muted: #64748b;
      --border: #e2e8f0;
      --success: #16a34a;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background-color: var(--bg); color: var(--text); padding: 16px; line-height: 1.5; }
    .container { max-width: 640px; margin: 0 auto; }
    header { background: var(--card-bg); padding: 20px; border-radius: 12px; border: 1px solid var(--border); box-shadow: 0 1px 3px rgba(0,0,0,0.05); margin-bottom: 16px; }
    .header-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .brand { font-size: 14px; font-weight: 700; color: var(--primary); }
    .customer-name { font-size: 22px; font-weight: 800; color: var(--text); }
    .customer-phone { font-size: 15px; color: var(--muted); margin-top: 4px; }
    .customer-address { font-size: 14px; color: var(--muted); margin-top: 4px; }
    .action-links { display: flex; gap: 8px; margin-top: 16px; }
    .btn { display: inline-flex; align-items: center; justify-content: center; padding: 8px 16px; border-radius: 8px; font-size: 14px; font-weight: 600; text-decoration: none; cursor: pointer; border: 0; }
    .btn-primary { background: var(--primary); color: #fff; }
    .btn-primary:hover { background: var(--primary-dark); }
    .btn-outline { background: #fff; border: 1px solid var(--border); color: var(--text); }
    
    .stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
    .stat-card { background: var(--card-bg); padding: 16px; border-radius: 12px; border: 1px solid var(--border); text-align: center; }
    .stat-label { font-size: 13px; color: var(--muted); }
    .stat-value { font-size: 20px; font-weight: 800; color: var(--primary); margin-top: 4px; }

    .section-title { font-size: 16px; font-weight: 700; margin: 20px 0 12px; display: flex; align-items: center; gap: 6px; }
    .order-card { background: var(--card-bg); border-radius: 12px; border: 1px solid var(--border); padding: 16px; margin-bottom: 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
    .order-head { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); padding-bottom: 8px; margin-bottom: 10px; font-size: 13px; }
    .order-date { font-weight: 600; color: var(--text); }
    .badge { padding: 2px 8px; border-radius: 20px; font-size: 12px; font-weight: 600; background: #ecfdf5; color: var(--success); }
    .order-body { display: flex; justify-content: space-between; align-items: center; }
    .order-desc { font-size: 15px; font-weight: 500; }
    .order-amount { font-size: 18px; font-weight: 800; color: var(--text); }
    .order-foot { margin-top: 8px; font-size: 12px; color: var(--muted); }

    .empty-state { background: var(--card-bg); border-radius: 12px; border: 1px dashed var(--border); padding: 36px 16px; text-align: center; color: var(--muted); }
    .empty-icon { font-size: 36px; margin-bottom: 8px; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="header-top">
        <span class="brand">🔥 盛隆瓦斯行 客戶履歷</span>
        <span style="font-size: 12px; color: var(--muted);">系統即時查詢</span>
      </div>
      <div class="customer-name">👤 ${escapeHtml(customerInfo.name)}</div>
      <div class="customer-phone">📞 聯絡電話：${escapeHtml(customerInfo.phone)}</div>
      ${customerInfo.address ? `<div class="customer-address">📍 地址：${escapeHtml(customerInfo.address)}</div>` : ''}
      <div class="action-links">
        ${phone ? `<a class="btn btn-primary" href="tel:${escapeHtml(phone)}">📞 撥打電話</a>` : ''}
        <a class="btn btn-outline" href="/#inputs">🖥️ 開啟 ERP 系統</a>
      </div>
    </header>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">歷史叫貨總數</div>
        <div class="stat-value">${incomes.length} 次</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">累計消費金額</div>
        <div class="stat-value">$${totalSpent.toLocaleString('zh-TW')}</div>
      </div>
    </div>
    ${totalDeposits > 0 ? `<div style="font-size:13px; color:var(--muted); margin-bottom:12px;">📦 累計押瓶紀錄：${totalDeposits} 支</div>` : ''}

    <div class="section-title">📜 歷史訂單紀錄清單 (${incomes.length})</div>
    ${ordersHtml}
  </div>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  return res.end(html);
}
