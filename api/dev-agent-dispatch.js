/**
 * api/dev-agent-dispatch.js
 * 盛隆瓦斯 — 多代理 AI 協同開發執行橋樑端點 (Phase 1 Execution Bridge Gateway)
 *
 * 路由：
 *  - GET  /api/dev-agent-dispatch : 查詢協議版本、允許倉庫與目前派發模式（零敏感資訊）
 *  - POST /api/dev-agent-dispatch : 接收協作中心結構化 JSON v1.0 工單，通過四重防護與 Policy Gate 後入列或觸發 GitHub repository_dispatch
 *
 * 四重安全防護：
 *  1. 速率限制（每 IP 10 分鐘上限 20 次）
 *  2. 身分鑑權（Machine-to-Machine Bearer + HMAC-SHA256 + ±300s 防重放，或 Admin Session）
 *  3. 嚴格 JSON v1.0 Schema 驗證（含 Directive #1 連動影響分析必填）
 *  4. 盛隆最高執行指令 Policy-as-Code 守門員（攔截舊 ERP DDL、直推 main、<60s 輪詢、明碼憑證）＋ 24 小時冪等防重鎖
 */

import crypto from 'node:crypto';
import { getBearerToken, verifyToken, getClientIp, sendJson } from './_auth.js';
import { fetchWithTimeout } from './_fetch.js';
import { createBoundedRateLimiter } from './_rateLimit.js';
import {
  SCHEMA_VERSION,
  SUPERADMIN_TELEGRAM_ID,
  ALLOWED_REPOSITORIES,
  TASK_STATES,
  verifyDevAgentSignature,
  validateMultiAgentTaskPayload,
  evaluatePolicyGate,
  createIdempotencyStore,
  buildGithubDispatchPayload,
} from './_dev-agent-protocol.js';

function constantTimeStringEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length === 0 || b.length === 0) {
    return false;
  }
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function getHeader(req, name) {
  const headers = req?.headers || {};
  const target = name.toLowerCase();
  for (const [key, val] of Object.entries(headers)) {
    if (key.toLowerCase() === target) {
      return Array.isArray(val) ? String(val[0] || '') : String(val || '');
    }
  }
  return '';
}

