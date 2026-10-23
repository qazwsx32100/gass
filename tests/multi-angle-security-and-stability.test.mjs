import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

process.env.ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || 'test-admin-secret-2026';

// 引入受測模組
import { createToken, verifyToken, hashPassword, loginLimiter, getClientIp } from '../website/api/auth.js';
import { createBoundedRateLimiter } from '../website/api/_rateLimit.js';
import { verifyLineSignature } from '../api/line-webhook.js';
import lineWebhookHandler from '../api/line-webhook.js';
import { isAuthorizedToViewLogs } from '../api/line-ai-logs.js';
import cmsHandler from '../website/api/cms.js';
import authHandler from '../website/api/auth.js';
import aiChatHandler from '../api/ai-chat.js';
import aiStatusHandler from '../api/ai-status.js';
import lineAiLogsHandler from '../api/line-ai-logs.js';
import telegramWebhookHandler from '../api/telegram-webhook.js';
import authLoginHandler, { authenticateShareholder } from '../api/auth-login.js';
import customerHistoryHandler, { historyRateLimiter } from '../api/_customer-history.js';
import { isAuthorizedCron } from '../api/cron-daily-backup.js';

// 輔助函式：建立標準 Mock Response
const createMockRes = () => {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; return this; },
    status(c) { this.statusCode = c; return this; },
    json(data) { this.body = data; return this; },
    send(data) { this.body = data; return this; },
    end(data) {
      if (data && !this.body) {
        try { this.body = JSON.parse(data); } catch { this.body = data; }
      }
      return this;
    }
  };
  return res;
};

// ==============================================================================
// 🎯 維度一：邊界條件與極端畸形 Payload 測試 (Boundary & Malformed Payloads)
// ==============================================================================

test('Dimension 1.1: Prototype Pollution & Malformed JSON Protection in CMS API', async () => {
  const adminToken = createToken({ user: { id: 'SH001', name: '測試管理員', role: 'admin' } });

  // 構造含有原型污染屬性的惡意 Payload
  const maliciousPayload = JSON.parse('{"__proto__":{"polluted":"yes"},"constructor":{"prototype":{"injected":"yes"}},"announcement":{"enabled":true,"title":"Normal","content":"Normal"}}');

  const req = {
    method: 'POST',
    headers: {
      authorization: `Bearer ${adminToken}`,
      'content-type': 'application/json'
    },
    body: maliciousPayload
  };

  const res = createMockRes();
  await cmsHandler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  // 驗證全域 Object 原型未遭到任何污染
  assert.equal(Object.prototype.polluted, undefined, 'Global prototype must not be polluted');
  assert.equal(Object.prototype.injected, undefined, 'Constructor prototype must not be polluted');

  // 測試後重置公告為關閉狀態，確保不污染常駐記憶體與前端展示
  await cmsHandler({
    method: 'POST',
    headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' },
    body: { announcement: { enabled: false, title: '盛隆暖心公告', content: '' } }
  }, createMockRes());
});

test('Dimension 1.2: Type Confusion & Extreme Numbers in CMS Prices', async () => {
  const adminToken = createToken({ user: { id: 'SH001', name: '測試管理員', role: 'admin' } });

  // 測試極端異常數值：Infinity, -Infinity, NaN, 浮點數溢位, 巨大負數
  const extremePayload = {
    prices: {
      p16kg: Infinity,
      p20kg: -999999999,
      p10kg: NaN,
      p4kg: '1e308',
      p50kg: 2050
    }
  };

  const req = {
    method: 'POST',
    headers: {
      authorization: `Bearer ${adminToken}`,
      'content-type': 'application/json'
    },
    body: extremePayload
  };

  const res = createMockRes();
  await cmsHandler(req, res);

  assert.equal(res.statusCode, 200);
  const p = res.body.data.prices;
  // 價格必須在合理範圍且為正整數
  assert.ok(Number.isFinite(p.p16kg) && p.p16kg >= 0, 'Price must be finite non-negative');
  assert.ok(Number.isFinite(p.p20kg) && p.p20kg >= 0, 'Price must be non-negative');
  assert.ok(!Number.isNaN(p.p10kg), 'Price must not be NaN');
  assert.equal(p.p50kg, 2050, 'Legitimate price should be preserved');
});

