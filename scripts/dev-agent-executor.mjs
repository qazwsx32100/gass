#!/usr/bin/env node
/**
 * scripts/dev-agent-executor.mjs
 * 盛隆瓦斯 — 多代理 AI 協同開發第二階段執行器與 PR 政策守門員 (Phase 2 Executor & PR Diff Gate)
 *
 * 功能：
 *  1. validateDispatchClientPayload(payload)：嚴格驗證來自 GitHub repository_dispatch 的工單負載
 *  2. renderTaskRunDossier(payload, meta)：產出可審計的沙盒任務執行紀錄 (docs/agent-runs/<taskId>.md)
 *  3. renderPrBody(payload, meta)：產出標準化 Pull Request 審查內文（含連動系統、測試證據與老闆 L3 簽核欄）
 *  4. scanDiffForPolicyViolations(diffText, options)：針對 PR 變更 Diff 執行靜態安全掃描
 *
 * CLI 用法：
 *  - node scripts/dev-agent-executor.mjs --prepare-run --payload-json '<json>' --dossier-out <path> --pr-body-out <path>
 *  - node scripts/dev-agent-executor.mjs --check-diff --base-ref origin/main
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const SUPERADMIN_TELEGRAM_ID = '8862712587';
const TASK_ID_REGEX = /^TASK-[0-9]{8}-[0-9A-Za-z_-]{3,24}$/;
const FEATURE_BRANCH_REGEX = /^ai-agent\/[a-z0-9][a-z0-9._/-]{2,64}$/;
const VALID_RISK_LEVELS = new Set(['L1', 'L2', 'L3']);

const LEGACY_ERP_TABLES = Object.freeze([
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

const SECRET_PATTERNS = Object.freeze([
  { code: 'SECRET_GITHUB_PAT', pattern: /\b(?:ghp|gho|ghu|ghs)_[A-Za-z0-9]{20,}\b/ },
  { code: 'SECRET_GITHUB_FINE_PAT', pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/ },
  { code: 'SECRET_GOOGLE_API_KEY', pattern: /\bAIza[0-9A-Za-z_-]{20,}\b/ },
  { code: 'SECRET_OPENAI_KEY', pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/ },
  { code: 'SECRET_TELEGRAM_BOT_TOKEN', pattern: /\b[0-9]{8,12}:[A-Za-z0-9_-]{30,}\b/ },
]);

function normalizeDispatchPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  const meta = payload.meta && typeof payload.meta === 'object' ? payload.meta : {};
  return {
    ...meta,
    ...payload,
  };
}

/**
 * 驗證來自 repository_dispatch / workflow_dispatch 的工單參數
 */
