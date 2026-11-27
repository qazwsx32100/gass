/**
 * api/_dev-agent-protocol.js
 * 盛隆瓦斯 — 多代理 AI 協同開發標準協議 v1.0.0（驗證器、HMAC 驗簽、Policy Gate 與冪等佇列）
 *
 * 核心防線（對齊盛隆七大最高執行指令與 AI 犯錯中心）：
 * 1. 全系統連動影響預判：強制要求 impactAnalysis（受波及系統清單與緩解措施）。
 * 2. 測試優先與零回歸：強制 mustOpenPullRequest=true、allowDirectMainPush=false 與必跑測試指令。
 * 3. 舊 ERP 黑盒子鐵律：嚴禁 touchesLegacyErp=true 或任何舊表 DDL 語意。
 * 4. 司機端零通知鐵律：嚴禁輪詢 GPS，觸及司機/定位路徑強制升格 L3 並附加 guard:zero-notify。
 * 5. AI 犯錯中心防爆線：強制 minPollingIntervalSeconds >= 60、迭代與費用硬上限、明碼憑證掃描攔截。
 */

import crypto from 'node:crypto';

export const SCHEMA_VERSION = '1.0.0';
export const SUPERADMIN_TELEGRAM_ID = '8862712587';

export const ALLOWED_REPOSITORIES = Object.freeze([
  'qazwsx32100/gass',
  'qazwsx32100/shenglong-next',
  'qazwsx32100/shenglong-line-liff',
]);

export const ALLOWED_INITIATOR_SOURCES = Object.freeze([
  'multi_agent_hub',
  'eight_ai_departments',
  'boss_console',
  'github_issue',
]);

export const ALLOWED_RISK_LEVELS = Object.freeze(['L1', 'L2', 'L3']);

export const ALLOWED_PLAN_ACTIONS = Object.freeze([
  'inspect',
  'add_test',
  'edit_code',
  'update_docs',
  'verify',
  'open_pr',
]);

export const ALLOWED_CONSENSUS_STATUSES = Object.freeze([
  'approved',
  'escalate_to_boss',
  'rejected',
]);

export const TASK_STATES = Object.freeze({
  QUEUED: 'QUEUED',
  DISPATCHED: 'DISPATCHED',
  RUNNING: 'RUNNING',
  PR_OPENED: 'PR_OPENED',
  CI_PASSED: 'CI_PASSED',
  CI_FAILED: 'CI_FAILED',
  AWAITING_APPROVAL: 'AWAITING_APPROVAL',
  MERGED: 'MERGED',
  DEPLOYED: 'DEPLOYED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
  FAILED_SAFE: 'FAILED_SAFE',
  ROLLED_BACK: 'ROLLED_BACK',
});

export const ALLOWED_STATE_TRANSITIONS = Object.freeze({
  QUEUED: ['DISPATCHED', 'CANCELLED'],
  DISPATCHED: ['RUNNING', 'FAILED_SAFE'],
  RUNNING: ['PR_OPENED', 'FAILED_SAFE'],
  PR_OPENED: ['CI_PASSED', 'CI_FAILED', 'FAILED_SAFE'],
  CI_FAILED: ['RUNNING', 'FAILED_SAFE', 'CANCELLED'],
  CI_PASSED: ['AWAITING_APPROVAL', 'MERGED'],
  AWAITING_APPROVAL: ['MERGED', 'REJECTED'],
  MERGED: ['DEPLOYED', 'ROLLED_BACK'],
  DEPLOYED: [],
  REJECTED: [],
  CANCELLED: [],
  FAILED_SAFE: ['QUEUED'],
  ROLLED_BACK: ['QUEUED'],
});

const TASK_ID_REGEX = /^TASK-[0-9]{8}-[0-9A-Za-z_-]{3,24}$/;
const FEATURE_BRANCH_REGEX = /^ai-agent\/[a-z0-9][a-z0-9._/-]{2,64}$/;