test('Dimension 1.3: Control Characters & Null Byte Injection in AI Chat', async () => {
  // 注入含有 Null Byte (\x00) 與過度空白的惡意 Prompt
  const nullBytePrompt = '瓦斯漏氣\x00\x00<script>alert(1)</script>如何處理？';

  const req = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: { prompt: nullBytePrompt }
  };

  const res = createMockRes();
  await aiChatHandler(req, res);

  // 驗證伺服器在入口端即攔截 Null Byte，回傳 400 且不消耗上游 AI 配額
  assert.equal(res.statusCode, 400, 'Null Byte injection must be rejected with 400 Bad Request');
  assert.equal(res.body.ok, false);
  assert.ok(res.body.error.includes('Null Byte'), 'Must explicitly explain control character rejection');
});

test('Dimension 1.4: Massive Payload Body Rejection in Website Auth (DoS Defense)', async () => {
  // 構造超過 16KB 的巨大字串發送給 auth 端點
  const oversizedAccount = 'a'.repeat(25 * 1024); // 25 KB

  const req = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: { account: oversizedAccount, password: 'password123' }
  };

  const res = createMockRes();
  await authHandler(req, res);

  assert.equal(res.statusCode, 413, 'Overly large payload must be rejected with 413 Payload Too Large');
  assert.equal(res.body.success, false);
});

// ==============================================================================
// 🎯 維度二：高頻突發流量、並發競爭與記憶體安全測試 (Burst Concurrency & Memory)
// ==============================================================================

test('Dimension 2.1: Concurrent Burst Request Handling in Rate Limiter', async () => {
  const limiter = createBoundedRateLimiter({ windowMs: 60_000, maxEntries: 1000 });
  const ip = '203.0.113.88';
  const MAX_PERMITTED = 15;
  const TOTAL_BURST = 50;

  // 同時發起 50 個非同步並發請求
  const results = await Promise.all(
    Array.from({ length: TOTAL_BURST }).map(async () => {
      return limiter.check([{ key: `test_concurrency:${ip}`, max: MAX_PERMITTED }]);
    })
  );

  const blockedCount = results.filter(r => r === true).length;
  const passedCount = results.filter(r => r === false).length;

  assert.equal(passedCount, MAX_PERMITTED, `Exactly ${MAX_PERMITTED} requests should pass`);
  assert.equal(blockedCount, TOTAL_BURST - MAX_PERMITTED, `Remaining ${TOTAL_BURST - MAX_PERMITTED} requests must be blocked`);
});

test('Dimension 2.2: Memory Leak Defense - Strict Bound Enforcement on Massive Key Ingestion', () => {
  const MAX_ENTRIES = 200;
  const limiter = createBoundedRateLimiter({ windowMs: 10_000, maxEntries: MAX_ENTRIES });

  // 模擬灌入 2,000 個相異 IP 鍵值
  for (let i = 0; i < 2000; i++) {
    limiter.check([{ key: `flood_ip_${i}`, max: 10 }]);
  }

  // 驗證內部儲存體積絕對不超過 MAX_ENTRIES，徹底杜絕記憶體洩漏 (OOM)
  assert.ok(limiter.size() <= MAX_ENTRIES, `Limiter size (${limiter.size()}) must not exceed bounds (${MAX_ENTRIES})`);
});

// ==============================================================================
// 🎯 維度三：身分鑑別、時序比對與授權穿透矩陣 (Authentication & Bypass Matrix)
// ==============================================================================

test('Dimension 3.1: JWT Forgery & Bypass Attack Matrix', () => {
  // 1. None-Algorithm 繞過測試 ({"alg":"none"})
  const noneHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const validBody = Buffer.from(JSON.stringify({ user: { id: 'SH001', role: 'admin' }, exp: Date.now() / 1000 + 3600 })).toString('base64url');
  const noneToken = `${noneHeader}.${validBody}.`;
  assert.equal(verifyToken(noneToken), null, 'None-algorithm JWT must be rejected');

  // 2. 移除簽名的裸 Token
  const unsignedToken = `${noneHeader}.${validBody}`;
  assert.equal(verifyToken(unsignedToken), null, 'Unsigned token must be rejected');

  // 3. 偽造過期 Token
  const expiredPayload = { user: { id: 'SH001', role: 'admin' }, exp: Math.floor(Date.now() / 1000) - 7200 };
  const expiredToken = createToken(expiredPayload);
  assert.equal(verifyToken(expiredToken), null, 'Expired token must be rejected');

  // 4. SQL 注入或特殊符號注入簽名
  const sqlInjectionToken = `${noneHeader}.${validBody}.' OR '1'='1`;
  assert.equal(verifyToken(sqlInjectionToken), null, 'SQL injection in signature must be rejected');
});

