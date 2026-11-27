/**
 * tests/dev-agent-phase1.test.mjs
 * 盛隆瓦斯 — 多代理 AI 協同開發第一階段（JSON Schema + HMAC 驗簽 + Policy Gate + Webhook 橋樑）全量單元測試
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SCHEMA_VERSION,
  SUPERADMIN_TELEGRAM_ID,
  TASK_STATES,
  canTransitionTaskState,
  signDevAgentRequest,
  verifyDevAgentSignature,
  validateMultiAgentTaskPayload,
  evaluatePolicyGate,
} from '../api/_dev-agent-protocol.js';
import { createDevAgentDispatchHandler } from '../api/dev-agent-dispatch.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SCHEMA_FILE = path.join(ROOT, 'schemas', 'multi-agent-task.v1.schema.json');

const TEST_BRIDGE_TOKEN = 'test-bridge-token-shenglong-phase1';
const TEST_WEBHOOK_SECRET = 'test-hmac-secret-shenglong-phase1';
const FIXED_NOW_MS = Date.parse('2026-11-27T18:00:00+08:00');
const FIXED_NOW_SEC = Math.floor(FIXED_NOW_MS / 1000);

function makeValidTask(overrides = {}) {
  const base = {
    schemaVersion: '1.0.0',
    taskId: 'TASK-20261127-001',
    idempotencyKey: 'sha256:9f86d081884c7d659a2feaa0c55ad015',
    createdAt: '2026-11-27T18:00:00+08:00',
    initiator: {
      source: 'multi_agent_hub',
      requestedBy: 'boss_8862712587',
      participatingModels: ['gemini-4-neon', 'chatgpt-5', 'grok-3'],
    },
    riskLevel: 'L2',
    requiresBossApproval: true,
    target: {
      repository: 'qazwsx32100/gass',
      baseBranch: 'main',
      featureBranch: 'ai-agent/task-20261127-001',
      allowedPaths: ['api/', 'tests/', 'docs/'],
      forbiddenPaths: ['android/'],
    },
    objective: {
      title: '強化 LINE 詢價多規格解析與測試覆蓋',
      summary: '新增多規格邊界測試案例並同步更新知識庫，確認零回歸。',
      issueNumber: 142,
    },
    impactAnalysis: {
      affectedSystems: ['line_webhook', 'knowledge_base'],
      touchesLegacyErp: false,
      touchesDriverLocation: false,
      touchesPricingMaster: false,
      mitigationNotes: '僅修改解析函式並強制三方同步知識庫與跑完整測試。',
    },
    planSteps: [
      { step: 1, action: 'add_test', description: '先新增邊界單元測試案例' },
      { step: 2, action: 'edit_code', description: '調整文字解析函式' },
      { step: 3, action: 'verify', description: '執行 npm test 驗證全部通過' },
    ],
    acceptanceCriteria: {
      requiredCommands: ['npm test', 'npm run lint'],
      maxChangedFiles: 10,
      mustOpenPullRequest: true,
      allowDirectMainPush: false,
    },
    safetyConstraints: {
      noLegacyErpDdl: true,
      noDriverGpsPolling: true,
      minPollingIntervalSeconds: 60,
      noHardcodedSecrets: true,
      maxAgentIterations: 10,
      maxTokenBudgetUsd: 2.0,
    },
    consensus: {
      status: 'approved',
      dissentingNotes: [],
      confidenceScore: 0.94,
    },
  };

  return {
    ...base,
    ...overrides,
    initiator: { ...base.initiator, ...(overrides.initiator || {}) },
    target: { ...base.target, ...(overrides.target || {}) },
    objective: { ...base.objective, ...(overrides.objective || {}) },
    impactAnalysis: { ...base.impactAnalysis, ...(overrides.impactAnalysis || {}) },
    acceptanceCriteria: { ...base.acceptanceCriteria, ...(overrides.acceptanceCriteria || {}) },
    safetyConstraints: { ...base.safetyConstraints, ...(overrides.safetyConstraints || {}) },
    consensus: { ...base.consensus, ...(overrides.consensus || {}) },
  };
}

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

function makeSignedReq({
  method = 'POST',
  payload = makeValidTask(),
  token = TEST_BRIDGE_TOKEN,
  secret = TEST_WEBHOOK_SECRET,
  timestamp = FIXED_NOW_SEC,
  overrideSignature = null,
  extraHeaders = {},
  ip = '203.0.113.10',
} = {}) {
  const rawBody = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const signature =
    overrideSignature !== null
      ? overrideSignature
      : signDevAgentRequest({ secret, timestamp, rawBody });

  return {
    method,
    rawBody,
    body: typeof payload === 'string' ? payload : payload,
    headers: {
      authorization: token ? `Bearer ${token}` : '',
      'x-agent-timestamp': String(timestamp),
      'x-agent-signature-256': signature,
      'x-forwarded-for': ip,
      ...extraHeaders,
    },
    socket: { remoteAddress: ip },
  };
}

describe('Phase 1: JSON Schema File & Task State Machine', () => {
  it('schemas/multi-agent-task.v1.schema.json parses cleanly and matches protocol version', () => {
    assert.ok(fs.existsSync(SCHEMA_FILE), 'Schema file must exist');
    const schema = JSON.parse(fs.readFileSync(SCHEMA_FILE, 'utf8'));
    assert.equal(schema.properties.schemaVersion.const, SCHEMA_VERSION);
    assert.equal(schema.properties.acceptanceCriteria.properties.allowDirectMainPush.const, false);
    assert.equal(schema.properties.acceptanceCriteria.properties.mustOpenPullRequest.const, true);
    assert.equal(schema.properties.safetyConstraints.properties.noLegacyErpDdl.const, true);
    assert.equal(schema.properties.safetyConstraints.properties.minPollingIntervalSeconds.minimum, 60);
  });

  it('Task state machine permits valid lifecycle transitions and blocks illegal jumps', () => {
    assert.equal(canTransitionTaskState(TASK_STATES.QUEUED, TASK_STATES.DISPATCHED), true);
    assert.equal(canTransitionTaskState(TASK_STATES.CI_PASSED, TASK_STATES.AWAITING_APPROVAL), true);
    assert.equal(canTransitionTaskState(TASK_STATES.AWAITING_APPROVAL, TASK_STATES.MERGED), true);
    assert.equal(canTransitionTaskState(TASK_STATES.MERGED, TASK_STATES.DEPLOYED), true);
    assert.equal(canTransitionTaskState(TASK_STATES.QUEUED, TASK_STATES.DEPLOYED), false);
    assert.equal(canTransitionTaskState(TASK_STATES.DEPLOYED, TASK_STATES.RUNNING), false);
  });
});

describe('Phase 1: HMAC Signature & Replay Protection', () => {
  it('accepts valid HMAC-SHA256 signature within ±300s skew window', () => {
    const rawBody = JSON.stringify({ hello: 'shenglong' });
    const sig = signDevAgentRequest({ secret: TEST_WEBHOOK_SECRET, timestamp: FIXED_NOW_SEC, rawBody });
    const res = verifyDevAgentSignature({
      secret: TEST_WEBHOOK_SECRET,
      timestamp: FIXED_NOW_SEC,
      signature: sig,
      rawBody,
      nowSec: FIXED_NOW_SEC + 120,
    });
    assert.equal(res.valid, true);
  });

  it('rejects forged signature and expired replay timestamps', () => {
    const rawBody = JSON.stringify({ hello: 'shenglong' });
    const sig = signDevAgentRequest({ secret: TEST_WEBHOOK_SECRET, timestamp: FIXED_NOW_SEC, rawBody });

    const forged = verifyDevAgentSignature({
      secret: TEST_WEBHOOK_SECRET,
      timestamp: FIXED_NOW_SEC,
      signature: `${sig.slice(0, -4)}dead`,
      rawBody,
      nowSec: FIXED_NOW_SEC,
    });
    assert.equal(forged.valid, false);
    assert.equal(forged.reason, 'SIGNATURE_MISMATCH');

    const replay = verifyDevAgentSignature({
      secret: TEST_WEBHOOK_SECRET,
      timestamp: FIXED_NOW_SEC - 301,
      signature: signDevAgentRequest({ secret: TEST_WEBHOOK_SECRET, timestamp: FIXED_NOW_SEC - 301, rawBody }),
      rawBody,
      nowSec: FIXED_NOW_SEC,
    });
    assert.equal(replay.valid, false);
    assert.equal(replay.reason, 'TIMESTAMP_EXPIRED_OR_REPLAY');
  });
});

describe('Phase 1: Policy-as-Code Guardrails (ShengLong Supreme Directives)', () => {
  it('passes compliant L2 task with zero violations', () => {
    const task = makeValidTask();
    const schemaCheck = validateMultiAgentTaskPayload(task);
    assert.equal(schemaCheck.valid, true, JSON.stringify(schemaCheck.errors));

    const policy = evaluatePolicyGate(task);
    assert.equal(policy.allowed, true);
    assert.equal(policy.effectiveRiskLevel, 'L2');
    assert.equal(policy.superAdminId, SUPERADMIN_TELEGRAM_ID);
  });

  it('blocks direct push to main or non-ai-agent branch (Directive #2)', () => {
    const task = makeValidTask({
      target: { featureBranch: 'main' },
      acceptanceCriteria: { allowDirectMainPush: true },
    });
    const policy = evaluatePolicyGate(task);
    assert.equal(policy.allowed, false);
    const codes = policy.violations.map((v) => v.code);
    assert.ok(codes.includes('POLICY_NO_DIRECT_MAIN_PUSH'));
    assert.ok(codes.includes('POLICY_INVALID_FEATURE_BRANCH'));
  });

  it('blocks legacy ERP touch flag AND sneaky DDL text in planSteps (Directive #4)', () => {
    const taskFlag = makeValidTask({ impactAnalysis: { touchesLegacyErp: true } });
    const policyFlag = evaluatePolicyGate(taskFlag);
    assert.equal(policyFlag.allowed, false);
    assert.ok(policyFlag.violations.some((v) => v.code === 'POLICY_LEGACY_ERP_BLACKBOX'));

    const sneakyTask = makeValidTask({
      planSteps: [
        { step: 1, action: 'edit_code', description: '執行 ALTER TABLE dbo.gas_oders ADD col1 INT' },
      ],
    });
    const policySneaky = evaluatePolicyGate(sneakyTask);
    assert.equal(policySneaky.allowed, false);
    assert.ok(policySneaky.violations.some((v) => v.code === 'POLICY_LEGACY_ERP_BLACKBOX'));
  });

  it('blocks polling interval < 60s and hardcoded secret tokens (AI 犯錯中心)', () => {
    const fastPoll = makeValidTask({ safetyConstraints: { minPollingIntervalSeconds: 15 } });
    const resPoll = evaluatePolicyGate(fastPoll);
    assert.equal(resPoll.allowed, false);
    assert.ok(resPoll.violations.some((v) => v.code === 'POLICY_AI_MISTAKE_CENTER_MIN_POLLING'));

    const leakedToken = makeValidTask({
      objective: { summary: '測試不小心夾帶金鑰 ghp_1234567890abcdefghij1234567890 在描述內' },
    });
    const resSecret = evaluatePolicyGate(leakedToken);
    assert.equal(resSecret.allowed, false);
    assert.ok(resSecret.violations.some((v) => v.code === 'POLICY_SECRET_LEAK_DETECTED'));
  });

  it('auto-escalates driver/pricing tasks to L3 with Boss approval and guard:zero-notify', () => {
    const driverTask = makeValidTask({
      riskLevel: 'L1',
      requiresBossApproval: false,
      target: {
        repository: 'qazwsx32100/shenglong-next',
        allowedPaths: ['app/driver/'],
      },
      impactAnalysis: { touchesDriverLocation: true },
    });
    const policy = evaluatePolicyGate(driverTask);
    assert.equal(policy.allowed, true);
    assert.equal(policy.effectiveRiskLevel, 'L3');
    assert.equal(policy.requiresBossApproval, true);
    assert.ok(policy.requiredGuards.includes('npm run guard:zero-notify'));
  });
});

describe('Phase 1: /api/dev-agent-dispatch Webhook Gateway Handler', () => {
  const baseEnv = {
    DEV_AGENT_BRIDGE_TOKEN: TEST_BRIDGE_TOKEN,
    DEV_AGENT_WEBHOOK_SECRET: TEST_WEBHOOK_SECRET,
    DEV_AGENT_GITHUB_DISPATCH_ENABLED: 'false',
  };

  it('GET returns safe discovery metadata without leaking secrets; OPTIONS returns 204; DELETE returns 405', async () => {
    const handler = createDevAgentDispatchHandler({ env: baseEnv, now: () => FIXED_NOW_MS });

    const resGet = makeRes();
    await handler({ method: 'GET', headers: {} }, resGet);
    assert.equal(resGet.statusCode, 200);
    assert.equal(resGet.body.protocol, 'multi-agent-task.v1');
    assert.equal(resGet.body.bridgeConfigured, true);
    assert.ok(!JSON.stringify(resGet.body).includes(TEST_BRIDGE_TOKEN));
    assert.ok(!JSON.stringify(resGet.body).includes(TEST_WEBHOOK_SECRET));

    const resOpt = makeRes();
    await handler({ method: 'OPTIONS', headers: {} }, resOpt);
    assert.equal(resOpt.statusCode, 204);

    const resDel = makeRes();
    await handler({ method: 'DELETE', headers: {} }, resDel);
    assert.equal(resDel.statusCode, 405);
  });

  it('rejects unauthenticated, forged signature, and missing impactAnalysis requests', async () => {
    const handler = createDevAgentDispatchHandler({ env: baseEnv, now: () => FIXED_NOW_MS });

    // Unauthenticated -> 401
    const res401 = makeRes();
    await handler(makeSignedReq({ token: 'wrong-token' }), res401);
    assert.equal(res401.statusCode, 401);

    // Forged signature -> 401
    const resForged = makeRes();
    await handler(makeSignedReq({ overrideSignature: 'sha256=0000' }), resForged);
    assert.equal(resForged.statusCode, 401);

    // Missing impactAnalysis -> 400
    const badTask = makeValidTask();
    delete badTask.impactAnalysis;
    const res400 = makeRes();
    await handler(makeSignedReq({ payload: badTask }), res400);
    assert.equal(res400.statusCode, 400);
    assert.equal(res400.body.code, 'SCHEMA_VALIDATION_FAILED');
  });

  it('rejects policy violations with HTTP 403', async () => {
    const handler = createDevAgentDispatchHandler({ env: baseEnv, now: () => FIXED_NOW_MS });
    const erpTask = makeValidTask({ impactAnalysis: { touchesLegacyErp: true } });
    const res = makeRes();
    await handler(makeSignedReq({ payload: erpTask }), res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, 'POLICY_GATE_REJECTED');
  });

  it('supports dryRun validation (200) and sandbox queue mode + 24h idempotency deduplication (202 -> 200 duplicate)', async () => {
    const handler = createDevAgentDispatchHandler({ env: baseEnv, now: () => FIXED_NOW_MS });

    // Dry-run
    const resDry = makeRes();
    await handler(makeSignedReq({ payload: makeValidTask({ dryRun: true }) }), resDry);
    assert.equal(resDry.statusCode, 200);
    assert.equal(resDry.body.status, 'DRY_RUN_VALIDATED');
    assert.equal(resDry.body.dispatchPreview.event_type, 'multi_agent_task');

    // First real submission (sandbox queue mode) -> 202
    const task = makeValidTask();
    const resFirst = makeRes();
    await handler(makeSignedReq({ payload: task }), resFirst);
    assert.equal(resFirst.statusCode, 202);
    assert.equal(resFirst.body.status, TASK_STATES.QUEUED);
    assert.equal(resFirst.body.duplicate, false);

    // Duplicate idempotencyKey -> 200 duplicate: true
    const resDup = makeRes();
    await handler(makeSignedReq({ payload: task }), resDup);
    assert.equal(resDup.statusCode, 200);
    assert.equal(resDup.body.duplicate, true);
    assert.equal(resDup.body.taskId, task.taskId);
  });

  it('dispatches to GitHub repository_dispatch once when enabled and respects idempotency', async () => {
    let fetchCalls = 0;
    let capturedUrl = '';
    let capturedBody = null;

    const handler = createDevAgentDispatchHandler({
      env: {
        ...baseEnv,
        DEV_AGENT_GITHUB_DISPATCH_ENABLED: 'true',
        GITHUB_ACTIONS_PAT: 'mock-pat-for-unit-test',
      },
      now: () => FIXED_NOW_MS,
      fetchFn: async (url, init) => {
        fetchCalls += 1;
        capturedUrl = url;
        capturedBody = JSON.parse(init.body);
        return { status: 204, text: async () => '' };
      },
    });

    const task = makeValidTask();
    const res1 = makeRes();
    await handler(makeSignedReq({ payload: task }), res1);
    assert.equal(res1.statusCode, 202);
    assert.equal(res1.body.status, TASK_STATES.DISPATCHED);
    assert.equal(fetchCalls, 1);
    assert.equal(capturedUrl, 'https://api.github.com/repos/qazwsx32100/gass/dispatches');
    assert.equal(capturedBody.event_type, 'multi_agent_task');
    assert.equal(capturedBody.client_payload.taskId, task.taskId);
    assert.ok(
      Object.keys(capturedBody.client_payload).length <= 10,
      'GitHub repository_dispatch client_payload must have <= 10 top-level properties'
    );

    // Resend same idempotencyKey -> must NOT call GitHub API a second time
    const res2 = makeRes();
    await handler(makeSignedReq({ payload: task }), res2);
    assert.equal(res2.statusCode, 200);
    assert.equal(res2.body.duplicate, true);
    assert.equal(fetchCalls, 1);
  });

  it('enforces per-IP rate limit (429) and fail-closed 503 when bridge secrets are unconfigured', async () => {
    // Fail-closed 503 when unconfigured
    const unconfiguredHandler = createDevAgentDispatchHandler({ env: {}, now: () => FIXED_NOW_MS });
    const res503 = makeRes();
    await unconfiguredHandler(
      { method: 'POST', headers: {}, body: makeValidTask(), socket: { remoteAddress: '198.51.100.1' } },
      res503
    );
    assert.equal(res503.statusCode, 503);

    // Rate limit 429 on 21st request
    const handler = createDevAgentDispatchHandler({ env: baseEnv, now: () => FIXED_NOW_MS });
    for (let i = 0; i < 20; i += 1) {
      const r = makeRes();
      await handler(makeSignedReq({ payload: makeValidTask({ dryRun: true }), ip: '198.51.100.99' }), r);
      assert.equal(r.statusCode, 200);
    }
    const r21 = makeRes();
    await handler(makeSignedReq({ payload: makeValidTask({ dryRun: true }), ip: '198.51.100.99' }), r21);
    assert.equal(r21.statusCode, 429);
    assert.equal(r21.body.code, 'RATE_LIMITED');
  });
});
