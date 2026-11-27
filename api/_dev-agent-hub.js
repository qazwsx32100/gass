/**
 * api/_dev-agent-hub.js
 * 盛隆瓦斯 — 第一層：多代理 AI 協作中心核心引擎 (Multi-Model Collaborative Hub Orchestrator)
 *
 * 功能：
 *  1. 統一接入四大模型供應商（Gemini 4、ChatGPT / OpenAI、Grok / xAI、Meta AI / Llama）與離線規則備援。
 *  2. 採「固定輪次三角色協作」（Architect 架構師 ➔ Implementer 工程師 ➔ Auditor 盛隆紅線審計官），
 *     徹底取代開放式 AutoGPT 無窮迴圈，控管 Token 成本並確保跨模型交叉審查。
 *  3. 將多模型共識編譯為 100% 符合 schemas/multi-agent-task.v1.schema.json 的標準工單，
 *     並自動以 HMAC-SHA256 簽章串接至執行橋樑（/api/dev-agent-dispatch）。
 */

import crypto from 'node:crypto';
import { fetchWithTimeout } from './_fetch.js';
import {
  SCHEMA_VERSION,
  SUPERADMIN_TELEGRAM_ID,
  ALLOWED_REPOSITORIES,
  signDevAgentRequest,
  validateMultiAgentTaskPayload,
  evaluatePolicyGate,
} from './_dev-agent-protocol.js';

export const HUB_ROLES = Object.freeze(['architect', 'implementer', 'auditor']);
export const MAX_DEBATE_ROUNDS = 2;

const LEGACY_ERP_HINTS = ['dbo.gas_oders', 'gas_oders', 'dbo.customers', 'dbo.money', '舊erp', '舊 erp', 'sql server', 'alter table', 'drop table'];
const DRIVER_LOCATION_HINTS = ['司機', 'driver', 'gps', '定位', 'mainactivity', 'geolocation', '外勤'];
const PRICING_HINTS = ['定價', '報價', '成本', '運費', '毛利', 'pricing', 'gas-cost', '22.63'];
const FAST_POLLING_HINTS = ['每秒', '每5秒', '每 5 秒', '每10秒', '每 10 秒', 'setinterval', '高頻輪詢'];

/**
 * 偵測目前環境已配置哪些外部 AI 模型供應商（不外洩金鑰）
 */
export function detectConfiguredProviders(env = process.env) {
  const providers = [];

  const geminiKey = env.GEMINI_API_KEY || env.GEMINI_KEY_1 || '';
  if (geminiKey) {
    providers.push({
      id: 'gemini',
      label: 'Google Gemini',
      model: env.DEV_AGENT_GEMINI_MODEL || env.ADVISOR_GEMINI_MODEL || 'gemini-4-neon',
      apiKey: geminiKey,
    });
  }

  const openaiKey = env.OPENAI_API_KEY || '';
  if (openaiKey) {
    providers.push({
      id: 'openai',
      label: 'OpenAI ChatGPT',
      model: env.DEV_AGENT_OPENAI_MODEL || 'gpt-4.1-mini',
      apiKey: openaiKey,
    });
  }

  const grokKey = env.XAI_API_KEY || env.GROK_API_KEY || '';
  if (grokKey) {
    providers.push({
      id: 'grok',
      label: 'xAI Grok',
      model: env.DEV_AGENT_GROK_MODEL || 'grok-3-mini',
      apiKey: grokKey,
      baseUrl: env.XAI_BASE_URL || 'https://api.x.ai/v1',
    });
  }

  const metaKey = env.META_AI_API_KEY || env.GROQ_API_KEY || '';
  if (metaKey) {
    providers.push({
      id: 'meta',
      label: 'Meta AI (Llama)',
      model: env.DEV_AGENT_META_MODEL || 'llama-3.3-70b-versatile',
      apiKey: metaKey,
      baseUrl: env.META_AI_BASE_URL || 'https://api.groq.com/openai/v1',
    });
  }

  return providers;
}

/**
 * 將可用供應商分配給三個協作角色（當有 >=2 個模型時，強制讓 Auditor 與 Architect 使用不同模型交叉審查）
 */
