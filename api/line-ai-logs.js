import crypto from 'node:crypto';
import { fetchLineAiLogs } from './_line-ai-logger.js';
import { sendJson, verifyToken, getBearerToken, getClientIp } from './_auth.js';
import { createBoundedRateLimiter } from './_rateLimit.js';

const lineLogsRateLimiter = createBoundedRateLimiter({
  windowMs: 60 * 1000,
  maxEntries: 2000
});

const lineLogsAuthFailLimiter = createBoundedRateLimiter({
  windowMs: 5 * 60 * 1000,
  maxEntries: 2000
});

export function maskLineUserId(uid) {
  const s = String(uid || '').trim();
  if (!s || s === 'unknown') return '未知';
  if (s.length <= 10) return `${s.slice(0, 3)}***`;
  return `${s.slice(0, 6)}...${s.slice(-4)}`;
}

export function isAuthorizedToViewLogs(req) {
  // 1. 檢查 Bearer Token
  const bearer = getBearerToken(req);
  if (bearer) {
    const decoded = verifyToken(bearer);
    if (decoded && (decoded.role === 'admin' || decoded.role === 'business_reviewer' || decoded.id === 'ADMIN')) {
      return true;
    }
  }

  // 2. 檢查 Query Token (?token=...)
  const queryToken = req.query?.token;
  if (queryToken) {
    const decoded = verifyToken(queryToken);
    if (decoded) return true;
  }

  // 3. 檢查 Query Key 或 Header (?key=... 或 ?secret=...)
  const providedKey = String(req.query?.key || req.query?.secret || req.headers['x-admin-key'] || '').trim();
  const validSecrets = [
    process.env.ADMIN_SESSION_SECRET,
    process.env.ERP_SYNC_SECRET,
    process.env.TELEGRAM_WEBHOOK_SECRET
  ].filter(Boolean);

  if (providedKey && validSecrets.length > 0) {
    const provBuf = Buffer.from(providedKey);
    const matches = validSecrets.some(sec => {
      const secBuf = Buffer.from(sec);
      return secBuf.length === provBuf.length && crypto.timingSafeEqual(secBuf, provBuf);
    });
    if (matches) return true;
  }

  return false;
}

