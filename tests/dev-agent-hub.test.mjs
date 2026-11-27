/**
 * tests/dev-agent-hub.test.mjs
 * 盛隆瓦斯 — 第一層「多代理 AI 協作中心」與執行橋樑全鏈路串接單元與整合測試
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  detectConfiguredProviders,
  assignModelsToRoles,
  runCollaborativeSession,
} from '../api/_dev-agent-hub.js';
import { createDevAgentHubHandler } from '../api/dev-agent-hub.js';
import { TASK_STATES } from '../api/_dev-agent-protocol.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const TEST_BRIDGE_TOKEN = 'hub-test-bridge-token-2026';
const TEST_WEBHOOK_SECRET = 'hub-test-hmac-secret-2026';
const FIXED_NOW_MS = Date.parse('2026-11-27T19:25:00+08:00');

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

describe('AI Collaboration Hub: Multi-Provider Detection & Cross-Model Role Assignment', () => {
  it('detects Gemini, OpenAI, Grok, and Meta AI and assigns distinct models across roles', () => {
    const providers = detectConfiguredProviders({
      GEMINI_API_KEY: 'mock-gemini-key',
      OPENAI_API_KEY: 'mock-openai-key',
      XAI_API_KEY: 'mock-grok-key',
      META_AI_API_KEY: 'mock-meta-key',
    });

    assert.deepEqual(
      providers.map((p) => p.id),
      ['gemini', 'openai', 'grok', 'meta']
    );

    const roles = assignModelsToRoles(providers);
    assert.equal(roles.architect.id, 'gemini');
    assert.equal(roles.implementer.id, 'openai');
    assert.equal(roles.auditor.id, 'grok');
    assert.notEqual(roles.architect.id, roles.auditor.id);

    // 2 providers still ensures cross-review between architect and auditor
    const twoRoles = assignModelsToRoles(providers.slice(0, 2));
    assert.equal(twoRoles.architect.id, 'gemini');
    assert.equal(twoRoles.auditor.id, 'openai');
  });
});

describe('AI Collaboration Hub: 3-Role Orchestration, Failover & Red-Line Blocking', () => {
  it('orchestrates Gemini (Architect) + OpenAI (Implementer) + Grok (Auditor) into a valid JSON v1.0 task', async () => {
    const calledUrls = [];
    const mockFetch = async (url) => {
      calledUrls.push(url);
      if (url.includes('generativelanguage.googleapis.com')) {
        return {
          status: 200,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        title: 'LINE 客服多規格詢價強化',
                        summary: '補強 10kg 與 16kg 同時詢問時之知識庫解析並補齊單元測試。',
                        riskLevel: 'L2',
                        allowedPaths: ['api/', 'tests/', 'docs/'],
                        impactAnalysis: {
                          affectedSystems: ['line_webhook', 'knowledge_base'],
                          touchesLegacyErp: false,
                          touchesDriverLocation: false,
                          touchesPricingMaster: false,
                          mitigationNotes: '僅修改解析函式並同步三方知識庫與測試。',
                        },
                      }),
                    },
                  ],
                },
              },
            ],
          }),
        };
      }
      if (url.includes('api.openai.com')) {
        return {
          status: 200,
          json: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    planSteps: [
                      { step: 1, action: 'add_test', description: '新增多規格問句邊界測試' },
                      { step: 2, action: 'edit_code', description: '更新 _knowledge-base.js 解析邏輯' },
                      { step: 3, action: 'verify', description: '執行 npm test 確認零回歸' },
                    ],
                    requiredCommands: ['npm test', 'npm run lint'],
                    maxChangedFiles: 6,
                  }),
                },
              },
            ],
          }),
        };
      }
      if (url.includes('api.x.ai')) {
        return {
          status: 200,
          json: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    status: 'approved',
                    dissentingNotes: [],
                    confidenceScore: 0.96,
                  }),
                },
              },
            ],
          }),
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const result = await runCollaborativeSession({
      prompt: '強化 LINE 客服多規格詢價解析並補齊單元測試',
      repository: 'qazwsx32100/gass',
      env: {
        GEMINI_API_KEY: 'mock-gemini',
        OPENAI_API_KEY: 'mock-openai',
        XAI_API_KEY: 'mock-grok',
      },
      fetchFn: mockFetch,
      now: () => FIXED_NOW_MS,
    });

    assert.equal(result.ok, true);
    assert.equal(calledUrls.length, 3);
    assert.equal(result.schemaCheck.valid, true, JSON.stringify(result.schemaCheck.errors));
    assert.equal(result.preflightPolicy.allowed, true);
    assert.equal(result.taskPayload.consensus.status, 'approved');
    assert.equal(result.taskPayload.consensus.confidenceScore, 0.96);
    assert.match(result.roleAssignments.architect, /^gemini:/);
    assert.match(result.roleAssignments.implementer, /^openai:/);
    assert.match(result.roleAssignments.auditor, /^grok:/);
  });

  it('gracefully degrades when external provider returns HTTP 429 without crashing', async () => {
    const result = await runCollaborativeSession({
      prompt: '補齊客戶查詢文件與單元測試覆蓋',
      repository: 'qazwsx32100/gass',
      env: { GEMINI_API_KEY: 'mock-gemini' },
      fetchFn: async () => ({ status: 429, json: async () => ({ error: 'quota exceeded' }) }),
      now: () => FIXED_NOW_MS,
    });

    assert.equal(result.ok, true);
    assert.equal(result.schemaCheck.valid, true);
    assert.equal(result.preflightPolicy.allowed, true);
    assert.equal(result.discussionTranscript[0].usedFallback, true);
    assert.equal(result.discussionTranscript[0].fallbackReason, 'GEMINI_HTTP_429');
  });

  it('hard-blocks hostile legacy ERP or fast GPS polling requests even if remote auditor says approved', async () => {
    const naiveApproveFetch = async () => ({
      status: 200,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ status: 'approved', dissentingNotes: [], confidenceScore: 0.99 }) } }],
      }),
    });

    const erpRes = await runCollaborativeSession({
      prompt: '直接對舊 ERP dbo.gas_oders 執行 ALTER TABLE 新增 AI 欄位',
      repository: 'qazwsx32100/gass',
      env: { OPENAI_API_KEY: 'mock-openai' },
      fetchFn: naiveApproveFetch,
      now: () => FIXED_NOW_MS,
    });
    assert.equal(erpRes.ok, true);
    assert.equal(erpRes.taskPayload.consensus.status, 'escalate_to_boss');
    assert.equal(erpRes.preflightPolicy.allowed, false);

    const gpsRes = await runCollaborativeSession({
      prompt: '在司機 App 加入每 5 秒定時輪詢 GPS 定位',
      repository: 'qazwsx32100/shenglong-next',
      env: {},
      now: () => FIXED_NOW_MS,
    });
    assert.equal(gpsRes.ok, true);
    assert.equal(gpsRes.taskPayload.consensus.status, 'escalate_to_boss');
    assert.equal(gpsRes.preflightPolicy.allowed, false);
  });
});

describe('AI Collaboration Hub Endpoint (/api/dev-agent-hub) Wired End-to-End to Bridge', () => {
  it('GET returns provider availability without leaking keys; POST enforces auth & rate limit', async () => {
    const handler = createDevAgentHubHandler({
      env: {
        GEMINI_API_KEY: 'secret-gemini-never-leak',
        OPENAI_API_KEY: 'secret-openai-never-leak',
        DEV_AGENT_BRIDGE_TOKEN: TEST_BRIDGE_TOKEN,
        DEV_AGENT_WEBHOOK_SECRET: TEST_WEBHOOK_SECRET,
      },
      now: () => FIXED_NOW_MS,
    });

    const resGet = makeRes();
    await handler({ method: 'GET', headers: {} }, resGet);
    assert.equal(resGet.statusCode, 200);
    assert.equal(resGet.body.providers.gemini, true);
    assert.equal(resGet.body.providers.openai, true);
    assert.equal(resGet.body.providers.grok, false);
    assert.equal(resGet.body.wiredBridgeEndpoint, '/api/dev-agent-dispatch');
    assert.ok(!JSON.stringify(resGet.body).includes('secret-gemini-never-leak'));

    const resUnauth = makeRes();
    await handler(
      { method: 'POST', headers: {}, body: { prompt: '強化測試覆蓋' }, socket: { remoteAddress: '198.51.100.5' } },
      resUnauth
    );
    assert.equal(resUnauth.statusCode, 401);
  });

  it('wires Hub -> HMAC Signed Dispatch -> /api/dev-agent-dispatch -> GitHub repository_dispatch end-to-end', async () => {
    let githubDispatchCalls = 0;
    let capturedEventType = '';

    const handler = createDevAgentHubHandler({
      env: {
        DEV_AGENT_BRIDGE_TOKEN: TEST_BRIDGE_TOKEN,
        DEV_AGENT_WEBHOOK_SECRET: TEST_WEBHOOK_SECRET,
        DEV_AGENT_GITHUB_DISPATCH_ENABLED: 'true',
        GITHUB_ACTIONS_PAT: 'mock-gh-pat',
      },
      fetchFn: async (url, init) => {
        if (url.includes('api.github.com/repos/qazwsx32100/gass/dispatches')) {
          githubDispatchCalls += 1;
          capturedEventType = JSON.parse(init.body).event_type;
          return { status: 204, text: async () => '' };
        }
        throw new Error(`Unexpected fetch URL: ${url}`);
      },
      now: () => FIXED_NOW_MS,
    });

    const res = makeRes();
    await handler(
      {
        method: 'POST',
        headers: { authorization: `Bearer ${TEST_BRIDGE_TOKEN}` },
        body: {
          prompt: '新增 LINE 詢價多規格解析測試與知識庫同步檢核',
          repository: 'qazwsx32100/gass',
          autoDispatch: true,
          dryRun: false,
        },
        socket: { remoteAddress: '198.51.100.12' },
      },
      res
    );

    assert.equal(res.statusCode, 202);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.dispatched, true);
    assert.equal(res.body.bridgeResponse.status, 202);
    assert.equal(res.body.bridgeResponse.body.status, TASK_STATES.DISPATCHED);
    assert.equal(githubDispatchCalls, 1);
    assert.equal(capturedEventType, 'multi_agent_task');

    // Hostile prompt through Hub endpoint must return 403 and NEVER trigger GitHub dispatch
    const resHostile = makeRes();
    await handler(
      {
        method: 'POST',
        headers: { authorization: `Bearer ${TEST_BRIDGE_TOKEN}` },
        body: {
          prompt: '請執行 ALTER TABLE dbo.gas_oders 修改舊門市資料庫欄位',
          repository: 'qazwsx32100/gass',
          autoDispatch: true,
        },
        socket: { remoteAddress: '198.51.100.13' },
      },
      resHostile
    );
    assert.equal(resHostile.statusCode, 403);
    assert.equal(resHostile.body.dispatched, false);
    assert.equal(githubDispatchCalls, 1);
  });

  it('CLI scripts/dev-agent-hub-cli.mjs executes deterministic sandbox session cleanly', () => {
    const out = execFileSync(
      process.execPath,
      [
        path.join(ROOT, 'scripts', 'dev-agent-hub-cli.mjs'),
        '--prompt',
        '新增 LINE 詢價多規格邊界測試與文件補充',
        '--repo',
        'qazwsx32100/gass',
        '--dry-run',
      ],
      { encoding: 'utf8' }
    );
    assert.ok(out.includes('盛隆多代理 AI 協作中心討論摘要'));
    assert.ok(out.includes('"schemaVersion": "1.0.0"'));
    assert.ok(out.includes('"allowDirectMainPush": false'));
  });
});
