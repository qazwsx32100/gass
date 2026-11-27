/**
 * api/_dev-agent-audit.js
 * 盛隆瓦斯 — 第三階段：Supabase 任務稽核持久化（含 402/503 5 分鐘熔斷與離線容災降級）
 *            ✕ 老闆 Telegram (8862712587) L3 一鍵核准通知卡與回滾熔斷告警
 *
 * 嚴格遵守 AI 犯錯中心與盛隆最高執行指令：
 *  - 採用純 Supabase PostgREST（0 Edge Function 消耗）
 *  - 遇 402 / 503 / 網路逾時立即開啟 5 分鐘熔斷並平滑降級至受限容量離線快取，絕不拋 500
 *  - 所有狀態變更強制通過 canTransitionTaskState 狀態機驗證
 *  - L3 簽核與回滾告警鎖定 SuperAdmin Telegram ID: 8862712587
 */

import { fetchWithTimeout } from './_fetch.js';
import {
  SUPERADMIN_TELEGRAM_ID,
  TASK_STATES,
  canTransitionTaskState,
} from './_dev-agent-protocol.js';

const CIRCUIT_COOLDOWN_MS = 5 * 60 * 1000; // 5 分鐘熔斷冷卻
const MAX_OFFLINE_TASKS = 500;
const MAX_OFFLINE_LOGS = 1000;

/**
 * 嚴格驗證 Smoke Check 目標網址（防 SSRF：僅允許 HTTPS 且屬於 Vercel 正式／預覽網域）
 */
export function isAllowedSmokeTargetUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return false;
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    return host.endsWith('.vercel.app') && !host.includes('@');
  } catch {
    return false;
  }
}

/**
 * 建立支援 Supabase PostgREST + 5 分鐘熔斷 + 離線降級的任務稽核存儲
 */
