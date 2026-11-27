/**
 * tests/dev-agent-phase2.test.mjs
 * 盛隆瓦斯 — 多代理 AI 協同開發第二階段（Devcontainer + MCP 最小權限 + GitHub Actions 沙盒執行器與 PR Gate）全量單元測試
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  SUPERADMIN_TELEGRAM_ID,
  validateDispatchClientPayload,
  scanDiffForPolicyViolations,
  renderTaskRunDossier,
  renderPrBody,
} from '../scripts/dev-agent-executor.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function makeDispatchPayload(overrides = {}) {
  return {
    schemaVersion: '1.0.0',
    taskId: 'TASK-20261127-P2A',
    idempotencyKey: 'sha256:phase2-test-idempotency-key',
    featureBranch: 'ai-agent/task-20261127-p2a',
    baseBranch: 'main',
    allowedPaths: ['docs/agent-runs/', 'tests/'],
    effectiveRiskLevel: 'L2',
    requiresBossApproval: true,
    superAdminId: SUPERADMIN_TELEGRAM_ID,
    requiredGuards: ['npm test', 'npm run lint'],
    objectiveTitle: '第二階段沙盒閉環自動開 PR 驗收',
    affectedSystems: ['multi_agent_dev_pipeline'],
    planStepCount: 3,
    ...overrides,
  };
}

describe('Phase 2: Devcontainer & Least-Privilege MCP Sandbox Config', () => {
  it('.devcontainer/devcontainer.json enforces Node 22 sandbox and disables legacy ERP writes', () => {
    const file = path.join(ROOT, '.devcontainer', 'devcontainer.json');
    assert.ok(fs.existsSync(file), 'devcontainer.json must exist');
    const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));

    assert.match(cfg.image, /javascript-node:22/);
    assert.equal(cfg.remoteEnv.SHENGLONG_ENV, 'sandbox');
    assert.equal(cfg.remoteEnv.LEGACY_ERP_WRITE_ENABLED, 'false');
    assert.equal(cfg.remoteEnv.DEV_AGENT_GITHUB_DISPATCH_ENABLED, 'false');
    assert.equal(cfg.remoteEnv.SUPERADMIN_TELEGRAM_ID, SUPERADMIN_TELEGRAM_ID);
  });

  it('docs/mcp-sandbox-config.example.json configures 4 least-privilege MCP servers with zero hardcoded secrets', () => {
    const file = path.join(ROOT, 'docs', 'mcp-sandbox-config.example.json');
    assert.ok(fs.existsSync(file), 'mcp-sandbox-config.example.json must exist');
    const raw = fs.readFileSync(file, 'utf8');
    const cfg = JSON.parse(raw);

    assert.equal(cfg.policy.environment, 'sandbox');
    assert.equal(cfg.policy.legacyErpWriteEnabled, false);
    assert.equal(cfg.policy.allowDirectMainPush, false);
    assert.ok(cfg.policy.minPollingIntervalSeconds >= 60);
    assert.equal(cfg.policy.superAdminTelegramId, SUPERADMIN_TELEGRAM_ID);

    const servers = Object.keys(cfg.mcpServers);
    assert.deepEqual(servers.sort(), [
      'filesystem-workspace',
      'github-sandbox',
      'supabase-staging-readonly',
      'vercel-preview-readonly',
    ]);

    assert.ok(cfg.mcpServers['supabase-staging-readonly'].args.includes('--read-only'));
    assert.ok(cfg.mcpServers['github-sandbox'].shenglongGuard.denylist.includes('push_to_main'));
    assert.ok(!/\b(?:ghp|gho|github_pat|AIza|sk-)/.test(raw), 'Must contain zero hardcoded secrets');
  });
});

describe('Phase 2: GitHub Actions Executor & PR Gate Workflows', () => {
  it('multi-agent-executor.yml uses repository_dispatch, isolated ai-agent branch, and opens PR without auto-merge', () => {
    const file = path.join(ROOT, '.github', 'workflows', 'multi-agent-executor.yml');
    assert.ok(fs.existsSync(file), 'multi-agent-executor.yml must exist');
    const yml = fs.readFileSync(file, 'utf8');

    assert.ok(yml.includes('repository_dispatch:'));
    assert.ok(yml.includes('types: [multi_agent_task]'));
    assert.ok(yml.includes('SHENGLONG_ENV: sandbox'));
    assert.ok(yml.includes('LEGACY_ERP_WRITE_ENABLED: "false"'));
    assert.ok(yml.includes('ai-agent/'));
    assert.ok(yml.includes('gh pr create'));
    assert.ok(!yml.includes('gh pr merge'), 'Executor must NEVER auto-merge PRs');
    assert.ok(!/git\s+push\s+.*origin\s+main\b/.test(yml), 'Executor must NEVER push directly to main');
  });

  it('multi-agent-pr-gate.yml runs diff policy check, linter, tests, and build on pull_request to main', () => {
    const file = path.join(ROOT, '.github', 'workflows', 'multi-agent-pr-gate.yml');
    assert.ok(fs.existsSync(file), 'multi-agent-pr-gate.yml must exist');
    const yml = fs.readFileSync(file, 'utf8');

    assert.ok(yml.includes('pull_request:'));
    assert.ok(yml.includes('--check-diff'));
    assert.ok(yml.includes('npx oxlint'));
    assert.ok(yml.includes('node --test'));
    assert.ok(yml.includes('npm run build'));
  });
});

describe('Phase 2: scripts/dev-agent-executor.mjs Validation, Diff Scanner & Rendering', () => {
  it('validateDispatchClientPayload accepts valid payload and blocks main branch / path traversal', () => {
    assert.equal(validateDispatchClientPayload(makeDispatchPayload()).valid, true);

    const badBranch = validateDispatchClientPayload(makeDispatchPayload({ featureBranch: 'main' }));
    assert.equal(badBranch.valid, false);

    const badTraversal = validateDispatchClientPayload(
      makeDispatchPayload({ allowedPaths: ['../outside/'] })
    );
    assert.equal(badTraversal.valid, false);
  });

  it('scanDiffForPolicyViolations passes clean diff and blocks ERP DDL, secrets, driver GPS polling, and excess files', () => {
    const cleanDiff = [
      'diff --git a/docs/agent-runs/TASK-20261127-P2A.md b/docs/agent-runs/TASK-20261127-P2A.md',
      '+++ b/docs/agent-runs/TASK-20261127-P2A.md',
      '+Hello safe sandbox run',
    ].join('\n');
    const cleanRes = scanDiffForPolicyViolations(cleanDiff);
    assert.equal(cleanRes.passed, true);
    assert.equal(cleanRes.changedFileCount, 1);

    const hostileDiff = [
      'diff --git a/scripts/bad-migration.sql b/scripts/bad-migration.sql',
      '+++ b/scripts/bad-migration.sql',
      '+ALTER TABLE dbo.gas_oders ADD hacked INT;',
      'diff --git a/api/leaked.js b/api/leaked.js',
      '+++ b/api/leaked.js',
      '+const token = "ghp_1234567890abcdefghij1234567890";',
      'diff --git a/app/driver/page.tsx b/app/driver/page.tsx',
      '+++ b/app/driver/page.tsx',
      '+setInterval(() => navigator.geolocation.getCurrentPosition(() => {}), 5000);',
      'diff --git a/android/MainActivity.java b/android/MainActivity.java',
      '+++ b/android/MainActivity.java',
      '+requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION}, 100);',
    ].join('\n');
    const hostileRes = scanDiffForPolicyViolations(hostileDiff);
    assert.equal(hostileRes.passed, false);
    const codes = hostileRes.violations.map((v) => v.code);
    assert.ok(codes.includes('DIFF_LEGACY_ERP_DDL'));
    assert.ok(codes.includes('SECRET_GITHUB_PAT'));
    assert.ok(codes.includes('DIFF_DRIVER_GPS_POLLING'));
    assert.ok(codes.includes('DIFF_DRIVER_PERMISSION_POPUP'));

    const tooManyFilesRes = scanDiffForPolicyViolations(hostileDiff, { maxChangedFiles: 2 });
    assert.ok(tooManyFilesRes.violations.some((v) => v.code === 'DIFF_MAX_CHANGED_FILES_EXCEEDED'));
  });

  it('renderTaskRunDossier, renderPrBody, and CLI --prepare-run produce complete auditable markdown', () => {
    const payload = makeDispatchPayload({ effectiveRiskLevel: 'L3', requiresBossApproval: true });
    const dossier = renderTaskRunDossier(payload, { githubRunId: 'run-999' });
    const prBody = renderPrBody(payload, { githubRunId: 'run-999' });

    assert.ok(dossier.includes('TASK-20261127-P2A'));
    assert.ok(dossier.includes('LEGACY_ERP_WRITE_ENABLED=false'));
    assert.ok(prBody.includes('SuperAdmin 最終核准'));
    assert.ok(prBody.includes(SUPERADMIN_TELEGRAM_ID));

    const tmpDir = fs.mkdtempSync(path.join(ROOT, '.tmp-sl-phase2-'));
    const payloadFile = path.join(tmpDir, 'payload.json');
    const dossierOut = path.join(tmpDir, 'dossier.md');
    const prBodyOut = path.join(tmpDir, 'pr.md');
    try {
      fs.writeFileSync(payloadFile, JSON.stringify(payload), 'utf8');

      execFileSync(
        process.execPath,
        [
          path.join(ROOT, 'scripts', 'dev-agent-executor.mjs'),
          '--prepare-run',
          '--payload-file',
          payloadFile,
          '--dossier-out',
          dossierOut,
          '--pr-body-out',
          prBodyOut,
        ],
        { encoding: 'utf8' }
      );

      assert.ok(fs.readFileSync(dossierOut, 'utf8').includes('TASK-20261127-P2A'));
      assert.ok(fs.readFileSync(prBodyOut, 'utf8').includes('Directive #4'));
    } finally {
      for (const f of [payloadFile, dossierOut, prBodyOut]) {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      }
      if (fs.existsSync(tmpDir)) fs.rmdirSync(tmpDir);
    }
  });
});