function renderAuthLockScreen() {
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <title>盛隆管理員安全驗證 - LINE AI 對話看板</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 16px; box-sizing: border-box; }
    .auth-card { background: #1e293b; border: 1px solid #334155; border-radius: 16px; padding: 32px; max-width: 440px; width: 100%; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); text-align: center; }
    .icon { font-size: 40px; margin-bottom: 12px; }
    h2 { margin: 0 0 8px 0; font-size: 20px; font-weight: 800; color: #38bdf8; }
    p { margin: 0 0 24px 0; font-size: 13px; color: #94a3b8; line-height: 1.6; }
    input { width: 100%; box-sizing: border-box; background: #0f172a; border: 1px solid #475569; border-radius: 10px; padding: 12px 16px; color: #fff; font-size: 14px; margin-bottom: 16px; outline: none; }
    input:focus { border-color: #38bdf8; }
    button { width: 100%; background: #0284c7; color: white; border: none; border-radius: 10px; padding: 12px; font-size: 14px; font-weight: bold; cursor: pointer; transition: background 0.2s; }
    button:hover { background: #0369a1; }
    .back { margin-top: 16px; display: inline-block; font-size: 12px; color: #64748b; text-decoration: none; }
    .back:hover { color: #94a3b8; }
  </style>
</head>
<body>
  <div class="auth-card">
    <div class="icon">🔒</div>
    <h2>盛隆管理員安全驗證</h2>
    <p>此看板記錄客戶即時叫瓦斯、住址與聯絡資訊。為守護客戶個人隱私，請驗證管理員授權金鑰後方可查閱。</p>
    <form method="GET" action="/api/line-ai-logs">
      <input type="password" name="key" placeholder="請輸入管理金鑰 (Secret Key)" required autofocus />
      <input type="hidden" name="format" value="html" />
      <button type="submit">驗證並進入看板</button>
    </form>
    <a href="/" class="back">← 回到盛隆 ERP 首頁</a>
  </div>
</body>
</html>`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatTaipeiTime(isoString) {
  if (!isoString) return '--';
  try {
    const d = new Date(isoString);
    return d.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
  } catch {
    return isoString;
  }
}

function renderHtmlDashboard(result, queryParams) {
  const { logs = [], total = 0, source = 'supabase' } = result;
  const orderCount = logs.filter(l => l.is_order_intent).length;
  const qazCount = logs.filter(l => (l.account_name || '').includes('qaz')).length;
  const wumingCount = logs.filter(l => (l.account_name || '').includes('無名')).length;
  const shendengCount = logs.filter(l => (l.account_name || '').includes('神燈')).length;
  const openaiCount = logs.filter(l => l.provider === 'openai' || (l.model && l.model.includes('gpt'))).length;
  const expertCount = logs.filter(l => l.mode === 'expert' || l.raw_event?.aiResult?.mode === 'expert' || (l.user_message && /點不著|打不著|熄火|忽冷忽熱|漏氣|結霜/i.test(l.user_message))).length;

  const currentSearch = escapeHtml(queryParams.search || '');
  const isOrderOnly = queryParams.orderIntent === 'true';

  const cardsHtml = logs.length === 0
    ? `<div class="empty-state">
        <div class="empty-icon">💬</div>
        <h3>目前尚無 LINE AI 對話紀錄</h3>
        <p>當有客戶在 LINE 官方帳號發送訊息時，系統將自動在此顯示即時問答紀錄。</p>
       </div>`
    : logs.map((item, idx) => {
        const timeStr = formatTaipeiTime(item.created_at);
        const isOrder = item.is_order_intent;
        const providerName = item.provider === 'openai' ? 'OpenAI' : 'Google Gemini';
        const modelName = item.model || 'gemini-3.8-flash';
        const tokens = item.tokens ? `${item.tokens} tokens` : '';
        const latency = item.latency_ms ? `${item.latency_ms}ms` : '';
        const isExpert = item.mode === 'expert' || item.raw_event?.aiResult?.mode === 'expert' || (item.user_message && /點不著|打不著|熄火|忽冷忽熱|漏氣|結霜/i.test(item.user_message));
        const modeLabel = isExpert ? '🔍 深度專家推理 (Expert)' : '⚡ 輕量秒回 (Fast)';
        const modeStyle = isExpert ? 'background:#fef3c7;color:#92400e;' : 'background:#e0f2fe;color:#0369a1;';
        const metaInfo = [providerName, modelName, tokens, latency].filter(Boolean).join(' · ');

        return `
        <div class="chat-card ${isOrder ? 'order-highlight' : ''}">
          <div class="card-header">
            <div class="header-left">
              <span class="user-badge">👤 客戶 [${escapeHtml(maskLineUserId(item.line_user_id))}]</span>
              ${isOrder ? '<span class="tag tag-order">🔥 疑似叫瓦斯訂單</span>' : '<span class="tag tag-chat">💬 一般諮詢</span>'}
              <span class="tag" style="${modeStyle}">${modeLabel}</span>
              ${item.account_name ? `<span class="tag" style="background:#f1f5f9;color:#334155;border:1px solid #cbd5e1;">🔄 輪調帳號: ${escapeHtml(item.account_name)}</span>` : ''}
            </div>
            <div class="header-right">
              <span class="timestamp">⏰ ${timeStr}</span>
            </div>
          </div>
          
          <div class="dialogue-body">
            <!-- 客戶訊息 -->
            <div class="msg-bubble user-bubble">
              <div class="bubble-sender">客戶發問</div>
              <div class="bubble-content">${escapeHtml(item.user_message)}</div>
            </div>

            <!-- AI 回覆 -->
            <div class="msg-bubble ai-bubble">
              <div class="bubble-sender">🤖 盛隆 AI 智慧客服回覆</div>
              <div class="bubble-content">${escapeHtml(item.ai_reply).replace(/\n/g, '<br/>')}</div>
              <div class="bubble-meta">
                <span>⚡ ${escapeHtml(metaInfo)}</span>
                ${item.account_name ? `<span>🔑 輪調帳號: <b>${escapeHtml(item.account_name)}</b></span>` : ''}
              </div>
            </div>
          </div>
        </div>
        `;
      }).join('\n');

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>盛隆瓦斯 - LINE AI 客服對話歷史紀錄中心</title>
  <style>
    :root {
      --primary: #059669;
      --primary-dark: #047857;
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --text: #1e293b;
      --text-muted: #64748b;
      --border: #e2e8f0;
      --user-bg: #e0f2fe;
      --user-border: #bae6fd;
      --ai-bg: #ecfdf5;
      --ai-border: #a7f3d0;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
    body { background-color: var(--bg); color: var(--text); padding: 16px; min-height: 100vh; }
    .container { max-width: 900px; margin: 0 auto; }
    
    header { background: #fff; padding: 20px 24px; border-radius: 12px; border: 1px solid var(--border); margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    .title-row { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
    h1 { font-size: 1.4rem; color: #0f172a; display: flex; align-items: center; gap: 8px; }
    .badge-src { font-size: 0.75rem; background: #e2e8f0; color: #475569; padding: 4px 8px; border-radius: 20px; font-weight: normal; }
    
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-top: 16px; }
    .stat-card { background: #f8fafc; border: 1px solid var(--border); border-radius: 8px; padding: 12px; text-align: center; }
    .stat-val { font-size: 1.5rem; font-weight: bold; color: var(--primary); }
    .stat-label { font-size: 0.8rem; color: var(--text-muted); margin-top: 4px; }
    
    .toolbar { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
    .search-box { flex: 1; min-width: 240px; display: flex; }
    .search-box input { flex: 1; padding: 10px 14px; border: 1px solid var(--border); border-radius: 8px 0 0 8px; font-size: 0.95rem; outline: none; }
    .search-box button { padding: 10px 16px; background: var(--primary); color: #fff; border: none; border-radius: 0 8px 8px 0; cursor: pointer; font-weight: 500; }
    .filter-btn { padding: 10px 14px; background: #fff; border: 1px solid var(--border); border-radius: 8px; font-size: 0.9rem; cursor: pointer; text-decoration: none; color: var(--text); display: inline-flex; align-items: center; gap: 6px; }
    .filter-btn.active { background: #059669; color: #fff; border-color: #059669; font-weight: bold; }
    
    .chat-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 16px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.03); transition: transform 0.1s ease; }
    .chat-card:hover { border-color: #cbd5e1; }
    .chat-card.order-highlight { border-left: 4px solid #f97316; }
    
    .card-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f1f5f9; padding-bottom: 10px; margin-bottom: 12px; font-size: 0.85rem; flex-wrap: wrap; gap: 8px; }
    .header-left { display: flex; align-items: center; gap: 8px; }
    .user-badge { font-weight: 600; color: #334155; }
    .timestamp { color: var(--text-muted); }
    
    .tag { font-size: 0.75rem; padding: 2px 8px; border-radius: 12px; font-weight: 600; }
    .tag-order { background: #ffedd5; color: #c2410c; }
    .tag-chat { background: #e2e8f0; color: #475569; }
    
    .dialogue-body { display: flex; flex-direction: column; gap: 12px; }
    .msg-bubble { padding: 12px 14px; border-radius: 10px; max-width: 95%; position: relative; font-size: 0.95rem; line-height: 1.5; }
    .bubble-sender { font-size: 0.75rem; font-weight: 600; margin-bottom: 4px; color: var(--text-muted); }
    .user-bubble { background: var(--user-bg); border: 1px solid var(--user-border); align-self: flex-start; }
    .ai-bubble { background: var(--ai-bg); border: 1px solid var(--ai-border); align-self: flex-end; width: 95%; }
    .bubble-meta { margin-top: 8px; padding-top: 6px; border-top: 1px dashed rgba(5,150,105,0.2); font-size: 0.75rem; color: #065f46; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
    
    .empty-state { text-align: center; padding: 48px 20px; background: #fff; border-radius: 12px; border: 1px solid var(--border); color: var(--text-muted); }
    .empty-icon { font-size: 2.5rem; margin-bottom: 12px; }
    
    .footer-actions { text-align: center; margin-top: 24px; padding-bottom: 30px; font-size: 0.85rem; color: var(--text-muted); }
    .footer-actions a { color: var(--primary); text-decoration: none; font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="title-row">
        <h1>🔥 盛隆瓦斯 ｜ LINE AI 客服對話歷史紀錄 <span class="badge-src">${escapeHtml(source)}</span></h1>
        <a href="?format=json" target="_blank" class="filter-btn">📥 匯出 JSON 資料</a>
      </div>
      
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-val">${total}</div>
          <div class="stat-label">累積對話總數</div>
        </div>
        <div class="stat-card">
          <div class="stat-val" style="color: #2563eb;">${qazCount}</div>
          <div class="stat-label">🔄 帳號: qaz</div>
        </div>
        <div class="stat-card">
          <div class="stat-val" style="color: #0284c7;">${wumingCount}</div>
          <div class="stat-label">🔄 帳號: 無名</div>
        </div>
        <div class="stat-card">
          <div class="stat-val" style="color: #7c3aed;">${shendengCount}</div>
          <div class="stat-label">🔄 帳號: 神燈</div>
        </div>
        <div class="stat-card">
          <div class="stat-val" style="color: #d97706;">${expertCount}</div>
          <div class="stat-label">🔍 專家推理模式</div>
        </div>
        <div class="stat-card">
          <div class="stat-val" style="color: #ea580c;">${orderCount}</div>
          <div class="stat-label">🔥 叫瓦斯意圖</div>
        </div>
      </div>
    </header>

    <div class="toolbar">
      <form class="search-box" method="GET" action="">
        <input type="hidden" name="format" value="html" />
        ${isOrderOnly ? '<input type="hidden" name="orderIntent" value="true" />' : ''}
        <input type="text" name="search" placeholder="搜尋客戶發問或 AI 回答內容..." value="${currentSearch}" />
        <button type="submit">🔍 搜尋</button>
      </form>
      
      <a href="?format=html" class="filter-btn ${!isOrderOnly && !currentSearch ? 'active' : ''}">全部對話</a>
      <a href="?format=html&orderIntent=true" class="filter-btn ${isOrderOnly ? 'active' : ''}">🔥 只看叫瓦斯</a>
      <a href="javascript:location.reload()" class="filter-btn">🔄 重新整理</a>
    </div>

    <div class="chat-list">
      ${cardsHtml}
    </div>

    <div class="footer-actions">
      盛隆瓦斯 24H 智慧營運中心 · 雙向容災自動輪調系統 · <a href="/">回 ERP 首頁</a>
    </div>
  </div>
</body>
</html>`;
}

/**
 * LINE AI 客服歷史紀錄 API 端點 (Vercel Serverless Function)
 * 支援:
 * 1. 瀏覽器直接開啟: 渲染視覺化美觀對話卡與統計
 * 2. 外部 API 呼叫: ?format=json 取得結構化 JSON 陣列
 */
export default async function handler(req, res) {
  // CORS 與最高級別安全標頭設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Key');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
  }

  // IP 速率限制防護
  const clientIp = getClientIp(req) || 'unknown';
  if (lineLogsRateLimiter.check([{ key: `line_logs:${clientIp}`, max: 30 }])) {
    res.setHeader('Retry-After', '60');
    return sendJson(res, 429, { ok: false, error: '存取頻率過高，請稍候 1 分鐘後再試。' });
  }

  // 判斷是否回傳 HTML 頁面 (若請求含 format=html 或瀏覽器預設存取)
  const acceptsHtml = req.headers.accept && req.headers.accept.includes('text/html');
  const isExplicitJson = req.query?.format === 'json';
  const shouldRenderHtml = (req.query?.format === 'html' || acceptsHtml) && !isExplicitJson;

  // 驗證管理員授權（阻斷外部任意窺探客戶對話與住址）
  if (!isAuthorizedToViewLogs(req)) {
    const hasAttemptedKey = Boolean(req.query?.key || req.query?.secret || req.headers?.['x-admin-key'] || req.query?.token);
    if (hasAttemptedKey && lineLogsAuthFailLimiter.check([{ key: `line_logs_fail:${clientIp}`, max: 5 }])) {
      res.setHeader('Retry-After', '300');
      return sendJson(res, 429, { ok: false, error: '管理金鑰驗證失敗次數過多，已鎖定 5 分鐘。' });
    }
    if (shouldRenderHtml) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(401).send(renderAuthLockScreen());
    }
    return sendJson(res, 401, {
      ok: false,
      error: '未授權存取：此端點包含客戶即時對話與個資，需提供有效的管理員金鑰或登入憑證。'
    });
  }

  try {
    const {
      limit = 50,
      offset = 0,
      orderIntent,
      userId,
      search,
      format
    } = req.query || {};

    const result = await fetchLineAiLogs({
      limit,
      offset,
      isOrderIntent: orderIntent,
      userId,
      search
    });

    // 判斷是否回傳 HTML 頁面 (若請求含 format=html 或瀏覽器預設存取)
    const acceptsHtml = req.headers.accept && req.headers.accept.includes('text/html');
    const isExplicitJson = format === 'json';
    const shouldRenderHtml = (format === 'html' || acceptsHtml) && !isExplicitJson;

    if (shouldRenderHtml) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(renderHtmlDashboard(result, req.query || {}));
    }

    return sendJson(res, 200, result);
  } catch (err) {
    console.error('[API /api/line-ai-logs Error]:', err);
    return sendJson(res, 500, {
      ok: false,
      error: err.message || '查詢對話紀錄時發生未預期錯誤'
    });
  }
}