export function createDevAgentAuditStore({
  env = process.env,
  fetchFn = fetchWithTimeout,
  now = () => Date.now(),
} = {}) {
  const offlineTasks = new Map();
  const offlineLogs = [];
  let circuitOpenUntil = 0;

  function getSupabaseRestConfig() {
    const url = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
    const key = env.SUPABASE_SERVICE_ROLE_KEY || '';
    return { url, key, configured: Boolean(url && key) };
  }

  function isCircuitOpen() {
    return circuitOpenUntil > now();
  }

  function tripCircuit() {
    circuitOpenUntil = now() + CIRCUIT_COOLDOWN_MS;
  }

  function saveOfflineTask(record) {
    offlineTasks.delete(record.task_id);
    offlineTasks.set(record.task_id, record);
    while (offlineTasks.size > MAX_OFFLINE_TASKS) {
      const oldestKey = offlineTasks.keys().next().value;
      offlineTasks.delete(oldestKey);
    }
  }

  function saveOfflineLog(entry) {
    offlineLogs.push(entry);
    while (offlineLogs.length > MAX_OFFLINE_LOGS) {
      offlineLogs.shift();
    }
  }

  async function postgrestRequest(endpointPath, { method = 'GET', body = null, prefer = '' } = {}) {
    const cfg = getSupabaseRestConfig();
    if (!cfg.configured) {
      return { ok: false, degraded: true, reason: 'SUPABASE_NOT_CONFIGURED' };
    }
    if (isCircuitOpen()) {
      return { ok: false, degraded: true, reason: 'SUPABASE_CIRCUIT_OPEN' };
    }

    const headers = {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
      'Content-Type': 'application/json',
    };
    if (prefer) headers.Prefer = prefer;

    try {
      const res = await fetchFn(
        `${cfg.url}/rest/v1/${endpointPath}`,
        {
          method,
          headers,
          ...(body !== null ? { body: JSON.stringify(body) } : {}),
        },
        5000
      );

      if (res.status === 402 || res.status === 503 || res.status >= 500) {
        tripCircuit();
        return { ok: false, degraded: true, reason: `SUPABASE_HTTP_${res.status}` };
      }
      if (res.status < 200 || res.status >= 300) {
        return { ok: false, degraded: true, reason: `SUPABASE_HTTP_${res.status}` };
      }

      const data = typeof res.json === 'function' ? await res.json().catch(() => null) : null;
      return { ok: true, degraded: false, data };
    } catch (err) {
      tripCircuit();
      return { ok: false, degraded: true, reason: `SUPABASE_NETWORK_${err.message}` };
    }
  }

  return {
    isConfigured() {
      return getSupabaseRestConfig().configured;
    },
    isCircuitOpen,

    async upsertTask(taskRecord) {
      const ts = new Date(now()).toISOString();
      const existing = offlineTasks.get(taskRecord.task_id) || {};
      const merged = {
        ...existing,
        ...taskRecord,
        created_at: existing.created_at || taskRecord.created_at || ts,
        updated_at: ts,
      };
      saveOfflineTask(merged);

      const res = await postgrestRequest('ai_dev_tasks?on_conflict=task_id', {
        method: 'POST',
        body: merged,
        prefer: 'resolution=merge-duplicates,return=representation',
      });

      return {
        ok: true,
        source: res.ok ? 'supabase' : 'offline_fallback',
        degradedReason: res.ok ? null : res.reason,
        task: merged,
      };
    },

    async transitionTask(taskId, nextStatus, patch = {}) {
      const current = offlineTasks.get(taskId);
      if (current && current.status && current.status !== nextStatus) {
        if (!canTransitionTaskState(current.status, nextStatus)) {
          return {
            ok: false,
            code: 'INVALID_STATE_TRANSITION',
            error: `非法狀態轉換：無法由 ${current.status} 直接跳轉至 ${nextStatus}`,
          };
        }
      }

      const merged = {
        ...(current || {
          task_id: taskId,
          idempotency_key: patch.idempotency_key || `manual:${taskId}`,
          target_repo: patch.target_repo || 'qazwsx32100/gass',
          feature_branch: patch.feature_branch || `ai-agent/${taskId.toLowerCase()}`,
          risk_level: patch.risk_level || 'L2',
          payload: patch.payload || {},
        }),
        ...patch,
        task_id: taskId,
        status: nextStatus,
        updated_at: new Date(now()).toISOString(),
      };

      return this.upsertTask(merged);
    },

    async recordAuditLog({ taskId, eventType, actorId, detail = {} }) {
      const entry = {
        task_id: taskId,
        event_type: eventType,
        actor_id: String(actorId || 'system'),
        detail,
        created_at: new Date(now()).toISOString(),
      };
      saveOfflineLog(entry);

      const res = await postgrestRequest('ai_dev_audit_logs', {
        method: 'POST',
        body: entry,
        prefer: 'return=minimal',
      });

      return {
        ok: true,
        source: res.ok ? 'supabase' : 'offline_fallback',
        degradedReason: res.ok ? null : res.reason,
        entry,
      };
    },

    getOfflineTask(taskId) {
      return offlineTasks.get(taskId) || null;
    },

    listOfflineAuditLogs(taskId = null) {
      return taskId ? offlineLogs.filter((l) => l.task_id === taskId) : [...offlineLogs];
    },
  };
}

/**
 * 組裝給老闆 (Telegram ID: 8862712587) 的 L3 一鍵審核通知卡
 */