test('Dimension 3.2: Access Control Matrix on /api/line-ai-logs (Privacy Protection)', async () => {
  process.env.ADMIN_SESSION_SECRET = 'audit-test-secret-key-2026';

  // 情境 A：未授權訪客存取 HTML 格式 ➔ 應收到 401 並回傳安全鎖定畫面
  const htmlReq = {
    method: 'GET',
    headers: { accept: 'text/html' },
    query: { format: 'html' }
  };
  const htmlRes = createMockRes();
  await lineAiLogsHandler(htmlReq, htmlRes);
  assert.equal(htmlRes.statusCode, 401, 'Unauthorized HTML visit must yield 401');
  assert.ok(htmlRes.body.includes('盛隆管理員安全驗證'), 'Must show security lock card');
  assert.ok(!htmlRes.body.includes('疑似叫瓦斯訂單'), 'Must NOT leak customer chat logs');

  // 情境 B：未授權訪客存取 JSON 格式 ➔ 應收到 401 結構化 JSON 錯誤
  const jsonReq = {
    method: 'GET',
    headers: { accept: 'application/json' },
    query: { format: 'json' }
  };
  const jsonRes = createMockRes();
  await lineAiLogsHandler(jsonReq, jsonRes);
  assert.equal(jsonRes.statusCode, 401, 'Unauthorized JSON request must yield 401');
  assert.equal(jsonRes.body.ok, false);

  // 情境 C：惡意假冒或長度相近金鑰 ➔ 必須被 timingSafeEqual 拒絕 (401)
  const evilKeyReq = {
    method: 'GET',
    headers: { accept: 'application/json' },
    query: { key: 'audit-test-secret-key-2027', format: 'json' }
  };
  const evilKeyRes = createMockRes();
  await lineAiLogsHandler(evilKeyReq, evilKeyRes);
  assert.equal(evilKeyRes.statusCode, 401, 'Incorrect secret key must be denied');

  // 情境 D：合法 Telegram 特助帶金鑰一鍵開啟 ➔ 必須順暢通過 (200)
  const legitimateReq = {
    method: 'GET',
    headers: { accept: 'text/html' },
    query: { key: 'audit-test-secret-key-2026', format: 'html' }
  };
  const legitRes = createMockRes();
  await lineAiLogsHandler(legitimateReq, legitRes);
  assert.equal(legitRes.statusCode, 200, 'Legitimate admin with key must be authorized');
});

test('Dimension 3.3: Telegram Webhook Secret Token Protection', async () => {
  process.env.TELEGRAM_WEBHOOK_SECRET = 'super-secret-telegram-webhook-token';

  // 1. 偽造或未帶 Secret Token ➔ 必須收到 403 Forbidden
  const evilReq = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: { update_id: 12345 }
  };
  const evilRes = createMockRes();
  await telegramWebhookHandler(evilReq, evilRes);
  assert.equal(evilRes.statusCode, 403, 'Webhook request missing secret token must be 403');

  // 2. 帶正確 Secret Token ➔ 通過驗證
  const validReq = {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-telegram-bot-api-secret-token': 'super-secret-telegram-webhook-token'
    },
    body: { update_id: 12345 }
  };
  const validRes = createMockRes();
  await telegramWebhookHandler(validReq, validRes);
  assert.equal(validRes.statusCode, 200, 'Webhook request with valid secret token must succeed');

  delete process.env.TELEGRAM_WEBHOOK_SECRET;
});

// ==============================================================================
// 🎯 維度四：API 韌性、容錯降級與敏感資訊零外洩 (Resilience & Zero Leakage)
// ==============================================================================

test('Dimension 4.1: Method Not Allowed & Graceful HTTP Error Handling', async () => {
  // 測試各 API 面對不合規 HTTP Method 時是否均回傳標準 405，絕不崩潰
  const testEndpoints = [
    { name: 'website auth', handler: authHandler, illegalMethod: 'PUT' },
    { name: 'website cms', handler: cmsHandler, illegalMethod: 'DELETE' },
    { name: 'ai chat', handler: aiChatHandler, illegalMethod: 'GET' },
    { name: 'ai status', handler: aiStatusHandler, illegalMethod: 'POST' },
    { name: 'line logs', handler: lineAiLogsHandler, illegalMethod: 'PATCH' }
  ];

  for (const ep of testEndpoints) {
    const req = { method: ep.illegalMethod, headers: {} };
    const res = createMockRes();
    await ep.handler(req, res);
    assert.equal(res.statusCode, 405, `${ep.name} must return 405 on ${ep.illegalMethod}`);
  }
});