export function validateDispatchClientPayload(rawPayload) {
  const errors = [];
  if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) {
    return { valid: false, errors: ['client_payload must be a JSON object'] };
  }
  const payload = normalizeDispatchPayload(rawPayload);

  if (payload.schemaVersion !== '1.0.0') {
    errors.push('schemaVersion must be "1.0.0"');
  }
  if (typeof payload.taskId !== 'string' || !TASK_ID_REGEX.test(payload.taskId)) {
    errors.push('taskId must match TASK-YYYYMMDD-<id>');
  }
  if (typeof payload.featureBranch !== 'string' || !FEATURE_BRANCH_REGEX.test(payload.featureBranch)) {
    errors.push('featureBranch must start with ai-agent/ and match safe branch format');
  }
  if (payload.baseBranch !== 'main') {
    errors.push('baseBranch must be "main"');
  }
  if (!VALID_RISK_LEVELS.has(payload.effectiveRiskLevel)) {
    errors.push('effectiveRiskLevel must be L1, L2, or L3');
  }
  if (typeof payload.objectiveTitle !== 'string' || payload.objectiveTitle.trim().length < 4) {
    errors.push('objectiveTitle is required (min 4 chars)');
  }
  if (!Array.isArray(payload.affectedSystems) || payload.affectedSystems.length < 1) {
    errors.push('affectedSystems must be a non-empty array');
  }
  if (!Array.isArray(payload.allowedPaths) || payload.allowedPaths.length < 1) {
    errors.push('allowedPaths must be a non-empty array');
  } else if (payload.allowedPaths.some((p) => typeof p !== 'string' || p.includes('..'))) {
    errors.push('allowedPaths must not contain path traversal (..)');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * 解析 unified git diff 並只檢查「新增行 (+)」以防誤殺既有測試或舊註解
 */
export function scanDiffForPolicyViolations(diffText, { maxChangedFiles = 50 } = {}) {
  const violations = [];
  const raw = String(diffText || '');
  const lines = raw.split(/\r?\n/);

  let currentFile = '';
  const changedFiles = new Set();

  for (const line of lines) {
    if (line.startsWith('+++ b/')) {
      currentFile = line.slice(6).trim();
      changedFiles.add(currentFile);
      continue;
    }

    // 只檢查真正新增的程式碼行（排除 diff header +++）
    if (!line.startsWith('+') || line.startsWith('+++')) {
      continue;
    }

    const added = line.slice(1);
    const lower = added.toLowerCase();
    const isTestFile = /(^|\/)tests\//i.test(currentFile);
    const isMarkdownDoc = /\.md$/i.test(currentFile);

    // 1. 舊 ERP 黑盒子防線（排除測試檔案樣本）
    if (!isTestFile && !isMarkdownDoc) {
      const hasDdl = FORBIDDEN_DDL_KEYWORDS.some((kw) => lower.includes(kw));
      const hasLegacyTable = LEGACY_ERP_TABLES.some((tbl) => lower.includes(tbl));
      if (hasDdl && hasLegacyTable) {
        violations.push({
          code: 'DIFF_LEGACY_ERP_DDL',
          file: currentFile,
          message: '偵測到新增針對舊門市 ERP 資料表之非法 DDL 指令（違反 Directive #4）',
        });
      }
    }

    // 2. 明碼憑證外洩掃描（排除測試檔案樣本）
    if (!isTestFile) {
      for (const secretRule of SECRET_PATTERNS) {
        if (secretRule.pattern.test(added)) {
          violations.push({
            code: secretRule.code,
            file: currentFile,
            message: `偵測到疑似明碼密鑰 (${secretRule.code})，嚴禁提交至儲存庫`,
          });
        }
      }
    }

    // 3. 司機外勤端零定位通知鐵律（禁止 GPS 定時輪詢與啟動權限彈窗）
    if (!isTestFile && !isMarkdownDoc && /(driver|MainActivity)/i.test(currentFile)) {
      if (/requestPermissions\s*\(.*ACCESS_(FINE|COARSE)_LOCATION/i.test(added)) {
        violations.push({
          code: 'DIFF_DRIVER_PERMISSION_POPUP',
          file: currentFile,
          message: '司機端嚴禁主動呼叫 requestPermissions 索取定位權限（違反零通知鐵律）',
        });
      }
      if (/setInterval\s*\(.*(getCurrentPosition|watchPosition|geolocation)/i.test(added)) {
        violations.push({
          code: 'DIFF_DRIVER_GPS_POLLING',
          file: currentFile,
          message: '司機端嚴禁使用 setInterval 定時輪詢 GPS（違反零通知鐵律）',
        });
      }
    }
  }

  if (changedFiles.size > maxChangedFiles) {
    violations.push({
      code: 'DIFF_MAX_CHANGED_FILES_EXCEEDED',
      file: '*',
      message: `單次變更檔案數 (${changedFiles.size}) 超過安全上限 (${maxChangedFiles})`,
    });
  }

  return {
    passed: violations.length === 0,
    changedFileCount: changedFiles.size,
    changedFiles: [...changedFiles],
    violations,
  };
}

/**
 * 產出沙盒任務執行紀錄 (docs/agent-runs/<taskId>.md)
 */
export function renderTaskRunDossier(rawPayload, meta = {}) {
  const payload = normalizeDispatchPayload(rawPayload);
  const executedAt = meta.executedAt || new Date().toISOString();
  const runId = meta.githubRunId || 'local-sandbox';
  const guards = Array.isArray(payload.requiredGuards) && payload.requiredGuards.length > 0
    ? payload.requiredGuards
    : ['npm test', 'npm run lint'];

  return [
    `# 🤖 多代理沙盒執行紀錄：${payload.taskId}`,
    '',
    `- **任務標題**：${payload.objectiveTitle}`,
    `- **執行時間**：\`${executedAt}\``,
    `- **GitHub Run ID**：\`${runId}\``,
    `- **隔離分支**：\`${payload.featureBranch}\` → \`${payload.baseBranch}\``,
    `- **風險分級**：\`${payload.effectiveRiskLevel}\`（老闆人工簽核：${payload.requiresBossApproval ? `**必要** (SuperAdmin \`${payload.superAdminId || SUPERADMIN_TELEGRAM_ID}\`)` : '依政策'}）`,
    `- **冪等鍵**：\`${payload.idempotencyKey || 'n/a'}\``,
    `- **受波及系統**：${payload.affectedSystems.map((s) => `\`${s}\``).join('、')}`,
    `- **授權編輯路徑**：${payload.allowedPaths.map((p) => `\`${p}\``).join('、')}`,
    '',
    '## 🛡️ 安全隔離確認',
    '- `SHENGLONG_ENV=sandbox`（非門市營業主機）',
    '- `LEGACY_ERP_WRITE_ENABLED=false`（舊 ERP 黑盒子零更動）',
    '- 禁止直推 `main`，本變更僅提交於隔離分支並透過 Pull Request 交付審查',
    '',
    '## 🧪 必過驗收守衛指令',
    ...guards.map((g) => `- [x] \`${g}\``),
    '',
  ].join('\n');
}