export function assignModelsToRoles(availableProviders, preferredIds = []) {
  let pool = Array.isArray(availableProviders) ? [...availableProviders] : [];
  if (Array.isArray(preferredIds) && preferredIds.length > 0) {
    const preferredSet = new Set(preferredIds.map((id) => String(id).toLowerCase()));
    const filtered = pool.filter((p) => preferredSet.has(p.id));
    if (filtered.length > 0) pool = filtered;
  }

  if (pool.length === 0) {
    const fallback = { id: 'deterministic', label: 'ShengLong Deterministic Sandbox', model: 'rule-based-v1', apiKey: '' };
    return { architect: fallback, implementer: fallback, auditor: fallback };
  }
  if (pool.length === 1) {
    return { architect: pool[0], implementer: pool[0], auditor: pool[0] };
  }
  if (pool.length === 2) {
    return { architect: pool[0], implementer: pool[0], auditor: pool[1] };
  }
  return { architect: pool[0], implementer: pool[1], auditor: pool[2] };
}

function extractJsonObject(text) {
  const str = String(text || '').trim();
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch {
    const match = str.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

/**
 * 統一多供應商 JSON 呼叫器（支援 Gemini REST 與 OpenAI / Grok / Meta AI OpenAI-Compatible API）
 */
export async function invokeProviderJson({
  provider,
  systemPrompt,
  userPrompt,
  fetchFn = fetchWithTimeout,
  timeoutMs = 15000,
}) {
  if (!provider || !provider.apiKey || provider.id === 'deterministic') {
    return { ok: false, reason: 'NO_REMOTE_PROVIDER' };
  }

  try {
    if (provider.id === 'gemini') {
      const candidateModels = [...new Set([provider.model, 'gemini-3.5-flash-lite'])];
      let lastReason = 'GEMINI_UNAVAILABLE';

      for (const candidateModel of candidateModels) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(candidateModel)}:generateContent?key=${encodeURIComponent(provider.apiKey)}`;
        const res = await fetchFn(
          url,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: systemPrompt }] },
              contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
              generationConfig: {
                temperature: 0.2,
                responseMimeType: 'application/json',
              },
            }),
          },
          timeoutMs
        );
        if (res.status === 429 || res.status === 503) {
          lastReason = `GEMINI_HTTP_${res.status}`;
          continue;
        }
        if (res.status < 200 || res.status >= 300) {
          return { ok: false, reason: `GEMINI_HTTP_${res.status}` };
        }
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const parsed = extractJsonObject(text);
        if (parsed) {
          return { ok: true, data: parsed, model: `${provider.id}:${candidateModel}` };
        }
        lastReason = 'GEMINI_INVALID_JSON';
      }
      return { ok: false, reason: lastReason };
    }

    // OpenAI / Grok / Meta AI (OpenAI Chat Completions 相容介面)
    const baseUrl =
      provider.id === 'openai'
        ? 'https://api.openai.com/v1'
        : String(provider.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');

    const res = await fetchFn(
      `${baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${provider.apiKey}`,
        },
        body: JSON.stringify({
          model: provider.model,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
      },
      timeoutMs
    );

    if (res.status < 200 || res.status >= 300) {
      return { ok: false, reason: `${provider.id.toUpperCase()}_HTTP_${res.status}` };
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content || '';
    const parsed = extractJsonObject(text);
    return parsed ? { ok: true, data: parsed, model: `${provider.id}:${provider.model}` } : { ok: false, reason: `${provider.id.toUpperCase()}_INVALID_JSON` };
  } catch (err) {
    return { ok: false, reason: `${provider.id.toUpperCase()}_ERROR_${err.message}` };
  }
}

function buildDeterministicArchitect(prompt, repository) {
  const lower = String(prompt || '').toLowerCase();
  const touchesLegacyErp = LEGACY_ERP_HINTS.some((kw) => lower.includes(kw));
  const touchesDriverLocation = DRIVER_LOCATION_HINTS.some((kw) => lower.includes(kw));
  const touchesPricingMaster = PRICING_HINTS.some((kw) => lower.includes(kw));

  const affectedSystems = [];
  if (lower.includes('line') || lower.includes('客服') || lower.includes('知識庫')) affectedSystems.push('line_webhook', 'knowledge_base');
  if (touchesDriverLocation) affectedSystems.push('driver_app');
  if (touchesPricingMaster) affectedSystems.push('pricing_and_finance');
  if (lower.includes('庫存') || lower.includes('stock')) affectedSystems.push('realtime_stock');
  if (affectedSystems.length === 0) {
    affectedSystems.push(repository === 'qazwsx32100/shenglong-next' ? 'operations_console' : 'gass_platform');
  }

  const allowedPaths = touchesDriverLocation
    ? ['app/driver/', 'tests/']
    : lower.includes('文件') || lower.includes('藍圖')
      ? ['docs/', 'tests/']
      : ['api/', 'tests/', 'docs/'];

  const riskLevel = touchesLegacyErp || touchesDriverLocation || touchesPricingMaster
    ? 'L3'
    : allowedPaths.every((p) => p.startsWith('docs/') || p.startsWith('tests/'))
      ? 'L1'
      : 'L2';

  const cleanTitle = String(prompt || '').trim().replace(/\s+/g, ' ').slice(0, 80);

  return {
    title: cleanTitle.length >= 4 ? cleanTitle : `多代理協同任務：${repository}`,
    summary: `依需求進行系統拆解與連動影響評估：${String(prompt || '').trim().slice(0, 600)}`,
    riskLevel,
    allowedPaths,
    forbiddenPaths: ['sql/legacy_erp/', ...(touchesDriverLocation ? [] : ['android/'])],
    impactAnalysis: {
      affectedSystems: [...new Set(affectedSystems)],
      touchesLegacyErp,
      touchesDriverLocation,
      touchesPricingMaster,
      mitigationNotes: '隔離分支實作、先補單元測試（TDD）、執行全套回歸驗證與 PR Policy Diff 掃描，嚴格保護既有營運系統。',
    },
  };
}

function buildDeterministicImplementer(architectOut, repository) {
  const requiredCommands =
    repository === 'qazwsx32100/shenglong-next'
      ? ['npm test', 'npm run guard:zero-notify', 'npm run build']
      : ['npm test', 'npm run lint'];

  return {
    planSteps: [
      { step: 1, action: 'inspect', description: `檢視受波及模組 (${architectOut.impactAnalysis.affectedSystems.join(', ')}) 與既有測試覆蓋` },
      { step: 2, action: 'add_test', description: '先建立對應需求與邊界條件之自動化單元測試（TDD）' },
      { step: 3, action: 'edit_code', description: `於授權路徑 (${architectOut.allowedPaths.join(', ')}) 內實作變更並維持向後相容` },
      { step: 4, action: 'verify', description: `執行必過驗證指令 (${requiredCommands.join(' && ')}) 確保零回歸` },
      { step: 5, action: 'open_pr', description: '提交至 ai-agent/* 隔離分支並建立 Pull Request 交付審查' },
    ],
    acceptanceCriteria: {
      requiredCommands,
      maxChangedFiles: 12,
      mustOpenPullRequest: true,
      allowDirectMainPush: false,
    },
  };
}

function buildDeterministicAuditor(prompt, architectOut) {
  const lower = String(prompt || '').toLowerCase();
  const dissentingNotes = [];
  let blocked = false;

  if (architectOut.impactAnalysis.touchesLegacyErp) {
    blocked = true;
    dissentingNotes.push('違反最高執行指令 #4（舊 ERP 黑盒子鐵律）：需求涉及舊門市 ERP 資料表或結構異動，必須由老闆人工決策並禁止自動修改。');
  }
  if (FAST_POLLING_HINTS.some((kw) => lower.includes(kw))) {
    blocked = true;
    dissentingNotes.push('違反 AI 犯錯中心與司機零通知鐵律：偵測到高頻輪詢需求（<60s 或 GPS 輪詢），已由審計代理攔截。');
  }

  return {
    status: blocked ? 'escalate_to_boss' : 'approved',
    dissentingNotes,
    confidenceScore: blocked ? 0.25 : 0.92,
  };
}

function makeTaskId(nowMs, prompt) {
  const d = new Date(nowMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const shortHash = crypto.createHash('sha256').update(`${nowMs}:${prompt}`).digest('hex').slice(0, 6).toUpperCase();
  return `TASK-${y}${m}${day}-${shortHash}`;
}

/**
 * 執行完整三角色多代理協作討論並產出標準 JSON v1.0 工單
 */
export async function runCollaborativeSession({
  prompt,
  repository = 'qazwsx32100/gass',
  requestedBy = `boss_${SUPERADMIN_TELEGRAM_ID}`,
  source = 'multi_agent_hub',
  preferredProviders = [],
  dryRun = false,
  issueNumber,
  env = process.env,
  fetchFn = fetchWithTimeout,
  now = () => Date.now(),
} = {}) {
  const cleanPrompt = String(prompt || '').trim();
  if (cleanPrompt.length < 6 || cleanPrompt.length > 2000) {
    return {
      ok: false,
      code: 'INVALID_PROMPT',
      error: '需求描述長度必須介於 6 到 2000 字元之間',
    };
  }
  if (!ALLOWED_REPOSITORIES.includes(repository)) {
    return {
      ok: false,
      code: 'REPOSITORY_NOT_ALLOWED',
      error: `不支援的目標倉庫：${repository}`,
      allowedRepositories: ALLOWED_REPOSITORIES,
    };
  }

  const availableProviders = detectConfiguredProviders(env);
  const roleAssignments = assignModelsToRoles(availableProviders, preferredProviders);
  const participatingModels = [];
  const discussionTranscript = [];

  // ── Role 1: Architect（架構拆解與連動影響預判）──────────────────────────────
  const fallbackArch = buildDeterministicArchitect(cleanPrompt, repository);
  const archRes = await invokeProviderJson({
    provider: roleAssignments.architect,
    fetchFn,
    systemPrompt:
      '你是盛隆瓦斯系統架構師（Architect）。請嚴守：1.不可修改舊門市ERP(SQL Server) 2.不可在司機端定時輪詢GPS 3.任何輪詢間隔>=60秒。請只輸出 JSON 物件，欄位包含 title, summary, riskLevel (L1|L2|L3), allowedPaths (string[]), impactAnalysis ({affectedSystems, touchesLegacyErp, touchesDriverLocation, touchesPricingMaster, mitigationNotes})。',
    userPrompt: `目標倉庫：${repository}\n需求：${cleanPrompt}`,
  });

  const archData = archRes.ok && archRes.data?.impactAnalysis
    ? {
        title: String(archRes.data.title || fallbackArch.title).slice(0, 150),
        summary: String(archRes.data.summary || fallbackArch.summary).slice(0, 1800),
        riskLevel: ['L1', 'L2', 'L3'].includes(archRes.data.riskLevel) ? archRes.data.riskLevel : fallbackArch.riskLevel,
        allowedPaths: Array.isArray(archRes.data.allowedPaths) && archRes.data.allowedPaths.length > 0
          ? archRes.data.allowedPaths.map(String).slice(0, 20)
          : fallbackArch.allowedPaths,
        forbiddenPaths: fallbackArch.forbiddenPaths,
        impactAnalysis: {
          affectedSystems: Array.isArray(archRes.data.impactAnalysis.affectedSystems) && archRes.data.impactAnalysis.affectedSystems.length > 0
            ? archRes.data.impactAnalysis.affectedSystems.map(String)
            : fallbackArch.impactAnalysis.affectedSystems,
          touchesLegacyErp: Boolean(archRes.data.impactAnalysis.touchesLegacyErp) || fallbackArch.impactAnalysis.touchesLegacyErp,
          touchesDriverLocation: Boolean(archRes.data.impactAnalysis.touchesDriverLocation) || fallbackArch.impactAnalysis.touchesDriverLocation,
          touchesPricingMaster: Boolean(archRes.data.impactAnalysis.touchesPricingMaster) || fallbackArch.impactAnalysis.touchesPricingMaster,
          mitigationNotes: String(archRes.data.impactAnalysis.mitigationNotes || fallbackArch.impactAnalysis.mitigationNotes).slice(0, 900),
        },
      }
    : fallbackArch;

  const archModelTag = archRes.ok ? archRes.model : 'deterministic:architect-v1';
  participatingModels.push(archModelTag);
  discussionTranscript.push({
    round: 1,
    role: 'architect',
    model: archModelTag,
    usedFallback: !archRes.ok,
    fallbackReason: archRes.ok ? null : archRes.reason,
    summary: `拆解完成：風險 ${archData.riskLevel}，連動系統 [${archData.impactAnalysis.affectedSystems.join(', ')}]`,
  });

  // ── Role 2: Implementer（TDD 實作步驟與測試驗收規劃）─────────────────────────
  const fallbackImpl = buildDeterministicImplementer(archData, repository);
  const implRes = await invokeProviderJson({
    provider: roleAssignments.implementer,
    fetchFn,
    systemPrompt:
      '你是盛隆瓦斯資深工程師（Implementer）。請依架構師方案規劃 TDD 步驟，只輸出 JSON 物件：{ planSteps: [{step, action(inspect|add_test|edit_code|update_docs|verify|open_pr), description}], requiredCommands: string[], maxChangedFiles: number }。',
    userPrompt: `倉庫：${repository}\n架構摘要：${JSON.stringify(archData)}`,
  });

  const validActions = new Set(['inspect', 'add_test', 'edit_code', 'update_docs', 'verify', 'open_pr']);
  const implSteps =
    implRes.ok && Array.isArray(implRes.data?.planSteps) && implRes.data.planSteps.length > 0
      ? implRes.data.planSteps
          .slice(0, 20)
          .map((s, i) => ({
            step: i + 1,
            action: validActions.has(s?.action) ? s.action : 'edit_code',
            description: String(s?.description || '執行計畫步驟').slice(0, 480),
          }))
      : fallbackImpl.planSteps;

  const implCommands =
    implRes.ok && Array.isArray(implRes.data?.requiredCommands) && implRes.data.requiredCommands.length > 0
      ? implRes.data.requiredCommands.map(String).slice(0, 8)
      : fallbackImpl.acceptanceCriteria.requiredCommands;

  const implModelTag = implRes.ok ? implRes.model : 'deterministic:implementer-v1';
  participatingModels.push(implModelTag);
  discussionTranscript.push({
    round: 1,
    role: 'implementer',
    model: implModelTag,
    usedFallback: !implRes.ok,
    fallbackReason: implRes.ok ? null : implRes.reason,
    summary: `規劃 ${implSteps.length} 步實作與測試指令 [${implCommands.join(', ')}]`,
  });

  // ── Role 3: Auditor（跨模型紅線審計官）───────────────────────────────────────
  const fallbackAudit = buildDeterministicAuditor(cleanPrompt, archData);
  const auditRes = await invokeProviderJson({
    provider: roleAssignments.auditor,
    fetchFn,
    systemPrompt:
      '你是盛隆瓦斯資安與最高指令審計官（Auditor）。請審查提案是否觸犯：1.舊ERP零DDL 2.司機端零定位通知 3.輪詢>=60秒 4.禁止直推main 5.禁止明碼密鑰。只輸出 JSON：{ status("approved"|"escalate_to_boss"|"rejected"), dissentingNotes: string[], confidenceScore: number(0..1) }。',
    userPrompt: `原始需求：${cleanPrompt}\n架構：${JSON.stringify(archData)}\n步驟：${JSON.stringify(implSteps)}`,
  });

  // 確定性紅線守門不可被外部模型「樂觀放行」覆蓋（Fail-Safe Merge）
  let finalAudit = fallbackAudit;
  if (auditRes.ok && auditRes.data) {
    const remoteStatus = ['approved', 'escalate_to_boss', 'rejected'].includes(auditRes.data.status)
      ? auditRes.data.status
      : 'escalate_to_boss';
    const remoteNotes = Array.isArray(auditRes.data.dissentingNotes)
      ? auditRes.data.dissentingNotes.map(String).slice(0, 10)
      : [];
    const mergedNotes = [...new Set([...fallbackAudit.dissentingNotes, ...remoteNotes])];
    const effectiveStatus =
      fallbackAudit.status !== 'approved' ? fallbackAudit.status : remoteStatus;
    const score =
      typeof auditRes.data.confidenceScore === 'number' && Number.isFinite(auditRes.data.confidenceScore)
        ? Math.max(0, Math.min(1, auditRes.data.confidenceScore))
        : fallbackAudit.confidenceScore;

    finalAudit = {
      status: effectiveStatus,
      dissentingNotes: mergedNotes,
      confidenceScore: fallbackAudit.status !== 'approved' ? Math.min(score, 0.3) : score,
    };
  }

  const auditModelTag = auditRes.ok ? auditRes.model : 'deterministic:auditor-v1';
  participatingModels.push(auditModelTag);
  discussionTranscript.push({
    round: 2,
    role: 'auditor',
    model: auditModelTag,
    usedFallback: !auditRes.ok,
    fallbackReason: auditRes.ok ? null : auditRes.reason,
    summary: `審計裁決：${finalAudit.status}（信心 ${finalAudit.confidenceScore}，異議 ${finalAudit.dissentingNotes.length} 則）`,
  });

  // ── 編譯標準 JSON v1.0 工單 ──────────────────────────────────────────────────
  const nowMs = now();
  const taskId = makeTaskId(nowMs, cleanPrompt);
  const branchSlug = taskId.toLowerCase();
  const idempotencyHash = crypto
    .createHash('sha256')
    .update(`${repository}:${cleanPrompt}:${dryRun ? 'dry' : 'live'}`)
    .digest('hex')
    .slice(0, 32);

  const taskPayload = {
    schemaVersion: SCHEMA_VERSION,
    taskId,
    idempotencyKey: `sha256:${idempotencyHash}`,
    createdAt: new Date(nowMs).toISOString(),
    ...(dryRun ? { dryRun: true } : {}),
    initiator: {
      source,
      requestedBy,
      participatingModels: [...new Set(participatingModels)],
    },
    riskLevel: archData.riskLevel,
    requiresBossApproval: archData.riskLevel !== 'L1',
    target: {
      repository,
      baseBranch: 'main',
      featureBranch: `ai-agent/${branchSlug}`,
      allowedPaths: archData.allowedPaths,
      forbiddenPaths: archData.forbiddenPaths,
    },
    objective: {
      title: archData.title,
      summary: archData.summary,
      ...(Number.isInteger(issueNumber) && issueNumber > 0 ? { issueNumber } : {}),
    },
    impactAnalysis: archData.impactAnalysis,
    planSteps: implSteps,
    acceptanceCriteria: {
      requiredCommands: implCommands,
      maxChangedFiles:
        implRes.ok && Number.isInteger(implRes.data?.maxChangedFiles) && implRes.data.maxChangedFiles >= 1 && implRes.data.maxChangedFiles <= 50
          ? implRes.data.maxChangedFiles
          : 12,
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
    consensus: finalAudit,
  };

  const schemaCheck = validateMultiAgentTaskPayload(taskPayload);
  const preflightPolicy = schemaCheck.valid
    ? evaluatePolicyGate(taskPayload)
    : { allowed: false, violations: [{ code: 'SCHEMA_INVALID', message: schemaCheck.errors.join('; ') }], warnings: [] };

  return {
    ok: true,
    taskId,
    maxRounds: MAX_DEBATE_ROUNDS,
    configuredProviders: availableProviders.map((p) => ({ id: p.id, model: p.model })),
    roleAssignments: {
      architect: archModelTag,
      implementer: implModelTag,
      auditor: auditModelTag,
    },
    discussionTranscript,
    taskPayload,
    schemaCheck,
    preflightPolicy,
  };
}

/**
 * 將協作中心產出之標準 JSON v1.0 工單以 HMAC-SHA256 簽章送入執行橋樑 (/api/dev-agent-dispatch)
 */
export async function dispatchTaskToBridge({
  taskPayload,
  bridgeUrl = '',
  bridgeHandler = null,
  bridgeToken = '',
  webhookSecret = '',
  fetchFn = fetchWithTimeout,
  now = () => Date.now(),
}) {
  const rawBody = JSON.stringify(taskPayload);
  const timestamp = Math.floor(now() / 1000);
  const signature = signDevAgentRequest({ secret: webhookSecret, timestamp, rawBody });

  const headers = {
    'content-type': 'application/json',
    authorization: `Bearer ${bridgeToken}`,
    'x-agent-timestamp': String(timestamp),
    'x-agent-signature-256': signature,
    'x-idempotency-key': taskPayload.idempotencyKey,
  };

  // 同站內聯直呼叫（零額外網路往返、零 SSRF）
  if (typeof bridgeHandler === 'function') {
    const mockRes = {
      statusCode: 200,
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

    await bridgeHandler(
      {
        method: 'POST',
        headers,
        rawBody,
        body: taskPayload,
        socket: { remoteAddress: '127.0.0.1' },
      },
      mockRes
    );

    return {
      status: mockRes.statusCode,
      body: mockRes.body,
    };
  }

  if (!bridgeUrl) {
    throw new Error('bridgeUrl or bridgeHandler is required');
  }

  const res = await fetchFn(
    bridgeUrl,
    {
      method: 'POST',
      headers,
      body: rawBody,
    },
    15000
  );
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}