export function createDevAgentDispatchHandler({
  env = process.env,
  fetchFn = fetchWithTimeout,
  verifySessionToken = verifyToken,
  now = () => Date.now(),
  rateLimiter = createBoundedRateLimiter({ windowMs: 10 * 60 * 1000, maxEntries: 2000, now }),
  idempotencyStore = createIdempotencyStore({ ttlMs: 24 * 60 * 60 * 1000, maxEntries: 2000, now }),
} = {}) {
  return async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', env.CORS_ORIGIN || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Agent-Timestamp, X-Agent-Signature-256, X-Idempotency-Key'
    );
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    const githubDispatchEnabled = String(env.DEV_AGENT_GITHUB_DISPATCH_ENABLED || '').toLowerCase() === 'true';

    // ── GET: 安全元資料探索（不外洩任何密鑰或內部細節）────────────────────────
    if (req.method === 'GET') {
      return sendJson(res, 200, {
        ok: true,
        protocol: 'multi-agent-task.v1',
        schemaVersion: SCHEMA_VERSION,
        allowedRepositories: ALLOWED_REPOSITORIES,
        dispatchMode: githubDispatchEnabled ? 'github_repository_dispatch' : 'sandbox_queue_only',
        superAdminApprovalRequiredFor: ['L3'],
        bridgeConfigured: Boolean(env.DEV_AGENT_BRIDGE_TOKEN && env.DEV_AGENT_WEBHOOK_SECRET),
      });
    }

    if (req.method !== 'POST') {
      return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
    }

    // ── 1. 速率限制（防刷爆）──────────────────────────────────────────────────
    const clientIp = getClientIp(req);
    const limited = rateLimiter.check([{ key: `dev-agent:ip:${clientIp}`, max: 20 }]);
    if (limited) {
      return sendJson(res, 429, {
        ok: false,
        code: 'RATE_LIMITED',
        error: '請求過於頻繁，請稍後再試（每 10 分鐘上限 20 次）',
      });
    }

    // ── 2. 取得原始本文並解析 JSON ────────────────────────────────────────────
    const rawBody =
      typeof req.rawBody === 'string'
        ? req.rawBody
        : typeof req.body === 'string'
          ? req.body
          : JSON.stringify(req.body ?? {});

    let payload;
    try {
      payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch {
      return sendJson(res, 400, { ok: false, code: 'INVALID_JSON', error: '無效的 JSON 請求內容' });
    }

    // ── 3. 身分鑑權（雙通道：Webhook Bearer+HMAC 或 Admin Session）─────────────
    const bearer = getBearerToken(req);
    const bridgeToken = env.DEV_AGENT_BRIDGE_TOKEN || '';
    const webhookSecret = env.DEV_AGENT_WEBHOOK_SECRET || '';

    let authActor = null;
    const isMachineTokenMatch = bridgeToken && constantTimeStringEqual(bearer, bridgeToken);

    if (isMachineTokenMatch) {
      const tsHeader = getHeader(req, 'x-agent-timestamp');
      const sigHeader = getHeader(req, 'x-agent-signature-256');
      const sigResult = verifyDevAgentSignature({
        secret: webhookSecret,
        timestamp: tsHeader,
        signature: sigHeader,
        rawBody,
        nowSec: Math.floor(now() / 1000),
      });
      if (!sigResult.valid) {
        return sendJson(res, 401, {
          ok: false,
          code: sigResult.reason,
          error: 'Webhook 簽章驗證失敗或請求已逾時',
        });
      }
      authActor = { mode: 'webhook_bridge', id: 'multi_agent_hub' };
    } else if (bearer) {
      const session = verifySessionToken(bearer);
      if (session && (session.id === 'ADMIN' || session.role === 'admin')) {
        authActor = { mode: 'admin_session', id: String(session.id) };
      }
    }

    if (!authActor) {
      if (!bridgeToken && !webhookSecret && !bearer) {
        return sendJson(res, 503, {
          ok: false,
          code: 'BRIDGE_NOT_CONFIGURED',
          error: '多代理橋樑環境變數未完成設定，已採安全關閉策略（Fail-Closed）',
        });
      }
      return sendJson(res, 401, {
        ok: false,
        code: 'UNAUTHORIZED',
        error: '未授權：請提供有效之 Webhook 憑證與簽章或管理員 Token',
      });
    }

    // ── 4. 嚴格 JSON v1.0 Schema 驗證 ─────────────────────────────────────────
    const schemaCheck = validateMultiAgentTaskPayload(payload);
    if (!schemaCheck.valid) {
      return sendJson(res, 400, {
        ok: false,
        code: 'SCHEMA_VALIDATION_FAILED',
        error: '任務 JSON 不符合 multi-agent-task.v1 規範',
        errors: schemaCheck.errors,
      });
    }

    // ── 5. 盛隆最高執行指令 Policy-as-Code 守門員 ──────────────────────────────
    const policy = evaluatePolicyGate(payload);
    if (!policy.allowed) {
      return sendJson(res, 403, {
        ok: false,
        code: 'POLICY_GATE_REJECTED',
        error: '工單觸犯盛隆最高執行指令安全護欄，已強制攔截',
        violations: policy.violations,
        warnings: policy.warnings,
      });
    }

    // ── 6. 冪等鎖檢查（24 小時內相同鍵值直接回傳原收據）───────────────────────
    const headerIdemKey = getHeader(req, 'x-idempotency-key').trim();
    const idempotencyKey = headerIdemKey || payload.idempotencyKey;
    const cached = idempotencyStore.get(idempotencyKey);
    if (cached) {
      return sendJson(res, 200, {
        ...cached,
        duplicate: true,
        message: '偵測到相同冪等鍵，已回傳既有工單收據（未重複派發）',
      });
    }

    const receivedAt = new Date(now()).toISOString();
    const dispatchPayload = buildGithubDispatchPayload(payload, policy);

    // ── 7. Dry-Run 模式（驗證流程但絕不觸發外部派發）──────────────────────────
    if (payload.dryRun === true) {
      const dryRunReceipt = {
        ok: true,
        dryRun: true,
        duplicate: false,
        taskId: payload.taskId,
        idempotencyKey,
        status: 'DRY_RUN_VALIDATED',
        effectiveRiskLevel: policy.effectiveRiskLevel,
        requiresBossApproval: policy.requiresBossApproval,
        superAdminId: SUPERADMIN_TELEGRAM_ID,
        requiredGuards: policy.requiredGuards,
        warnings: policy.warnings,
        authMode: authActor.mode,
        receivedAt,
        dispatchPreview: dispatchPayload,
      };
      return sendJson(res, 200, dryRunReceipt);
    }

    // ── 8. 派發至 GitHub repository_dispatch（受環境開關嚴格保護）─────────────
    let finalStatus = TASK_STATES.QUEUED;
    let dispatchMode = 'sandbox_queue_only';

    if (githubDispatchEnabled) {
      const pat = env.GITHUB_ACTIONS_PAT || '';
      if (!pat) {
        return sendJson(res, 503, {
          ok: false,
          code: 'GITHUB_PAT_MISSING',
          error: '已啟用 GitHub 派發模式但缺少 GITHUB_ACTIONS_PAT 環境變數',
        });
      }

      const dispatchUrl = `https://api.github.com/repos/${payload.target.repository}/dispatches`;
      let ghRes;
      try {
        ghRes = await fetchFn(
          dispatchUrl,
          {
            method: 'POST',
            headers: {
              Accept: 'application/vnd.github+json',
              Authorization: `Bearer ${pat}`,
              'X-GitHub-Api-Version': '2022-11-28',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(dispatchPayload),
          },
          15000
        );
      } catch (err) {
        return sendJson(res, 502, {
          ok: false,
          code: 'GITHUB_DISPATCH_NETWORK_ERROR',
          error: `連線 GitHub Dispatch 失敗：${err.message}`,
        });
      }

      if (ghRes.status !== 204) {
        let detail = '';
        try {
          detail = await ghRes.text();
        } catch {
          /* ignore */
        }
        return sendJson(res, ghRes.status >= 500 ? 502 : 422, {
          ok: false,
          code: 'GITHUB_DISPATCH_REJECTED',
          error: `GitHub API 回傳錯誤狀態 ${ghRes.status}`,
          detail: detail.slice(0, 400),
        });
      }

      finalStatus = TASK_STATES.DISPATCHED;
      dispatchMode = 'github_repository_dispatch';
    }

    const receipt = {
      ok: true,
      dryRun: false,
      duplicate: false,
      taskId: payload.taskId,
      idempotencyKey,
      repository: payload.target.repository,
      featureBranch: payload.target.featureBranch,
      status: finalStatus,
      dispatchMode,
      effectiveRiskLevel: policy.effectiveRiskLevel,
      requiresBossApproval: policy.requiresBossApproval,
      superAdminId: SUPERADMIN_TELEGRAM_ID,
      requiredGuards: policy.requiredGuards,
      warnings: policy.warnings,
      authMode: authActor.mode,
      receivedAt,
    };

    idempotencyStore.set(idempotencyKey, receipt);
    return sendJson(res, 202, receipt);
  };
}

export default createDevAgentDispatchHandler();