test('Dimension 4.2: Zero Information Leakage Audit in /api/ai-status', async () => {
  const req = { method: 'GET', headers: {} };
  const res = createMockRes();
  await aiStatusHandler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);

  // 深度檢查回應物件中的所有帳號資訊
  const accounts = res.body.accounts || [];
  for (const acc of accounts) {
    // 嚴禁包含未遮蔽之真實 API Key
    if (acc.apiKeyMasked) {
      assert.ok(!acc.apiKeyMasked.startsWith('AIzaSy') || acc.apiKeyMasked.includes('...'), 'Google API Key must be masked');
      assert.ok(!acc.apiKeyMasked.startsWith('sk-proj') || acc.apiKeyMasked.includes('...'), 'OpenAI API Key must be masked');
    }
    // 絕不包含全域機密環境變數
    assert.equal(acc.ADMIN_SESSION_SECRET, undefined);
    assert.equal(acc.ERP_SYNC_SECRET, undefined);
  }
});

// ==============================================================================
// 🎯 維度五：HTTP 安全標頭與 Preflight 協定審查 (Protocol & Security Headers)
// ==============================================================================

test('Dimension 5.1: CORS Preflight (OPTIONS) Returns Safe Response with Correct Headers', async () => {
  const handlers = [
    { name: 'website auth', fn: authHandler, expectedStatus: 200 },
    { name: 'website cms', fn: cmsHandler, expectedStatus: 200 },
    { name: 'ai chat', fn: aiChatHandler, expectedStatus: 204 },
    { name: 'ai status', fn: aiStatusHandler, expectedStatus: 204 }
  ];

  for (const { name, fn, expectedStatus } of handlers) {
    const req = {
      method: 'OPTIONS',
      headers: {
        origin: 'https://shenglong-gas.vercel.app',
        'access-control-request-method': 'POST'
      }
    };
    const res = createMockRes();
    await fn(req, res);

    assert.equal(res.statusCode, expectedStatus, `${name} OPTIONS must return ${expectedStatus}`);
    assert.ok(res.headers['access-control-allow-methods'], `${name} must include Allow-Methods`);
  }
});

test('Dimension 5.2: Security Headers Consistency Across Root and Website Vercel Configs', () => {
  const rootConfig = JSON.parse(fs.readFileSync(path.resolve('vercel.json'), 'utf8'));
  const websiteConfig = JSON.parse(fs.readFileSync(path.resolve('website/vercel.json'), 'utf8'));

  const requiredSecurityKeys = [
    'strict-transport-security',
    'x-content-type-options',
    'x-frame-options',
    'permissions-policy',
    'cross-origin-opener-policy',
    'cross-origin-resource-policy',
    'x-xss-protection',
    'content-security-policy'
  ];

  [
    { name: 'Root vercel.json', cfg: rootConfig },
    { name: 'Website vercel.json', cfg: websiteConfig }
  ].forEach(({ name, cfg }) => {
    const headersList = (cfg.headers || []).flatMap(h => h.headers || []);
    const keyMap = new Map(headersList.map(h => [h.key.toLowerCase(), h.value]));

    for (const reqKey of requiredSecurityKeys) {
      assert.ok(keyMap.has(reqKey), `${name} must define header: ${reqKey}`);
    }

    // 驗證 HSTS 包含 preload 與足夠大的 max-age
    const hsts = keyMap.get('strict-transport-security');
    assert.ok(hsts.includes('max-age=63072000'), `${name} HSTS max-age must be at least 2 years`);
    assert.ok(hsts.includes('includeSubDomains'), `${name} HSTS must includeSubDomains`);
    assert.ok(hsts.includes('preload'), `${name} HSTS must have preload`);

    // 驗證 X-Content-Type-Options 必為 nosniff
    assert.equal(keyMap.get('x-content-type-options'), 'nosniff', `${name} must be nosniff`);
  });
});

// ==============================================================================
// 🎯 維度六：LINE Webhook 端到端防偽造與簽章強制審查 (LINE Webhook E2E Guard)
// ==============================================================================

