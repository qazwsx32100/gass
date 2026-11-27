/**
 * api/dev-agent-approval.js
 * 盛隆瓦斯 — 第三階段：自動化閉環審核、老闆 Telegram (8862712587) L3 簽核與 Preview/Prod 煙霧驗證端點
 *
 * 路由：
 *  - GET  /api/dev-agent-approval : 查詢審核端點就緒狀態（零密鑰外洩）
 *  - POST /api/dev-agent-approval : 支援 4 種閉環動作：
 *      1. notify_pr_ready : PR 與 Preview 就緒後，記錄審計並推播 L3 簽核卡至老闆 Telegram
 *      2. approve         : 嚴格驗證 approverId === '8862712587'，寫入稽核並（受開關控制）執行 GitHub PR Squash Merge
 *      3. reject          : 嚴格驗證 approverId === '8862712587'，標記 REJECTED 並寫入稽核
 *      4. smoke_verify    : 驗證 Vercel Preview/Prod（白名單防 SSRF），連敗達門檻自動觸發 ROLLED_BACK 熔斷告警
 */

import crypto from 'node:crypto';
import { getBearerToken, verifyToken, getClientIp, sendJson } from './_auth.js';
import { fetchWithTimeout } from './_fetch.js';
import { createBoundedRateLimiter } from './_rateLimit.js';
import {
  SUPERADMIN_TELEGRAM_ID,
  ALLOWED_REPOSITORIES,
  TASK_STATES,
  verifyDevAgentSignature,
} from './_dev-agent-protocol.js';
import {
  isAllowedSmokeTargetUrl,
  createDevAgentAuditStore,
  sendBossApprovalCard,
  sendRollbackCircuitAlert,
} from './_dev-agent-audit.js';

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
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === target) {
      return Array.isArray(v) ? String(v[0] || '') : String(v || '');
    }
  }
  return '';
}