const LEGACY_ERP_TABLE_NAMES = Object.freeze([
  'gas_oders',
  'customers',
  'money',
  'berrel_logs',
  'stove_oders',
]);

const FORBIDDEN_DDL_KEYWORDS = Object.freeze([
  'alter table',
  'drop table',
  'truncate table',
  'create trigger',
  'alter procedure',
]);

const HIGH_RISK_L3_PATH_PATTERNS = [
  /^android\//i,
  /driver/i,
  /pricing|gas-cost|gas-pricing/i,
  /auth|security|token/i,
  /supabase\/migrations/i,
  /\.github\/workflows/i,
];

const SECRET_LEAK_PATTERNS = [
  { code: 'GITHUB_PAT', pattern: /\b(?:ghp|gho|ghu|ghs)_[A-Za-z0-9]{20,}\b/ },
  { code: 'GITHUB_FINE_PAT', pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/ },
  { code: 'GOOGLE_API_KEY', pattern: /\bAIza[0-9A-Za-z_-]{20,}\b/ },
  { code: 'OPENAI_KEY', pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/ },
  { code: 'TELEGRAM_BOT_TOKEN', pattern: /\b[0-9]{8,12}:[A-Za-z0-9_-]{30,}\b/ },
];

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value, minLen = 1, maxLen = 2000) {
  return typeof value === 'string' && value.trim().length >= minLen && value.length <= maxLen;
}

function isValidIsoTimestamp(value) {
  if (typeof value !== 'string' || value.trim().length < 10) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed);
}

export function canTransitionTaskState(fromState, toState) {
  const allowed = ALLOWED_STATE_TRANSITIONS[fromState];
  return Array.isArray(allowed) && allowed.includes(toState);
}

/**
 * 計算標準 HMAC-SHA256 請求簽章
 */
export function signDevAgentRequest({ secret, timestamp, rawBody }) {
  if (!secret || typeof secret !== 'string') {
    throw new Error('HMAC secret is required');
  }
  const ts = String(timestamp);
  const bodyStr = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody ?? {});
  const digest = crypto
    .createHmac('sha256', secret)
    .update(`${ts}.${bodyStr}`, 'utf8')
    .digest('hex');
  return `sha256=${digest}`;
}

/**
 * 驗證 Webhook 請求的 HMAC-SHA256 簽章與防重放時間窗（預設 ±300 秒）
 */
export function verifyDevAgentSignature({
  secret,
  timestamp,
  signature,
  rawBody,
  nowSec = Math.floor(Date.now() / 1000),
  maxSkewSec = 300,
}) {
  if (!secret || typeof secret !== 'string') {
    return { valid: false, reason: 'SIGNATURE_SECRET_NOT_CONFIGURED' };
  }
  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum) || tsNum <= 0) {
    return { valid: false, reason: 'INVALID_TIMESTAMP' };
  }
  if (Math.abs(nowSec - tsNum) > maxSkewSec) {
    return { valid: false, reason: 'TIMESTAMP_EXPIRED_OR_REPLAY' };
  }
  if (typeof signature !== 'string' || !signature.startsWith('sha256=')) {
    return { valid: false, reason: 'MISSING_OR_MALFORMED_SIGNATURE' };
  }

  const expected = signDevAgentRequest({ secret, timestamp: tsNum, rawBody });
  const a = Buffer.from(signature, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) {
    return { valid: false, reason: 'SIGNATURE_MISMATCH' };
  }
  const match = crypto.timingSafeEqual(a, b);
  return match ? { valid: true, reason: 'OK' } : { valid: false, reason: 'SIGNATURE_MISMATCH' };
}

/**
 * 嚴格驗證多代理任務 JSON 結構（對應 schemas/multi-agent-task.v1.schema.json）
 */