test('Dimension 6.1: LINE Webhook Handler Enforces Signature When Secret is Configured', async () => {
  process.env.LINE_CHANNEL_SECRET = 'test-channel-secret-for-webhook';
  const payload = { events: [] };
  const rawBuffer = Buffer.from(JSON.stringify(payload));
  const validSig = crypto
    .createHmac('sha256', process.env.LINE_CHANNEL_SECRET)
    .update(rawBuffer)
    .digest('base64');

  // 1. 故意不帶 x-line-signature 標頭（測試先前潛在漏驗漏洞是否完全修補）
  const missingSigReq = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: payload
  };
  const missingSigRes = createMockRes();
  await lineWebhookHandler(missingSigReq, missingSigRes);
  assert.equal(missingSigRes.statusCode, 401, 'Missing signature must be rejected with 401');

  // 2. 帶偽造簽章
  const fakeSigReq = {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-line-signature': 'forged_base64_signature_xyz=='
    },
    body: payload
  };
  const fakeSigRes = createMockRes();
  await lineWebhookHandler(fakeSigReq, fakeSigRes);
  assert.equal(fakeSigRes.statusCode, 401, 'Forged signature must be rejected with 401');

  // 3. 帶正確簽章 ➔ 正常放行 (200)
  const validSigReq = {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-line-signature': validSig
    },
    body: payload
  };
  const validSigRes = createMockRes();
  await lineWebhookHandler(validSigReq, validSigRes);
  assert.equal(validSigRes.statusCode, 200, 'Valid signature must succeed with 200');

  delete process.env.LINE_CHANNEL_SECRET;
});

// ==============================================================================
// 🎯 維度七：CMS 未授權寫入防禦與偽造憑證攔截 (CMS Unauthorized Write Prevention)
// ==============================================================================

test('Dimension 7.1: Website CMS Rejects Unauthenticated or Tampered Write Requests', async () => {
  // 1. 無任何 Token 嘗試竄改瓦斯價格
  const noAuthReq = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: { prices: { p20kg: 100 } }
  };
  const noAuthRes = createMockRes();
  await cmsHandler(noAuthReq, noAuthRes);
  assert.equal(noAuthRes.statusCode, 401, 'CMS write without token must return 401');

  // 2. 帶篡改過的偽造 Token 嘗試修改公告
  const forgedTokenReq = {
    method: 'POST',
    headers: {
      authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyIjp7InJvbGUiOiJhZG1pbiJ9fQ.forged_sig',
      'content-type': 'application/json'
    },
    body: { announcement: { enabled: true, title: 'Hacked' } }
  };
  const forgedRes = createMockRes();
  await cmsHandler(forgedTokenReq, forgedRes);
  assert.equal(forgedRes.statusCode, 401, 'CMS write with forged token must return 401');
});

// ==============================================================================
// 🎯 維度八：反向代理與多層 X-Forwarded-For IP 辨識穩健度 (Proxy IP Resolution)
// ==============================================================================

test('Dimension 8.1: Client IP Resolution Handles X-Real-IP, X-Forwarded-For Arrays and Strings', () => {
  // 1. X-Real-IP 優先提取
  assert.equal(
    getClientIp({ headers: { 'x-real-ip': ' 203.0.113.10 ', 'x-forwarded-for': '10.0.0.1' } }),
    '203.0.113.10'
  );

  // 2. 多重代理逗號分隔字串取第一個真實客戶端 IP
  assert.equal(
    getClientIp({ headers: { 'x-forwarded-for': '198.51.100.77, 172.16.0.1, 10.0.0.1' } }),
    '198.51.100.77'
  );

  // 3. 陣列格式 X-Forwarded-For
  assert.equal(
    getClientIp({ headers: { 'x-forwarded-for': ['192.0.2.55', '10.0.0.2'] } }),
    '192.0.2.55'
  );

  // 4. 退回 socket.remoteAddress
  assert.equal(
    getClientIp({ headers: {}, socket: { remoteAddress: '127.0.0.1' } }),
    '127.0.0.1'
  );
});

// ==============================================================================
// 🎯 維度九：防資料竄改、弱密碼後門封堵與客戶個資防枚舉 (Anti-Tampering & Anti-Enumeration)
// ==============================================================================

