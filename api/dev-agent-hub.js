/**
 * api/dev-agent-hub.js
 * 盛隆瓦斯 — 第一層：多代理 AI 協作中心 API 端點 (/api/dev-agent-hub)
 *
 * 路由：
 *  - GET  /api/dev-agent-hub : 查詢已配置之多模型供應商（Gemini / ChatGPT / Grok / Meta AI）、角色分工與橋樑串接狀態（零密鑰外洩）
 *  - POST /api/dev-agent-hub : 輸入自然語言需求 → 三角色跨模型協作（Architect / Implementer / Auditor）→ 編譯 JSON v1.0 → 選擇性自動 HMAC 簽章派發至 /api/dev-agent-dispatch
 */

import crypto from 'node:crypto';
import { getBearerToken, verifyToken, getClientIp, sendJson } from './_auth.js';
import { fetchWithTimeout } from './_fetch.js';
import { createBoundedRateLimiter } from './_rateLimit.js';
import { SCHEMA_VERSION, ALLOWED_REPOSITORIES, SUPERADMIN_TELEGRAM_ID } from './_dev-agent-protocol.js';
import {
  HUB_ROLES,
  MAX_DEBATE_ROUNDS,
  detectConfiguredProviders,
  runCollaborativeSession,
  dispatchTaskToBridge,
} from './_dev-agent-hub.js';
import { createDevAgentDispatchHandler } from './dev-agent-dispatch.js';

function constantTimeStringEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length === 0 || b.length === 0) {
    return false;
  }
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function createDevAgentHubHandler({
  env = process.env,
  fetchFn = fetchWithTimeout,
  verifySessionToken = verifyToken,
  now = () => Date.now(),
  rateLimiter = createBoundedRateLimiter({ windowMs: 10 * 60 * 1000, maxEntries: 1000, now }),
  bridgeHandler = null,
} = {}) {
  const internalBridgeHandler =
    bridgeHandler ||
    createDevAgentDispatchHandler({
      env,
      fetchFn,
      verifySessionToken,
      now,
    });

  return async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', env.CORS_ORIGIN || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    const configuredProviders = detectConfiguredProviders(env);

    // ── GET: 安全狀態查詢（零金鑰外洩）─────────────────────────────────────────
    if (req.method === 'GET') {
      const providerMap = {
        gemini: configuredProviders.some((p) => p.id === 'gemini'),
        openai: configuredProviders.some((p) => p.id === 'openai'),
        grok: configuredProviders.some((p) => p.id === 'grok'),
        meta: configuredProviders.some((p) => p.id === 'meta'),
      };

      return sendJson(res, 200, {
        ok: true,
        service: 'shenglong-multi-agent-collaboration-hub',
        schemaVersion: SCHEMA_VERSION,
        roles: HUB_ROLES,
        maxDebateRounds: MAX_DEBATE_ROUNDS,
        providers: providerMap,
        activeProviderCount: configuredProviders.length,
        fallbackAvailable: true,
        wiredBridgeEndpoint: '/api/dev-agent-dispatch',
        bridgeConfigured: Boolean(env.DEV_AGENT_BRIDGE_TOKEN && env.DEV_AGENT_WEBHOOK_SECRET),
        allowedRepositories: ALLOWED_REPOSITORIES,
      });
    }

    if (req.method !== 'POST') {
      return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
    }

    // ── 1. 速率限制（保護多模型 Token 額度：每 IP 10 分鐘 10 次）────────────────
    const clientIp = getClientIp(req);
    if (rateLimiter.check([{ key: `dev-hub:ip:${clientIp}`, max: 10 }])) {
      return sendJson(res, 429, {
        ok: false,
        code: 'RATE_LIMITED',
        error: 'AI 協作中心請求過於頻繁，請稍後再試（每 10 分鐘上限 10 次）',
      });
    }

    // ── 2. 身分鑑權（管理員 Session 或 DEV_AGENT_BRIDGE_TOKEN）──────────────────
    const bearer = getBearerToken(req);
    const bridgeToken = env.DEV_AGENT_BRIDGE_TOKEN || '';
    let actorId = null;

    if (bridgeToken && constantTimeStringEqual(bearer, bridgeToken)) {
      actorId = `hub_bridge_${SUPERADMIN_TELEGRAM_ID}`;
    } else if (bearer) {
      const session = verifySessionToken(bearer);
      if (session && (session.id === 'ADMIN' || session.role === 'admin')) {
        actorId = String(session.id);
      }
    }

    if (!actorId) {
      return sendJson(res, 401, {
        ok: false,
        code: 'UNAUTHORIZED',
        error: '未授權：僅限管理員或受信任協作橋樑呼叫 AI 協作中心',
      });
    }

    // ── 3. 解析請求本文 ───────────────────────────────────────────────────────
    let body = {};
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    } catch {
      return sendJson(res, 400, { ok: false, code: 'INVALID_JSON', error: '無效的 JSON 請求' });
    }

    const prompt = String(body.prompt || '').trim();
    const repository = String(body.repository || 'qazwsx32100/gass').trim();
    const autoDispatch = body.autoDispatch !== false;
    const dryRun = body.dryRun === true;
    const preferredProviders = Array.isArray(body.providers) ? body.providers : [];
    const issueNumber = Number.isInteger(body.issueNumber) ? body.issueNumber : undefined;

    // ── 4. 啟動多代理三角色協作討論並編譯 JSON v1.0 工單 ───────────────────────
    const session = await runCollaborativeSession({
      prompt,
      repository,
      requestedBy: actorId,
      preferredProviders,
      dryRun,
      issueNumber,
      env,
      fetchFn,
      now,
    });

    if (!session.ok) {
      return sendJson(res, 400, session);
    }

    // ── 5. 紅線攔截或未達共識時絕不自動派發至執行橋樑 ──────────────────────────
    if (!session.preflightPolicy.allowed || session.taskPayload.consensus.status !== 'approved') {
      return sendJson(res, 403, {
        ok: false,
        code: 'HUB_CONSENSUS_OR_POLICY_BLOCKED',
        error: 'AI 協作中心審計官或政策守門員已攔截此需求，需由老闆人工裁決',
        taskId: session.taskId,
        roleAssignments: session.roleAssignments,
        discussionTranscript: session.discussionTranscript,
        consensus: session.taskPayload.consensus,
        preflightPolicy: session.preflightPolicy,
        dispatched: false,
      });
    }

    // ── 6. 串接執行橋樑（HMAC-SHA256 簽章直發 /api/dev-agent-dispatch）──────────
    let bridgeResult = null;
    if (autoDispatch) {
      const effectiveBridgeToken = env.DEV_AGENT_BRIDGE_TOKEN || '';
      const effectiveWebhookSecret = env.DEV_AGENT_WEBHOOK_SECRET || '';

      if (!effectiveBridgeToken || !effectiveWebhookSecret) {
        return sendJson(res, 200, {
          ok: true,
          dispatched: false,
          dispatchSkippedReason: 'BRIDGE_SECRETS_NOT_CONFIGURED',
          taskId: session.taskId,
          roleAssignments: session.roleAssignments,
          discussionTranscript: session.discussionTranscript,
          taskPayload: session.taskPayload,
          preflightPolicy: session.preflightPolicy,
          message: '已完成多代理協作並產出標準 JSON v1.0 工單；待設定 DEV_AGENT_BRIDGE_TOKEN 與 DEV_AGENT_WEBHOOK_SECRET 後即可自動簽章派發。',
        });
      }

      bridgeResult = await dispatchTaskToBridge({
        taskPayload: session.taskPayload,
        bridgeHandler: internalBridgeHandler,
        bridgeToken: effectiveBridgeToken,
        webhookSecret: effectiveWebhookSecret,
        fetchFn,
        now,
      });
    }

    return sendJson(res, bridgeResult ? bridgeResult.status : 200, {
      ok: bridgeResult ? Boolean(bridgeResult.body?.ok) : true,
      dispatched: Boolean(bridgeResult && bridgeResult.body?.ok),
      taskId: session.taskId,
      roleAssignments: session.roleAssignments,
      discussionTranscript: session.discussionTranscript,
      taskPayload: session.taskPayload,
      preflightPolicy: session.preflightPolicy,
      bridgeResponse: bridgeResult,
    });
  };
}

export default createDevAgentHubHandler();
