/**
 * tests/dev-agent-phase3.test.mjs
 * 盛隆瓦斯 — 多代理 AI 協同開發第三階段（Supabase 稽核＋離線降級 ✕ 老闆 Telegram L3 簽核閉環 ✕ Preview/Prod 煙霧驗證與自動熔斷）全量端到端測試
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SUPERADMIN_TELEGRAM_ID,
  TASK_STATES,
  signDevAgentRequest,
} from '../api/_dev-agent-protocol.js';
import {
  isAllowedSmokeTargetUrl,
  createDevAgentAuditStore,
  buildBossApprovalTelegramCard,
} from '../api/_dev-agent-audit.js';
import { createDevAgentApprovalHandler } from '../api/dev-agent-approval.js';
import { createDevAgentHubHandler } from '../api/dev-agent-hub.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const BRIDGE_TOKEN = 'phase3-bridge-token-2026';
const WEBHOOK_SECRET = 'phase3-hmac-secret-2026';
const FIXED_NOW_MS = Date.parse('2026-11-27T23:15:00+08:00');
const FIXED_NOW_SEC = Math.floor(FIXED_NOW_MS / 1000);

function makeRes() {
  return {
    statusCode: null,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v;
      return this;
    },
    end(raw) {
      this.body = raw ? JSON.parse(raw) : null;
      return this;
    },
  };
}

function makeSignedPost(body, { ip = '203.0.113.55', token = BRIDGE_TOKEN } = {}) {
  const rawBody = JSON.stringify(body);
  const sig = signDevAgentRequest({ secret: WEBHOOK_SECRET, timestamp: FIXED_NOW_SEC, rawBody });
  return {
    method: 'POST',
    rawBody,
    body,
    headers: {
      authorization: token ? `Bearer ${token}` : '',
      'x-agent-timestamp': String(FIXED_NOW_SEC),
      'x-agent-signature-256': sig,
      'x-forwarded-for': ip,
    },
    socket: { remoteAddress: ip },
  };
}

describe('Phase 3: SQL Migration & SSRF Allowlist', () => {
  it('sql/multi-agent-dev-audit.sql creates isolated audit tables with RLS and zero legacy ERP references', () => {
    const sqlPath = path.join(ROOT, 'sql', 'multi-agent-dev-audit.sql');
    assert.ok(fs.existsSync(sqlPath), 'Migration SQL must exist');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.ai_dev_tasks'));
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.ai_dev_runs'));
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.ai_dev_audit_logs'));
    assert.ok(sql.includes('ENABLE ROW LEVEL SECURITY'));
    assert.ok(!/gas_oders|berrel_logs|stove_oders|dbo\./i.test(sql), 'Must never touch legacy ERP tables');
  });

  it('isAllowedSmokeTargetUrl permits only HTTPS *.vercel.app and blocks SSRF/internal hosts', () => {
    assert.equal(isAllowedSmokeTargetUrl('https://gass-plum.vercel.app'), true);
    assert.equal(isAllowedSmokeTargetUrl('https://shenglong-preview-123.vercel.app'), true);
    assert.equal(isAllowedSmokeTargetUrl('http://gass-plum.vercel.app'), false);
    assert.equal(isAllowedSmokeTargetUrl('https://127.0.0.1:8080'), false);
    assert.equal(isAllowedSmokeTargetUrl('https://169.254.169.254/latest/meta-data'), false);
    assert.equal(isAllowedSmokeTargetUrl('https://evil.example.com'), false);
  });
});

describe('Phase 3: Supabase Audit Store Circuit Breaker & Offline Fallback', () => {
  it('trips 5-minute circuit breaker on HTTP 402 and smoothly falls back offline without throwing', async () => {
    let fetchCalls = 0;
    const currentMs = FIXED_NOW_MS;

    const store = createDevAgentAuditStore({
      env: {
        SUPABASE_URL: 'https://demo.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'mock-service-role-key',
      },
      now: () => currentMs,
      fetchFn: async () => {
        fetchCalls += 1;
        return { status: 402, json: async () => ({ error: 'quota exceeded' }) };
      },
    });

    const res1 = await store.upsertTask({
      task_id: 'TASK-20261127-P3A',
      idempotency_key: 'idem:p3a',
      target_repo: 'qazwsx32100/gass',
      feature_branch: 'ai-agent/task-20261127-p3a',
      risk_level: 'L2',
      status: TASK_STATES.QUEUED,
    });
    assert.equal(res1.ok, true);
    assert.equal(res1.source, 'offline_fallback');
    assert.equal(res1.degradedReason, 'SUPABASE_HTTP_402');
    assert.equal(store.isCircuitOpen(), true);
    assert.equal(fetchCalls, 1);

    const logRes = await store.recordAuditLog({
      taskId: 'TASK-20261127-P3A',
      eventType: 'PR_READY_NOTIFIED',
      actorId: 'system',
    });
    assert.equal(logRes.source, 'offline_fallback');
    assert.equal(logRes.degradedReason, 'SUPABASE_CIRCUIT_OPEN');
    assert.equal(fetchCalls, 1);

    const badJump = await store.transitionTask('TASK-20261127-P3A', TASK_STATES.DEPLOYED);
    assert.equal(badJump.ok, false);
    assert.equal(badJump.code, 'INVALID_STATE_TRANSITION');
  });

  it('builds Telegram Boss L3 approval card with SuperAdmin ID and action buttons', () => {
    const card = buildBossApprovalTelegramCard({
      taskId: 'TASK-20261127-L3X',
      repository: 'qazwsx32100/gass',
      featureBranch: 'ai-agent/task-20261127-l3x',
      effectiveRiskLevel: 'L3',
      objectiveTitle: '高危權限檢核升級',
      prNumber: 88,
      prUrl: 'https://github.com/qazwsx32100/gass/pull/88',
      previewUrl: 'https://gass-preview-88.vercel.app',
    });

    assert.equal(card.chatId, SUPERADMIN_TELEGRAM_ID);
    assert.ok(card.text.includes('L3 高危變更'));
    assert.ok(card.text.includes(SUPERADMIN_TELEGRAM_ID));
    assert.equal(card.replyMarkup.inline_keyboard.length, 2);
    assert.equal(card.replyMarkup.inline_keyboard[1][0].callback_data, 'dev_approve:TASK-20261127-L3X:88');
  });
});

describe('Phase 3: Full End-to-End Closed-Loop (AI Hub -> Bridge -> PR Ready -> Boss 8862712587 Approve -> Smoke Verify -> Rollback Alert)', () => {
  it('completes full lifecycle from Hub to Boss Merge and Deployed Smoke Check, and blocks non-Boss approvers', async () => {
    const calls = { githubDispatch: 0, telegramSend: 0, githubMerge: 0, smokeGet: 0 };

    const mockFetch = async (url) => {
      if (url.includes('api.github.com/repos/qazwsx32100/gass/dispatches')) {
        calls.githubDispatch += 1;
        return { status: 204, text: async () => '' };
      }
      if (url.includes('api.telegram.org/bot')) {
        calls.telegramSend += 1;
        return { status: 200, json: async () => ({ ok: true, result: { message_id: 777 } }) };
      }
      if (url.includes('/pulls/99/merge')) {
        calls.githubMerge += 1;
        return { status: 200, json: async () => ({ merged: true, sha: 'abc123merged' }) };
      }
      if (url.startsWith('https://gass-plum.vercel.app/api/')) {
        calls.smokeGet += 1;
        return { status: 200 };
      }
      if (url.startsWith('https://gass-broken.vercel.app/api/')) {
        return { status: 500 };
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const sharedEnv = {
      DEV_AGENT_BRIDGE_TOKEN: BRIDGE_TOKEN,
      DEV_AGENT_WEBHOOK_SECRET: WEBHOOK_SECRET,
      DEV_AGENT_GITHUB_DISPATCH_ENABLED: 'true',
      DEV_AGENT_AUTO_MERGE_ENABLED: 'true',
      GITHUB_ACTIONS_PAT: 'mock-pat',
      TELEGRAM_BOT_TOKEN: 'mock-tg-bot',
    };

    // Step 1: AI Collaboration Hub dispatches task through HMAC Bridge -> GitHub repository_dispatch
    const hubHandler = createDevAgentHubHandler({ env: sharedEnv, fetchFn: mockFetch, now: () => FIXED_NOW_MS });
    const hubRes = makeRes();
    await hubHandler(
      {
        method: 'POST',
        headers: { authorization: `Bearer ${BRIDGE_TOKEN}` },
        body: {
          prompt: '新增多代理端到端閉環驗證與文件更新',
          repository: 'qazwsx32100/gass',
          autoDispatch: true,
        },
        socket: { remoteAddress: '203.0.113.10' },
      },
      hubRes
    );
    assert.equal(hubRes.statusCode, 202);
    assert.equal(calls.githubDispatch, 1);
    const taskId = hubRes.body.taskId;

    // Step 2: Approval endpoint receives notify_pr_ready -> sends Telegram L3 card to Boss 8862712587
    const approvalHandler = createDevAgentApprovalHandler({
      env: sharedEnv,
      fetchFn: mockFetch,
      now: () => FIXED_NOW_MS,
    });

    const notifyRes = makeRes();
    await approvalHandler(
      makeSignedPost({
        action: 'notify_pr_ready',
        taskId,
        repository: 'qazwsx32100/gass',
        effectiveRiskLevel: 'L3',
        objectiveTitle: '端到端閉環驗收',
        prNumber: 99,
        prUrl: 'https://github.com/qazwsx32100/gass/pull/99',
        previewUrl: 'https://gass-plum.vercel.app',
      }),
      notifyRes
    );
    assert.equal(notifyRes.statusCode, 200);
    assert.equal(notifyRes.body.status, TASK_STATES.AWAITING_APPROVAL);
    assert.equal(notifyRes.body.telegramNotified, true);
    assert.equal(calls.telegramSend, 1);

    // Step 3: Impostor approver MUST be rejected with 403 SUPERADMIN_ONLY
    const impostorRes = makeRes();
    await approvalHandler(
      makeSignedPost({
        action: 'approve',
        taskId,
        repository: 'qazwsx32100/gass',
        prNumber: 99,
        approverId: '9999999999',
      }),
      impostorRes
    );
    assert.equal(impostorRes.statusCode, 403);
    assert.equal(impostorRes.body.code, 'SUPERADMIN_ONLY');
    assert.equal(calls.githubMerge, 0);

    // Step 4: Boss (8862712587) approves -> Squash merges PR #99 & transitions to MERGED
    const bossRes = makeRes();
    await approvalHandler(
      makeSignedPost({
        action: 'approve',
        taskId,
        repository: 'qazwsx32100/gass',
        prNumber: 99,
        approverId: SUPERADMIN_TELEGRAM_ID,
      }),
      bossRes
    );
    assert.equal(bossRes.statusCode, 200);
    assert.equal(bossRes.body.status, TASK_STATES.MERGED);
    assert.equal(bossRes.body.mergeResult.merged, true);
    assert.equal(calls.githubMerge, 1);

    // Step 5: Smoke Verify on Production passes -> transitions to DEPLOYED
    const smokeOkRes = makeRes();
    await approvalHandler(
      makeSignedPost({
        action: 'smoke_verify',
        taskId,
        repository: 'qazwsx32100/gass',
        targetUrl: 'https://gass-plum.vercel.app',
      }),
      smokeOkRes
    );
    assert.equal(smokeOkRes.statusCode, 200);
    assert.equal(smokeOkRes.body.status, TASK_STATES.DEPLOYED);
    assert.equal(smokeOkRes.body.rollbackTriggered, false);
    assert.equal(calls.smokeGet, 2);

    // Step 6: SSRF target URL blocked (400) & 2 consecutive smoke failures trigger ROLLED_BACK + Telegram alert
    const ssrfRes = makeRes();
    await approvalHandler(
      makeSignedPost({
        action: 'smoke_verify',
        taskId: 'TASK-20261127-BAD',
        repository: 'qazwsx32100/gass',
        targetUrl: 'https://169.254.169.254/latest',
      }),
      ssrfRes
    );
    assert.equal(ssrfRes.statusCode, 400);
    assert.equal(ssrfRes.body.code, 'SSRF_BLOCKED_URL');

    const failRes = makeRes();
    await approvalHandler(
      makeSignedPost({
        action: 'smoke_verify',
        taskId: 'TASK-20261127-FAIL',
        repository: 'qazwsx32100/gass',
        targetUrl: 'https://gass-broken.vercel.app',
        consecutiveFailures: 2,
      }),
      failRes
    );
    assert.equal(failRes.statusCode, 502);
    assert.equal(failRes.body.status, TASK_STATES.ROLLED_BACK);
    assert.equal(failRes.body.rollbackTriggered, true);
    assert.equal(failRes.body.telegramAlertSent, true);
    assert.equal(calls.telegramSend, 2);
  });
});