export function validateMultiAgentTaskPayload(payload) {
  const errors = [];
  if (!isPlainObject(payload)) {
    return { valid: false, errors: ['Payload must be a JSON object'] };
  }

  if (payload.schemaVersion !== SCHEMA_VERSION) {
    errors.push(`schemaVersion must be "${SCHEMA_VERSION}"`);
  }
  if (typeof payload.taskId !== 'string' || !TASK_ID_REGEX.test(payload.taskId)) {
    errors.push('taskId must match TASK-YYYYMMDD-<id>');
  }
  if (!isNonEmptyString(payload.idempotencyKey, 12, 128)) {
    errors.push('idempotencyKey must be a string of length 12..128');
  }
  if (!isValidIsoTimestamp(payload.createdAt)) {
    errors.push('createdAt must be a valid ISO-8601 date-time string');
  }
  if (payload.dryRun !== undefined && typeof payload.dryRun !== 'boolean') {
    errors.push('dryRun must be a boolean when provided');
  }

  // initiator
  if (!isPlainObject(payload.initiator)) {
    errors.push('initiator object is required');
  } else {
    if (!ALLOWED_INITIATOR_SOURCES.includes(payload.initiator.source)) {
      errors.push(`initiator.source must be one of: ${ALLOWED_INITIATOR_SOURCES.join(', ')}`);
    }
    if (!isNonEmptyString(payload.initiator.requestedBy, 2, 64)) {
      errors.push('initiator.requestedBy is required');
    }
    if (
      !Array.isArray(payload.initiator.participatingModels) ||
      payload.initiator.participatingModels.length < 1 ||
      payload.initiator.participatingModels.length > 8 ||
      payload.initiator.participatingModels.some((m) => !isNonEmptyString(m, 2, 64))
    ) {
      errors.push('initiator.participatingModels must be an array of 1..8 model identifiers');
    }
  }

  if (!ALLOWED_RISK_LEVELS.includes(payload.riskLevel)) {
    errors.push('riskLevel must be L1, L2, or L3');
  }
  if (typeof payload.requiresBossApproval !== 'boolean') {
    errors.push('requiresBossApproval must be a boolean');
  }

  // target
  if (!isPlainObject(payload.target)) {
    errors.push('target object is required');
  } else {
    if (!isNonEmptyString(payload.target.repository, 3, 120)) {
      errors.push('target.repository is required');
    }
    if (!isNonEmptyString(payload.target.baseBranch, 1, 64)) {
      errors.push('target.baseBranch is required');
    }
    if (!isNonEmptyString(payload.target.featureBranch, 1, 100)) {
      errors.push('target.featureBranch is required');
    }
    if (
      !Array.isArray(payload.target.allowedPaths) ||
      payload.target.allowedPaths.length < 1 ||
      payload.target.allowedPaths.length > 30 ||
      payload.target.allowedPaths.some((p) => !isNonEmptyString(p, 1, 160))
    ) {
      errors.push('target.allowedPaths must be a non-empty array of path prefixes');
    }
    if (
      payload.target.forbiddenPaths !== undefined &&
      (!Array.isArray(payload.target.forbiddenPaths) ||
        payload.target.forbiddenPaths.some((p) => !isNonEmptyString(p, 1, 160)))
    ) {
      errors.push('target.forbiddenPaths must be an array of strings when provided');
    }
  }

  // objective
  if (!isPlainObject(payload.objective)) {
    errors.push('objective object is required');
  } else {
    if (!isNonEmptyString(payload.objective.title, 4, 160)) {
      errors.push('objective.title must be 4..160 characters');
    }
    if (!isNonEmptyString(payload.objective.summary, 10, 2000)) {
      errors.push('objective.summary must be 10..2000 characters');
    }
    if (
      payload.objective.issueNumber !== undefined &&
      (!Number.isInteger(payload.objective.issueNumber) || payload.objective.issueNumber < 1)
    ) {
      errors.push('objective.issueNumber must be a positive integer');
    }
  }

  // impactAnalysis (Directive #1: Cross-System Ripple & Impact Analysis)
  if (!isPlainObject(payload.impactAnalysis)) {
    errors.push('impactAnalysis object is required (Directive #1)');
  } else {
    if (
      !Array.isArray(payload.impactAnalysis.affectedSystems) ||
      payload.impactAnalysis.affectedSystems.length < 1 ||
      payload.impactAnalysis.affectedSystems.some((s) => !isNonEmptyString(s, 2, 64))
    ) {
      errors.push('impactAnalysis.affectedSystems must contain at least 1 system identifier');
    }
    if (typeof payload.impactAnalysis.touchesLegacyErp !== 'boolean') {
      errors.push('impactAnalysis.touchesLegacyErp must be a boolean');
    }
    if (typeof payload.impactAnalysis.touchesDriverLocation !== 'boolean') {
      errors.push('impactAnalysis.touchesDriverLocation must be a boolean');
    }
    if (typeof payload.impactAnalysis.touchesPricingMaster !== 'boolean') {
      errors.push('impactAnalysis.touchesPricingMaster must be a boolean');
    }
    if (!isNonEmptyString(payload.impactAnalysis.mitigationNotes, 8, 1000)) {
      errors.push('impactAnalysis.mitigationNotes must be 8..1000 characters');
    }
  }

  // planSteps
  if (
    !Array.isArray(payload.planSteps) ||
    payload.planSteps.length < 1 ||
    payload.planSteps.length > 25
  ) {
    errors.push('planSteps must be an array of 1..25 steps');
  } else {
    payload.planSteps.forEach((item, idx) => {
      if (!isPlainObject(item)) {
        errors.push(`planSteps[${idx}] must be an object`);
        return;
      }
      if (!Number.isInteger(item.step) || item.step < 1) {
        errors.push(`planSteps[${idx}].step must be a positive integer`);
      }
      if (!ALLOWED_PLAN_ACTIONS.includes(item.action)) {
        errors.push(`planSteps[${idx}].action must be one of: ${ALLOWED_PLAN_ACTIONS.join(', ')}`);
      }
      if (!isNonEmptyString(item.description, 4, 500)) {
        errors.push(`planSteps[${idx}].description must be 4..500 characters`);
      }
    });
  }

  // acceptanceCriteria
  if (!isPlainObject(payload.acceptanceCriteria)) {
    errors.push('acceptanceCriteria object is required (Directive #2)');
  } else {
    if (
      !Array.isArray(payload.acceptanceCriteria.requiredCommands) ||
      payload.acceptanceCriteria.requiredCommands.length < 1 ||
      payload.acceptanceCriteria.requiredCommands.some((c) => !isNonEmptyString(c, 3, 120))
    ) {
      errors.push('acceptanceCriteria.requiredCommands must contain at least 1 test/verify command');
    }
    if (
      !Number.isInteger(payload.acceptanceCriteria.maxChangedFiles) ||
      payload.acceptanceCriteria.maxChangedFiles < 1 ||
      payload.acceptanceCriteria.maxChangedFiles > 50
    ) {
      errors.push('acceptanceCriteria.maxChangedFiles must be integer 1..50');
    }
    if (typeof payload.acceptanceCriteria.mustOpenPullRequest !== 'boolean') {
      errors.push('acceptanceCriteria.mustOpenPullRequest must be a boolean');
    }
    if (typeof payload.acceptanceCriteria.allowDirectMainPush !== 'boolean') {
      errors.push('acceptanceCriteria.allowDirectMainPush must be a boolean');
    }
  }

  // safetyConstraints
  if (!isPlainObject(payload.safetyConstraints)) {
    errors.push('safetyConstraints object is required');
  } else {
    if (typeof payload.safetyConstraints.noLegacyErpDdl !== 'boolean') {
      errors.push('safetyConstraints.noLegacyErpDdl must be a boolean');
    }
    if (typeof payload.safetyConstraints.noDriverGpsPolling !== 'boolean') {
      errors.push('safetyConstraints.noDriverGpsPolling must be a boolean');
    }
    if (
      typeof payload.safetyConstraints.minPollingIntervalSeconds !== 'number' ||
      !Number.isFinite(payload.safetyConstraints.minPollingIntervalSeconds)
    ) {
      errors.push('safetyConstraints.minPollingIntervalSeconds must be a finite number');
    }
    if (typeof payload.safetyConstraints.noHardcodedSecrets !== 'boolean') {
      errors.push('safetyConstraints.noHardcodedSecrets must be a boolean');
    }
    if (
      !Number.isInteger(payload.safetyConstraints.maxAgentIterations) ||
      payload.safetyConstraints.maxAgentIterations < 1
    ) {
      errors.push('safetyConstraints.maxAgentIterations must be a positive integer');
    }
    if (
      typeof payload.safetyConstraints.maxTokenBudgetUsd !== 'number' ||
      !Number.isFinite(payload.safetyConstraints.maxTokenBudgetUsd) ||
      payload.safetyConstraints.maxTokenBudgetUsd <= 0
    ) {
      errors.push('safetyConstraints.maxTokenBudgetUsd must be a positive number');
    }
  }

  // consensus
  if (!isPlainObject(payload.consensus)) {
    errors.push('consensus object is required');
  } else {
    if (!ALLOWED_CONSENSUS_STATUSES.includes(payload.consensus.status)) {
      errors.push(`consensus.status must be one of: ${ALLOWED_CONSENSUS_STATUSES.join(', ')}`);
    }
    if (
      !Array.isArray(payload.consensus.dissentingNotes) ||
      payload.consensus.dissentingNotes.some((n) => typeof n !== 'string')
    ) {
      errors.push('consensus.dissentingNotes must be an array of strings');
    }
    if (
      typeof payload.consensus.confidenceScore !== 'number' ||
      !Number.isFinite(payload.consensus.confidenceScore) ||
      payload.consensus.confidenceScore < 0 ||
      payload.consensus.confidenceScore > 1
    ) {
      errors.push('consensus.confidenceScore must be a number in [0, 1]');
    }
  }

  return { valid: errors.length === 0, errors };
}