export function createDevAgentApprovalHandler({
  env = process.env,
  fetchFn = fetchWithTimeout,
  verifySessionToken = verifyToken,
  now = () => Date.now(),
  rateLimiter = createBoundedRateLimiter({ windowMs: 10 * 60 * 1000, maxEntries: 1000, now }),
  auditStore = null,
} = {}) {
  const store = auditStore || createDevAgentAuditStore({ env, fetchFn, now });

  return async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', env.CORS_ORIGIN || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Agent-Timestamp, X-Agent-Signature-256'
    );
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    const autoMergeEnabled = String(env.DEV_AGENT_AUTO_MERGE_ENABLED || '').toLowerCase() === 'true';

    // ── GET: 安全狀態查詢 ──────────────────────────────────────────────────────
    if (req.method === 'GET') {
      return sendJson(res, 200, {
        ok: true,
        service: 'shenglong-multi-agent-approval-closed-loop',
        superAdminId: SUPERADMIN_TELEGRAM_ID,
        supportedActions: ['notify_pr_ready', 'approve', 'reject', 'smoke_verify'],
        auditStorageConfigured: store.isConfigured(),
        auditCircuitOpen: store.isCircuitOpen(),
        telegramConfigured: Boolean(env.TELEGRAM_BOT_TOKEN),
        autoMergeEnabled,
      });
    }

    if (req.method !== 'POST') {
      return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
    }

    // ── 1. 速率限制 ───────────────────────────────────────────────────────────
    const clientIp = getClientIp(req);
    if (rateLimiter.check([{ key: `dev-approval:ip:${clientIp}`, max: 20 }])) {
      return sendJson(res, 429, {
        ok: false,
        code: 'RATE_LIMITED',
        error: '請求過於頻繁，請稍後再試（每 10 分鐘上限 20 次）',
      });
    }

    // ── 2. 解析 JSON 本文 ──────────────────────────────────────────────────────
    const rawBody =
      typeof req.rawBody === 'string'
        ? req.rawBody
        : typeof req.body === 'string'
          ? req.body
          : JSON.stringify(req.body ?? {});

    let body = {};
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    } catch {
      return sendJson(res, 400, { ok: false, code: 'INVALID_JSON', error: '無效的 JSON 請求' });
    }

    // ── 3. 身分鑑權（Bearer+HMAC 或 Admin Session）──────────────────────────────
    const bearer = getBearerToken(req);
    const bridgeToken = env.DEV_AGENT_BRIDGE_TOKEN || '';
    const webhookSecret = env.DEV_AGENT_WEBHOOK_SECRET || '';
    let authActor = null;

    if (bridgeToken && constantTimeStringEqual(bearer, bridgeToken)) {
      const sigResult = verifyDevAgentSignature({
        secret: webhookSecret,
        timestamp: getHeader(req, 'x-agent-timestamp'),
        signature: getHeader(req, 'x-agent-signature-256'),
        rawBody,
        nowSec: Math.floor(now() / 1000),
      });
      if (!sigResult.valid) {
        return sendJson(res, 401, {
          ok: false,
          code: sigResult.reason,
          error: 'HMAC 簽章驗證失敗或逾時',
        });
      }
      authActor = { mode: 'webhook_bridge', id: 'github_actions_or_hub' };
    } else if (bearer) {
      const session = verifySessionToken(bearer);
      if (session && (session.id === 'ADMIN' || session.role === 'admin')) {
        authActor = { mode: 'admin_session', id: String(session.id) };
      }
    }

    if (!authActor) {
      return sendJson(res, 401, {
        ok: false,
        code: 'UNAUTHORIZED',
        error: '未授權：僅限受信任自動化管線或管理員操作',
      });
    }

    const action = String(body.action || '').trim();
    const taskId = String(body.taskId || '').trim();
    const repository = String(body.repository || 'qazwsx32100/gass').trim();

    if (!taskId) {
      return sendJson(res, 400, { ok: false, code: 'MISSING_TASK_ID', error: '缺少 taskId' });
    }
    if (!ALLOWED_REPOSITORIES.includes(repository)) {
      return sendJson(res, 400, { ok: false, code: 'INVALID_REPOSITORY', error: `不允許的倉庫：${repository}` });
    }

    // ── Action A: notify_pr_ready（PR + Preview 就緒，推播老闆簽核卡）──────────
    if (action === 'notify_pr_ready') {
      const previewUrl = String(body.previewUrl || '').trim();
      if (previewUrl && !isAllowedSmokeTargetUrl(previewUrl)) {
        return sendJson(res, 400, {
          ok: false,
          code: 'INVALID_PREVIEW_URL',
          error: 'previewUrl 僅限 HTTPS 之 *.vercel.app 網域',
        });
      }

      const prNumber = Number.isInteger(body.prNumber) ? body.prNumber : Number(body.prNumber || 0) || null;
      const prUrl = String(body.prUrl || '').trim();
      const effectiveRiskLevel = ['L1', 'L2', 'L3'].includes(body.effectiveRiskLevel) ? body.effectiveRiskLevel : 'L3';
      const featureBranch = String(body.featureBranch || `ai-agent/${taskId.toLowerCase()}`).trim();
      const objectiveTitle = String(body.objectiveTitle || `多代理任務 ${taskId}`).trim();

      const saved = await store.upsertTask({
        task_id: taskId,
        idempotency_key: String(body.idempotencyKey || `pr:${taskId}`),
        target_repo: repository,
        feature_branch: featureBranch,
        risk_level: effectiveRiskLevel,
        status: TASK_STATES.AWAITING_APPROVAL,
        objective_title: objectiveTitle,
        pr_number: prNumber,
        pr_url: prUrl || null,
        preview_url: previewUrl || null,
        payload: body.payload || {},
      });

      await store.recordAuditLog({
        taskId,
        eventType: 'PR_READY_NOTIFIED',
        actorId: authActor.id,
        detail: { repository, prNumber, prUrl, previewUrl, effectiveRiskLevel },
      });

      const tg = await sendBossApprovalCard(
        {
          taskId,
          repository,
          featureBranch,
          effectiveRiskLevel,
          objectiveTitle,
          prNumber,
          prUrl,
          previewUrl,
          testSummary: String(body.testSummary || 'CI Gate 全數通過'),
          requiredGuards: Array.isArray(body.requiredGuards) ? body.requiredGuards : [],
        },
        { env, fetchFn }
      );

      return sendJson(res, 200, {
        ok: true,
        action,
        taskId,
        status: TASK_STATES.AWAITING_APPROVAL,
        auditSource: saved.source,
        telegramNotified: tg.sent,
        telegramReason: tg.sent ? null : tg.reason,
        approvalCardPreview: tg.card,
      });
    }

    // ── Action B / C: approve / reject（嚴格鎖定老闆 SuperAdmin 8862712587）───
    if (action === 'approve' || action === 'reject') {
      const approverId = String(body.approverId || '').trim();
      if (approverId !== SUPERADMIN_TELEGRAM_ID) {
        await store.recordAuditLog({
          taskId,
          eventType: 'UNAUTHORIZED_APPROVAL_ATTEMPT',
          actorId: approverId || authActor.id,
          detail: { action, repository },
        });
        return sendJson(res, 403, {
          ok: false,
          code: 'SUPERADMIN_ONLY',
          error: `權限不足：僅限老闆唯一 SuperAdmin (${SUPERADMIN_TELEGRAM_ID}) 執行核准或駁回`,
        });
      }

      if (action === 'reject') {
        const reason = String(body.reason || '老闆人工駁回').trim();
        const transition = await store.transitionTask(taskId, TASK_STATES.REJECTED, {
          target_repo: repository,
          approved_by: approverId,
        });
        if (!transition.ok) {
          return sendJson(res, 409, transition);
        }
        await store.recordAuditLog({
          taskId,
          eventType: 'BOSS_REJECTED',
          actorId: approverId,
          detail: { repository, reason },
        });
        return sendJson(res, 200, {
          ok: true,
          action: 'reject',
          taskId,
          status: TASK_STATES.REJECTED,
          approvedBy: approverId,
          reason,
          auditSource: transition.source,
        });
      }

      // action === 'approve'
      const prNumber = Number.isInteger(body.prNumber) ? body.prNumber : Number(body.prNumber || 0) || null;
      let mergeResult = { merged: false, mode: 'approval_recorded_only' };

      if (autoMergeEnabled && prNumber && env.GITHUB_ACTIONS_PAT) {
        const mergeUrl = `https://api.github.com/repos/${repository}/pulls/${prNumber}/merge`;
        let ghRes;
        try {
          ghRes = await fetchFn(
            mergeUrl,
            {
              method: 'PUT',
              headers: {
                Accept: 'application/vnd.github+json',
                Authorization: `Bearer ${env.GITHUB_ACTIONS_PAT}`,
                'X-GitHub-Api-Version': '2022-11-28',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                commit_title: `[Boss Approved #${prNumber}] ${taskId}`,
                merge_method: 'squash',
              }),
            },
            15000
          );
        } catch (err) {
          return sendJson(res, 502, {
            ok: false,
            code: 'GITHUB_MERGE_NETWORK_ERROR',
            error: `GitHub Merge 連線失敗：${err.message}`,
          });
        }

        if (ghRes.status < 200 || ghRes.status >= 300) {
          const detail = typeof ghRes.text === 'function' ? await ghRes.text().catch(() => '') : '';
          return sendJson(res, ghRes.status >= 500 ? 502 : 409, {
            ok: false,
            code: 'GITHUB_MERGE_FAILED',
            error: `GitHub PR #${prNumber} 合併失敗（HTTP ${ghRes.status}）`,
            detail: detail.slice(0, 300),
          });
        }
        const mergeJson = typeof ghRes.json === 'function' ? await ghRes.json().catch(() => ({})) : {};
        mergeResult = { merged: true, mode: 'github_squash_merge', sha: mergeJson.sha || null };
      }

      const transition = await store.transitionTask(taskId, TASK_STATES.MERGED, {
        target_repo: repository,
        pr_number: prNumber,
        approved_by: approverId,
      });
      if (!transition.ok) {
        return sendJson(res, 409, transition);
      }

      await store.recordAuditLog({
        taskId,
        eventType: 'BOSS_APPROVED',
        actorId: approverId,
        detail: { repository, prNumber, mergeResult },
      });

      return sendJson(res, 200, {
        ok: true,
        action: 'approve',
        taskId,
        status: TASK_STATES.MERGED,
        approvedBy: approverId,
        mergeResult,
        auditSource: transition.source,
      });
    }

    // ── Action D: smoke_verify（Preview/Prod 煙霧驗證 + 連敗自動熔斷告警）───────
    if (action === 'smoke_verify') {
      const targetUrl = String(body.targetUrl || '').trim().replace(/\/$/, '');
      if (!isAllowedSmokeTargetUrl(targetUrl)) {
        return sendJson(res, 400, {
          ok: false,
          code: 'SSRF_BLOCKED_URL',
          error: 'targetUrl 必須為合法 HTTPS *.vercel.app 網域（已阻斷非白名單位址）',
        });
      }

      const endpoints =
        Array.isArray(body.endpoints) && body.endpoints.length > 0
          ? body.endpoints.slice(0, 5).map((p) => (String(p).startsWith('/') ? String(p) : `/${p}`))
          : ['/api/dev-agent-dispatch', '/api/dev-agent-hub'];

      const checks = [];
      let allPassed = true;
      for (const ep of endpoints) {
        try {
          const r = await fetchFn(`${targetUrl}${ep}`, { method: 'GET' }, 8000);
          const ok = r.status >= 200 && r.status < 300;
          if (!ok) allPassed = false;
          checks.push({ endpoint: ep, status: r.status, ok });
        } catch (err) {
          allPassed = false;
          checks.push({ endpoint: ep, status: 0, ok: false, error: err.message });
        }
      }

      const consecutiveFailures = allPassed ? 0 : Math.max(1, Number(body.consecutiveFailures || 1));

      if (allPassed) {
        const transition = await store.transitionTask(taskId, TASK_STATES.DEPLOYED, {
          target_repo: repository,
          preview_url: targetUrl,
        });
        await store.recordAuditLog({
          taskId,
          eventType: 'SMOKE_VERIFY_PASSED',
          actorId: authActor.id,
          detail: { targetUrl, checks },
        });
        return sendJson(res, 200, {
          ok: true,
          action: 'smoke_verify',
          taskId,
          status: transition.ok ? TASK_STATES.DEPLOYED : 'SMOKE_PASSED',
          checks,
          rollbackTriggered: false,
        });
      }

      // 失敗處理：連續 2 次失敗觸發自動熔斷告警
      let alertResult = null;
      const shouldTripRollback = consecutiveFailures >= 2;
      if (shouldTripRollback) {
        await store.transitionTask(taskId, TASK_STATES.ROLLED_BACK, {
          target_repo: repository,
          preview_url: targetUrl,
        });
        alertResult = await sendRollbackCircuitAlert(
          {
            taskId,
            repository,
            targetUrl,
            reason: checks
              .filter((c) => !c.ok)
              .map((c) => `${c.endpoint} -> ${c.status || c.error}`)
              .join('; '),
            consecutiveFailures,
          },
          { env, fetchFn }
        );
      }

      await store.recordAuditLog({
        taskId,
        eventType: shouldTripRollback ? 'SMOKE_VERIFY_CIRCUIT_TRIPPED' : 'SMOKE_VERIFY_FAILED',
        actorId: authActor.id,
        detail: { targetUrl, checks, consecutiveFailures },
      });

      return sendJson(res, 502, {
        ok: false,
        code: shouldTripRollback ? 'SMOKE_CIRCUIT_BREAKER_TRIPPED' : 'SMOKE_VERIFY_FAILED',
        taskId,
        status: shouldTripRollback ? TASK_STATES.ROLLED_BACK : 'SMOKE_FAILED',
        checks,
        rollbackTriggered: shouldTripRollback,
        telegramAlertSent: Boolean(alertResult?.sent),
      });
    }

    return sendJson(res, 400, {
      ok: false,
      code: 'UNKNOWN_ACTION',
      error: `不支援的 action：${action}`,
      supportedActions: ['notify_pr_ready', 'approve', 'reject', 'smoke_verify'],
    });
  };
}

export default createDevAgentApprovalHandler();
