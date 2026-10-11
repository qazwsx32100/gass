/**
 * trigger-github-workflow API 單元測試
 * 測試路由驗證、workflow 名稱過濾、GitHub API 回應處理
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ── 輕量 mock helpers ────────────────────────────────────────────────────────

function makeRes() {
  const res = {
    _status: null,
    _body: null,
    _headers: {},
    status(code) { this._status = code; return this; },
    setHeader(k, v) { this._headers[k] = v; return this; },
    end(body) { this._body = body ? JSON.parse(body) : null; },
  };
  return res;
}

function makeReq({ method = 'POST', token = '', body = {} } = {}) {
  return {
    method,
    headers: { authorization: token ? `Bearer ${token}` : '' },
    body,
    socket: { remoteAddress: '127.0.0.1' },
  };
}

// ── 模擬 _auth.js 的 token 驗證行為 ─────────────────────────────────────────

const VALID_ADMIN_TOKEN = 'valid-admin-token';
const VALID_USER_TOKEN  = 'valid-user-token';

function mockVerifyToken(token) {
  if (token === VALID_ADMIN_TOKEN) return { id: 'ADMIN', role: 'admin' };
  if (token === VALID_USER_TOKEN)  return { id: 'user-001', role: 'member' };
  return null;
}

function mockGetBearerToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

// ── 獨立測試核心邏輯（不需要 Vercel runtime）────────────────────────────────

const ALLOWED_WORKFLOWS = {
  'sync-members':   { file: 'sync-members.yml',   label: '會員資料同步' },
  'inspect-backup': { file: 'inspect-backup.yml', label: '備份結構檢查' },
};

function sendJson(res, status, body) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

async function simulateHandler(req, res, { githubStatus = 204, githubPat = 'ghp_test' } = {}) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST')   { sendJson(res, 405, { ok: false, error: 'Method Not Allowed' }); return; }

  const token   = mockGetBearerToken(req);
  const session = mockVerifyToken(token);
  if (!session) { sendJson(res, 401, { ok: false, error: '未授權：請先登入後台' }); return; }
  if (session.id !== 'ADMIN' && session.role !== 'admin') {
    sendJson(res, 403, { ok: false, error: '權限不足：僅限管理員操作' }); return;
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const workflowKey = String(body.workflow || '').trim();
  const workflowDef = ALLOWED_WORKFLOWS[workflowKey];
  if (!workflowDef) {
    sendJson(res, 400, { ok: false, error: `未知的 workflow：${workflowKey}`, allowed: Object.keys(ALLOWED_WORKFLOWS) }); return;
  }

  if (!githubPat) { sendJson(res, 500, { ok: false, error: 'GitHub Actions 環境變數未設定' }); return; }

  // 模擬 GitHub API 回應
  if (githubStatus === 204) {
    sendJson(res, 200, { ok: true, workflow: workflowKey, label: workflowDef.label, triggeredAt: new Date().toISOString(), triggeredBy: session.id, message: `✅ ${workflowDef.label} 已成功觸發` });
  } else {
    sendJson(res, githubStatus >= 500 ? 502 : 422, { ok: false, error: `GitHub API 回傳錯誤 ${githubStatus}` });
  }
}

// ── 測試案例 ─────────────────────────────────────────────────────────────────

describe('trigger-github-workflow', () => {
  it('OPTIONS preflight → 204', async () => {
    const req = makeReq({ method: 'OPTIONS' });
    const res = makeRes();
    await simulateHandler(req, res);
    assert.equal(res._status, 204);
  });

  it('GET 方法 → 405', async () => {
    const req = makeReq({ method: 'GET', token: VALID_ADMIN_TOKEN });
    const res = makeRes();
    await simulateHandler(req, res);
    assert.equal(res._status, 405);
    assert.equal(res._body.ok, false);
  });

  it('無 token → 401', async () => {
    const req = makeReq({ body: { workflow: 'sync-members' } });
    const res = makeRes();
    await simulateHandler(req, res);
    assert.equal(res._status, 401);
  });

  it('非 admin token → 403', async () => {
    const req = makeReq({ token: VALID_USER_TOKEN, body: { workflow: 'sync-members' } });
    const res = makeRes();
    await simulateHandler(req, res);
    assert.equal(res._status, 403);
  });

  it('未知 workflow 名稱 → 400，列出 allowed', async () => {
    const req = makeReq({ token: VALID_ADMIN_TOKEN, body: { workflow: 'hack-server' } });
    const res = makeRes();
    await simulateHandler(req, res);
    assert.equal(res._status, 400);
    assert.ok(Array.isArray(res._body.allowed));
    assert.ok(res._body.allowed.includes('sync-members'));
  });

  it('未設定 PAT → 500', async () => {
    const req = makeReq({ token: VALID_ADMIN_TOKEN, body: { workflow: 'sync-members' } });
    const res = makeRes();
    await simulateHandler(req, res, { githubPat: '' });
    assert.equal(res._status, 500);
  });

  it('sync-members → GitHub 204 → 200 ok', async () => {
    const req = makeReq({ token: VALID_ADMIN_TOKEN, body: { workflow: 'sync-members' } });
    const res = makeRes();
    await simulateHandler(req, res, { githubStatus: 204 });
    assert.equal(res._status, 200);
    assert.equal(res._body.ok, true);
    assert.equal(res._body.workflow, 'sync-members');
    assert.equal(res._body.triggeredBy, 'ADMIN');
  });

  it('inspect-backup → GitHub 204 → 200 ok', async () => {
    const req = makeReq({ token: VALID_ADMIN_TOKEN, body: { workflow: 'inspect-backup' } });
    const res = makeRes();
    await simulateHandler(req, res, { githubStatus: 204 });
    assert.equal(res._status, 200);
    assert.equal(res._body.ok, true);
    assert.equal(res._body.workflow, 'inspect-backup');
  });

  it('GitHub API 回傳 422 → 422 錯誤', async () => {
    const req = makeReq({ token: VALID_ADMIN_TOKEN, body: { workflow: 'sync-members' } });
    const res = makeRes();
    await simulateHandler(req, res, { githubStatus: 422 });
    assert.equal(res._status, 422);
    assert.equal(res._body.ok, false);
  });

  it('GitHub API 回傳 500 → 502 錯誤', async () => {
    const req = makeReq({ token: VALID_ADMIN_TOKEN, body: { workflow: 'sync-members' } });
    const res = makeRes();
    await simulateHandler(req, res, { githubStatus: 500 });
    assert.equal(res._status, 502);
  });
});