function containsLegacyErpDdlIntent(text) {
  const lower = String(text || '').toLowerCase();
  const hasDdlOp = FORBIDDEN_DDL_KEYWORDS.some((kw) => lower.includes(kw));
  if (!hasDdlOp) return false;
  return LEGACY_ERP_TABLE_NAMES.some((tbl) => lower.includes(tbl));
}

function detectSecretLeak(text) {
  const str = String(text || '');
  for (const item of SECRET_LEAK_PATTERNS) {
    if (item.pattern.test(str)) {
      return item.code;
    }
  }
  return null;
}

/**
 * 盛隆最高執行指令 Policy-as-Code 守門員
 * 假設 payload 已通過 validateMultiAgentTaskPayload 結構檢查
 */
export function evaluatePolicyGate(payload) {
  const violations = [];
  const warnings = [];
  const requiredGuards = new Set(payload.acceptanceCriteria.requiredCommands || []);

  // 1. 禁止直推 main，強制走 PR 分支
  if (payload.acceptanceCriteria.allowDirectMainPush !== false) {
    violations.push({
      code: 'POLICY_NO_DIRECT_MAIN_PUSH',
      message: '嚴禁代理直接推送 main 分支，allowDirectMainPush 必須為 false',
    });
  }
  if (payload.acceptanceCriteria.mustOpenPullRequest !== true) {
    violations.push({
      code: 'POLICY_PR_REQUIRED',
      message: '所有多代理變更必須開立 Pull Request 並通過 CI 測試閘門',
    });
  }

  // 2. 倉庫白名單與隔離分支命名防線
  if (!ALLOWED_REPOSITORIES.includes(payload.target.repository)) {
    violations.push({
      code: 'POLICY_REPO_NOT_ALLOWED',
      message: `目標倉庫不在白名單內：${payload.target.repository}`,
    });
  }
  if (payload.target.baseBranch !== 'main') {
    violations.push({
      code: 'POLICY_INVALID_BASE_BRANCH',
      message: `baseBranch 必須為 main，收到：${payload.target.baseBranch}`,
    });
  }
  if (!FEATURE_BRANCH_REGEX.test(payload.target.featureBranch)) {
    violations.push({
      code: 'POLICY_INVALID_FEATURE_BRANCH',
      message: 'featureBranch 必須以 ai-agent/ 開頭且符合安全命名規則，絕不可為 main/master',
    });
  }
  if (payload.target.allowedPaths.some((p) => p.includes('..'))) {
    violations.push({
      code: 'POLICY_PATH_TRAVERSAL_BLOCKED',
      message: 'target.allowedPaths 嚴禁包含路徑穿越字元 (..)',
    });
  }

  // 3. Directive #4：舊 ERP 絕對零更動黑盒子鐵律
  if (payload.impactAnalysis.touchesLegacyErp === true) {
    violations.push({
      code: 'POLICY_LEGACY_ERP_BLACKBOX',
      message: '違反最高執行指令 #4：嚴禁對舊門市 ERP 資料庫結構或執行檔進行任何更動',
    });
  }
  if (payload.safetyConstraints.noLegacyErpDdl !== true) {
    violations.push({
      code: 'POLICY_LEGACY_ERP_BLACKBOX',
      message: 'safetyConstraints.noLegacyErpDdl 必須鎖定為 true',
    });
  }

  const combinedText = [
    payload.objective.title,
    payload.objective.summary,
    payload.impactAnalysis.mitigationNotes,
    ...payload.planSteps.map((s) => s.description),
  ].join('\n');

  if (containsLegacyErpDdlIntent(combinedText)) {
    violations.push({
      code: 'POLICY_LEGACY_ERP_BLACKBOX',
      message: '偵測到疑似針對舊門市 ERP 資料表之 DDL 修改意圖，已強制攔截',
    });
  }

  // 4. 司機端零通知鐵律 & AI 犯錯中心防爆防線
  if (payload.safetyConstraints.noDriverGpsPolling !== true) {
    violations.push({
      code: 'POLICY_DRIVER_ZERO_NOTIFY',
      message: '違反最高權限鐵律：safetyConstraints.noDriverGpsPolling 必須為 true',
    });
  }
  if (payload.safetyConstraints.minPollingIntervalSeconds < 60) {
    violations.push({
      code: 'POLICY_AI_MISTAKE_CENTER_MIN_POLLING',
      message: '違反 AI 犯錯中心鐵律：任何輪詢間隔嚴禁小於 60 秒',
    });
  }
  if (payload.safetyConstraints.noHardcodedSecrets !== true) {
    violations.push({
      code: 'POLICY_NO_HARDCODED_SECRETS',
      message: 'safetyConstraints.noHardcodedSecrets 必須為 true',
    });
  }
  if (payload.safetyConstraints.maxAgentIterations > 20) {
    violations.push({
      code: 'POLICY_MAX_ITERATIONS_EXCEEDED',
      message: '單次代理任務迭代上限不得超過 20 次（防止無窮迴圈）',
    });
  }
  if (payload.safetyConstraints.maxTokenBudgetUsd > 10) {
    violations.push({
      code: 'POLICY_TOKEN_BUDGET_EXCEEDED',
      message: '單次任務 Token 預算上限不得超過 $10 USD',
    });
  }

  // 5. 明碼密鑰掃描攔截
  const leakedSecretCode = detectSecretLeak(JSON.stringify(payload));
  if (leakedSecretCode) {
    violations.push({
      code: 'POLICY_SECRET_LEAK_DETECTED',
      message: `偵測到疑似明碼金鑰或 Token (${leakedSecretCode})，已強制拒絕入列`,
    });
  }

  // 6. 共識檢查
  if (payload.consensus.status !== 'approved') {
    violations.push({
      code: 'POLICY_CONSENSUS_NOT_APPROVED',
      message: `協作中心共識狀態為 ${payload.consensus.status}，未達 approved 不可自動派發執行`,
    });
  }

  // 7. 風險自動升格（L3 敏感高危路徑與司機/報價保護）
  let effectiveRiskLevel = payload.riskLevel;
  let requiresBossApproval = payload.requiresBossApproval;

  const touchesSensitivePath = payload.target.allowedPaths.some((p) =>
    HIGH_RISK_L3_PATH_PATTERNS.some((rx) => rx.test(p))
  );

  if (
    payload.impactAnalysis.touchesDriverLocation ||
    payload.impactAnalysis.touchesPricingMaster ||
    touchesSensitivePath
  ) {
    if (effectiveRiskLevel !== 'L3') {
      warnings.push('偵測到敏感高危範圍（司機定位／定價成本／權限或工作流），已自動升格為 L3');
    }
    effectiveRiskLevel = 'L3';
    requiresBossApproval = true;
  }

  if (effectiveRiskLevel === 'L3' && !requiresBossApproval) {
    requiresBossApproval = true;
    warnings.push('L3 高危任務強制啟用老闆人工簽核（Telegram ID: 8862712587）');
  }

  if (
    payload.impactAnalysis.touchesDriverLocation ||
    payload.target.repository === 'qazwsx32100/shenglong-next'
  ) {
    requiredGuards.add('npm run guard:zero-notify');
  }

  return {
    allowed: violations.length === 0,
    effectiveRiskLevel,
    requiresBossApproval,
    superAdminId: SUPERADMIN_TELEGRAM_ID,
    requiredGuards: [...requiredGuards],
    violations,
    warnings,
  };
}