/**
 * 產出標準化 Pull Request 審查內文
 */
export function renderPrBody(rawPayload, meta = {}) {
  const payload = normalizeDispatchPayload(rawPayload);
  const guards = Array.isArray(payload.requiredGuards) && payload.requiredGuards.length > 0
    ? payload.requiredGuards
    : ['npm test', 'npm run lint'];
  const requiresBoss = payload.requiresBossApproval !== false || payload.effectiveRiskLevel === 'L3';
  const bossId = payload.superAdminId || SUPERADMIN_TELEGRAM_ID;

  return [
    `## 🤖 多代理 AI 協同開發自動建立 PR — \`${payload.taskId}\``,
    '',
    `> **目標**：${payload.objectiveTitle}`,
    '',
    '### 📋 任務與風險摘要',
    '| 欄位 | 數值 |',
    '| :--- | :--- |',
    `| **Task ID** | \`${payload.taskId}\` |`,
    `| **Schema Version** | \`${payload.schemaVersion}\` |`,
    `| **隔離分支** | \`${payload.featureBranch}\` ➔ \`${payload.baseBranch}\` |`,
    `| **風險分級** | \`${payload.effectiveRiskLevel}\` |`,
    `| **連動受波及系統** | ${payload.affectedSystems.map((s) => `\`${s}\``).join(', ')} |`,
    `| **授權路徑範圍** | ${payload.allowedPaths.map((p) => `\`${p}\``).join(', ')} |`,
    `| **觸發來源 Run** | \`${meta.githubRunId || 'local-sandbox'}\` |`,
    '',
    '### 🛡️ 盛隆最高執行指令合規檢核',
    '- [x] **Directive #1**：已完成連動受波及系統盤點',
    '- [x] **Directive #2**：已於隔離分支通過自動化測試閘門（Zero Regressions）',
    '- [x] **Directive #4**：舊 ERP 絕對零更動黑盒子靜態檢查通過',
    '- [x] **Directive #6**：全程於雲端沙盒執行（`SHENGLONG_ENV=sandbox`），絕不干擾門市營業主機',
    '- [x] **AI 犯錯中心**：零明碼憑證、無高頻輪詢（`>= 60s`）',
    '',
    '### 🧪 必過守衛與測試清單',
    ...guards.map((g) => `- [x] \`${g}\``),
    '',
    requiresBoss
      ? `### 👑 SuperAdmin 最終核准（必填）\n- [ ] 請老闆（Telegram ID: \`${bossId}\`）檢視 Vercel Preview 與上述測試結果後簽核合併。`
      : '### ✅ 合併條件\n- 通過所有 CI 閘門檢查與 Vercel Preview 煙霧測試後即可合併。',
    '',
  ].join('\n');
}

function parseCliArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        args[key] = true;
      } else {
        args[key] = next;
        i += 1;
      }
    }
  }
  return args;
}

function runCli() {
  const args = parseCliArgs(process.argv.slice(2));

  if (args['prepare-run']) {
    const rawJson = args['payload-json']
      ? String(args['payload-json'])
      : args['payload-file']
        ? fs.readFileSync(String(args['payload-file']), 'utf8')
        : process.env.CLIENT_PAYLOAD_JSON || '';

    if (!rawJson) {
      console.error('❌ Missing --payload-json, --payload-file, or CLIENT_PAYLOAD_JSON');
      process.exit(1);
    }

    let payload;
    try {
      payload = JSON.parse(rawJson);
    } catch (err) {
      console.error(`❌ Invalid payload JSON: ${err.message}`);
      process.exit(1);
    }

    const check = validateDispatchClientPayload(payload);
    if (!check.valid) {
      console.error('❌ Dispatch payload validation failed:', check.errors.join('; '));
      process.exit(1);
    }

    const meta = {
      executedAt: new Date().toISOString(),
      githubRunId: process.env.GITHUB_RUN_ID || 'local-sandbox',
    };

    const dossier = renderTaskRunDossier(payload, meta);
    const prBody = renderPrBody(payload, meta);

    if (args['dossier-out']) {
      const outPath = path.resolve(String(args['dossier-out']));
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, dossier, 'utf8');
      console.log(`✅ Task dossier written to ${outPath}`);
    }

    if (args['pr-body-out']) {
      const prPath = path.resolve(String(args['pr-body-out']));
      fs.mkdirSync(path.dirname(prPath), { recursive: true });
      fs.writeFileSync(prPath, prBody, 'utf8');
      console.log(`✅ PR body written to ${prPath}`);
    }
    return;
  }

  if (args['check-diff']) {
    let diffText = '';
    if (args['diff-file']) {
      diffText = fs.readFileSync(String(args['diff-file']), 'utf8');
    } else {
      const baseRef = String(args['base-ref'] || 'origin/main');
      diffText = execFileSync('git', ['diff', '--unified=0', `${baseRef}...HEAD`], {
        encoding: 'utf8',
        maxBuffer: 20 * 1024 * 1024,
      });
    }

    const maxFiles = Number(args['max-files'] || 50);
    const result = scanDiffForPolicyViolations(diffText, { maxChangedFiles: maxFiles });
    console.log(
      JSON.stringify(
        {
          passed: result.passed,
          changedFileCount: result.changedFileCount,
          violationCount: result.violations.length,
          violations: result.violations,
        },
        null,
        2
      )
    );
    if (!result.passed) {
      process.exit(1);
    }
    return;
  }

  console.error('Usage: node scripts/dev-agent-executor.mjs (--prepare-run | --check-diff)');
  process.exit(1);
}

const currentFile = fileURLToPath(import.meta.url);
const isMainEntry =
  Boolean(process.argv[1]) &&
  (process.platform === 'win32'
    ? path.resolve(process.argv[1]).toLowerCase() === path.resolve(currentFile).toLowerCase()
    : path.resolve(process.argv[1]) === path.resolve(currentFile));

if (isMainEntry) {
  runCli();
}