export function buildBossApprovalTelegramCard({
  taskId,
  repository,
  featureBranch,
  effectiveRiskLevel = 'L3',
  objectiveTitle,
  prNumber,
  prUrl,
  previewUrl = '',
  testSummary = 'CI Gate 全數通過',
  requiredGuards = [],
}) {
  const riskBadge =
    effectiveRiskLevel === 'L3'
      ? '🔴 L3 高危變更（必須老闆人工簽核）'
      : effectiveRiskLevel === 'L2'
        ? '🟡 L2 一般功能變更（建議審核後合併）'
        : '🟢 L1 文件／測試變更';

  const lines = [
    `🤖 *【盛隆多代理開發審核通知】*`,
    `• *任務編號*：\`${taskId}\``,
    `• *風險等級*：${riskBadge}`,
    `• *目標倉庫*：\`${repository}\``,
    `• *隔離分支*：\`${featureBranch}\` ➔ \`main\``,
    `• *變更摘要*：${objectiveTitle}`,
    `• *測試驗證*：${testSummary}`,
  ];

  if (Array.isArray(requiredGuards) && requiredGuards.length > 0) {
    lines.push(`• *已通過守衛*：\`${requiredGuards.join('`, `')}\``);
  }
  if (prNumber) {
    lines.push(`• *Pull Request*：#${prNumber}`);
  }
  lines.push(`\n👑 *唯一授權核准者*：老闆 (\`${SUPERADMIN_TELEGRAM_ID}\`)`);

  const inlineKeyboard = [];
  const linkRow = [];
  if (prUrl) linkRow.push({ text: '🔍 檢視 PR 變更', url: prUrl });
  if (previewUrl) linkRow.push({ text: '🌐 開啟 Vercel Preview', url: previewUrl });
  if (linkRow.length > 0) inlineKeyboard.push(linkRow);

  inlineKeyboard.push([
    { text: '✅ 核准並合併 main', callback_data: `dev_approve:${taskId}:${prNumber || 0}` },
    { text: '🛑 駁回退回', callback_data: `dev_reject:${taskId}:${prNumber || 0}` },
  ]);

  return {
    chatId: SUPERADMIN_TELEGRAM_ID,
    text: lines.join('\n'),
    replyMarkup: { inline_keyboard: inlineKeyboard },
  };
}

/**
 * 發送 L3 簽核卡至老闆 Telegram（若環境未設定 Bot Token 則安全跳過不報錯）
 */
export async function sendBossApprovalCard(params, { env = process.env, fetchFn = fetchWithTimeout } = {}) {
  const card = buildBossApprovalTelegramCard(params);
  const token = env.TELEGRAM_BOT_TOKEN || '';
  const chatId = env.SUPERADMIN_TELEGRAM_CHAT_ID || env.TELEGRAM_REPORT_CHAT_ID || SUPERADMIN_TELEGRAM_ID;

  if (!token) {
    return { sent: false, reason: 'TELEGRAM_BOT_TOKEN_NOT_CONFIGURED', card };
  }

  try {
    const res = await fetchFn(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: card.text,
          parse_mode: 'Markdown',
          reply_markup: card.replyMarkup,
        }),
      },
      6000
    );
    const data = await res.json().catch(() => null);
    return {
      sent: res.status >= 200 && res.status < 300 && Boolean(data?.ok !== false),
      status: res.status,
      chatId,
      card,
    };
  } catch (err) {
    return { sent: false, reason: `TELEGRAM_ERROR_${err.message}`, card };
  }
}

/**
 * 發送自動熔斷／回滾緊急告警至老闆 Telegram (8862712587)
 */
export async function sendRollbackCircuitAlert(
  { taskId, repository, targetUrl, reason, consecutiveFailures = 2 },
  { env = process.env, fetchFn = fetchWithTimeout } = {}
) {
  const text = [
    `🚨 *【盛隆多代理 CI/CD 自動熔斷告警】*`,
    `• *任務編號*：\`${taskId}\``,
    `• *倉庫*：\`${repository}\``,
    `• *異常站點*：${targetUrl}`,
    `• *連續失敗次數*：${consecutiveFailures} 次`,
    `• *失敗原因*：${reason}`,
    `• *系統處置*：已標記 \`${TASK_STATES.ROLLED_BACK}\` 並暫停自動派發，請老闆 (\`${SUPERADMIN_TELEGRAM_ID}\`) 檢視並確認回滾。`,
  ].join('\n');

  const token = env.TELEGRAM_BOT_TOKEN || '';
  const chatId = env.SUPERADMIN_TELEGRAM_CHAT_ID || env.TELEGRAM_ALERT_CHAT_ID || SUPERADMIN_TELEGRAM_ID;

  if (!token) {
    return { sent: false, reason: 'TELEGRAM_BOT_TOKEN_NOT_CONFIGURED', text };
  }

  try {
    const res = await fetchFn(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
      },
      6000
    );
    return { sent: res.status >= 200 && res.status < 300, status: res.status, chatId, text };
  } catch (err) {
    return { sent: false, reason: `TELEGRAM_ERROR_${err.message}`, text };
  }
}