/**
 * 建立受限容量的冪等快取（避免記憶體無限膨脹與重複建單）
 */
export function createIdempotencyStore({
  ttlMs = 24 * 60 * 60 * 1000,
  maxEntries = 2000,
  now = () => Date.now(),
} = {}) {
  const store = new Map();

  function prune(currentTs) {
    for (const [k, entry] of store) {
      if (entry.expiresAt <= currentTs) {
        store.delete(k);
      }
    }
    while (store.size > maxEntries) {
      const oldestKey = store.keys().next().value;
      store.delete(oldestKey);
    }
  }

  return {
    get(key) {
      const ts = now();
      prune(ts);
      const entry = store.get(key);
      if (!entry || entry.expiresAt <= ts) {
        store.delete(key);
        return null;
      }
      return entry.value;
    },
    set(key, value) {
      const ts = now();
      prune(ts);
      store.delete(key);
      store.set(key, { value, expiresAt: ts + ttlMs });
    },
    size() {
      prune(now());
      return store.size;
    },
    clear() {
      store.clear();
    },
  };
}

/**
 * 組裝給 GitHub repository_dispatch 的純淨標準化封包
 */
export function buildGithubDispatchPayload(task, policyResult) {
  return {
    event_type: 'multi_agent_task',
    client_payload: {
      schemaVersion: task.schemaVersion,
      taskId: task.taskId,
      idempotencyKey: task.idempotencyKey,
      featureBranch: task.target.featureBranch,
      baseBranch: task.target.baseBranch,
      allowedPaths: task.target.allowedPaths,
      effectiveRiskLevel: policyResult.effectiveRiskLevel,
      requiresBossApproval: policyResult.requiresBossApproval,
      superAdminId: policyResult.superAdminId,
      requiredGuards: policyResult.requiredGuards,
      objectiveTitle: task.objective.title,
      affectedSystems: task.impactAnalysis.affectedSystems,
      planStepCount: task.planSteps.length,
    },
  };
}
