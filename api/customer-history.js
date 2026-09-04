import { fetchAppState, sendJson } from './_auth.js';

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

  const url = new URL(req.url, 'http://localhost');
  const phone = (url.searchParams.get('phone') || '').trim();
  const name = (url.searchParams.get('name') || '').trim();
  const query = phone || name;

  if (!query) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end('<h3>請提供查詢之客戶電話或姓名（例如 ?phone=09xxxxxxxx 或 ?name=王小明）</h3>');
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

    // 搜尋符合之客戶基本資料
    customerInfo = allCustomers.find(c =>
      (phone && String(c.phone || '').includes(phone)) ||
      (name && String(c.name || '').includes(name))
    ) || { name: name || '客戶', phone: phone || '-' };

    // 搜尋歷史訂單 / 收入紀錄
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    incomes = allIncomes.filter(item => {
      const matchName = name && (
        String(item.customerName || '').includes(name) ||
        String(item.counterpartyName || '').includes(name)
      );
      const matchPhone = cleanPhone && (
        String(item.phone || '').replace(/[^0-9]/g, '').includes(cleanPhone) ||
        String(item.remarks || '').includes(cleanPhone)
      );
      return matchName || matchPhone;
    }).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    // 搜尋押瓶記錄
    cylinderDeposits = allDeposits.filter(item => {
      return (name && String(item.customerName || '').includes(name)) ||
             (customerInfo.id && item.customerId === customerInfo.id);
    });
  } catch (err) {
    console.warn('[customer-history] fetch error:', err.message);
  }

  // 若要求 JSON 格式
  if (url.searchParams.get('format') === 'json') {
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

    <div class="section-title">📜 歷史訂單紀錄清單 (${incomes.length})</div>
    ${ordersHtml}
  </div>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.end(html);
}