test('Dimension 9.1: Weak Default PINs (1234 / 6789) Strictly Blocked Across ERP & Website Auth', async () => {
  // 1. 官網後台 (/api/auth) 嘗試使用 1234 或 6789 登入股東帳號 ➔ 必須回傳 401
  for (const weakPin of ['1234', '6789']) {
    const webReq = {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-real-ip': '198.51.100.201' },
      body: { account: '周子傑', password: weakPin }
    };
    const webRes = createMockRes();
    await authHandler(webReq, webRes);
    assert.equal(webRes.statusCode, 401, `Website auth must reject weak PIN "${weakPin}"`);
  }

  // 2. ERP 雲端登入 (/api/auth-login) 嘗試使用 1234 或 6789 登入 ➔ 入口端立即攔截 401（不觸發資料庫查詢）
  for (const weakPin of ['1234', '6789', '0000', '123456', 'admin']) {
    const erpReq = {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-real-ip': '198.51.100.202' },
      body: { email: 'zijie@shenglonggas.com', password: weakPin }
    };
    const erpRes = createMockRes();
    await authLoginHandler(erpReq, erpRes);
    assert.equal(erpRes.statusCode, 401, `ERP auth-login must reject weak password "${weakPin}"`);
    assert.equal(erpRes.body.success, false);
  }

  // 3. 驗證前端原始碼 (mockData.js) 不再包含任何明文密碼欄位
  const mockDataSrc = fs.readFileSync(path.resolve('src/db/mockData.js'), 'utf8');
  assert.ok(!mockDataSrc.includes("password: '1234'"), 'mockData.js must not contain plaintext 1234');
  assert.ok(!mockDataSrc.includes('windsboy123'), 'mockData.js must not contain plaintext owner password');
});

test('Dimension 9.2: Customer History API Blocks Wildcard Enumeration & Enforces IP Rate Limit', async () => {
  // 1. 單字元或過短電話模糊枚舉 (?phone=09) ➔ 必須回傳 400 拒絕撈取全店訂單
  const shortPhoneReq = {
    method: 'GET',
    url: '/api/customer-history?phone=09&format=json',
    headers: { 'x-real-ip': '203.0.113.199' }
  };
  const shortPhoneRes = createMockRes();
  await customerHistoryHandler(shortPhoneReq, shortPhoneRes);
  assert.equal(shortPhoneRes.statusCode, 400, 'Short phone wildcard query (?phone=09) must be rejected with 400');
  assert.equal(shortPhoneRes.body.ok, false);

  // 2. 單字元姓氏模糊枚舉 (?name=陳) ➔ 必須回傳 400 拒絕撈取全店同姓客戶
  const shortNameReq = {
    method: 'GET',
    url: '/api/customer-history?name=陳&format=json',
    headers: { 'x-real-ip': '203.0.113.199' }
  };
  const shortNameRes = createMockRes();
  await customerHistoryHandler(shortNameReq, shortNameRes);
  assert.equal(shortNameRes.statusCode, 400, 'Single-character name query (?name=陳) must be rejected with 400');

  // 3. 模擬單一 IP 惡意爬蟲連續發起超過 30 次查詢 ➔ 必須觸發 429 限流保護
  const scraperIp = '203.0.113.250';
  historyRateLimiter.clear([`cust_hist:${scraperIp}`]);
  for (let i = 0; i < 30; i++) {
    historyRateLimiter.check([{ key: `cust_hist:${scraperIp}`, max: 30 }]);
  }
  const rateLimitedReq = {
    method: 'GET',
    url: '/api/customer-history?phone=0912345678&format=json',
    headers: { 'x-real-ip': scraperIp }
  };
  const rateLimitedRes = createMockRes();
  await customerHistoryHandler(rateLimitedReq, rateLimitedRes);
  assert.equal(rateLimitedRes.statusCode, 429, '31st request within 1 min must be blocked with 429');
  assert.equal(rateLimitedRes.headers['retry-after'], '60');
});

test('Dimension 9.3: Cron Daily Backup Enforces Timing-Safe Secret Verification', () => {
  process.env.CRON_SECRET = 'cron-secret-test-999';
  process.env.ERP_SYNC_SECRET = 'sync-secret-test-888';

  // 未帶 Authorization 或錯誤 Token ➔ 拒絕
  assert.equal(isAuthorizedCron({ headers: {} }), false);
  assert.equal(isAuthorizedCron({ headers: { authorization: 'Bearer wrong-secret' } }), false);
  assert.equal(isAuthorizedCron({ headers: { authorization: 'Bearer cron-secret-test-998' } }), false);

  // 正確 CRON_SECRET 或 ERP_SYNC_SECRET ➔ 通過
  assert.equal(isAuthorizedCron({ headers: { authorization: 'Bearer cron-secret-test-999' } }), true);
  assert.equal(isAuthorizedCron({ headers: { authorization: 'Bearer sync-secret-test-888' } }), true);
});


