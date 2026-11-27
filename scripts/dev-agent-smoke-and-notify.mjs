#!/usr/bin/env node
/**
 * scripts/dev-agent-smoke-and-notify.mjs
 * 盛隆瓦斯 — 第三階段 CI/CD 煙霧驗證與老闆 L3 簽核推播 CLI
 *
 * 用法：
 *  1. 線上煙霧驗證（防 SSRF 僅限 *.vercel.app）：
 *     node scripts/dev-agent-smoke-and-notify.mjs --smoke-url https://gass-plum.vercel.app
 *  2. PR 就緒推播給老闆（需設定 DEV_AGENT_APPROVAL_URL、DEV_AGENT_BRIDGE_TOKEN、DEV_AGENT_WEBHOOK_SECRET）：
 *     node scripts/dev-agent-smoke-and-notify.mjs --notify-boss --task-id TASK-20261127-001 --pr-url https://github.com/...
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchWithTimeout } from '../api/_fetch.js';
import { signDevAgentRequest } from '../api/_dev-agent-protocol.js';
import { isAllowedSmokeTargetUrl } from '../api/_dev-agent-audit.js';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const k = token.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        out[k] = true;
      } else {
        out[k] = next;
        i += 1;
      }
    }
  }
  return out;
}

export async function runSmokeCheck(baseUrl, { endpoints = ['/api/dev-agent-dispatch', '/api/dev-agent-hub'], fetchFn = fetchWithTimeout } = {}) {
  if (!isAllowedSmokeTargetUrl(baseUrl)) {
    throw new Error(`Invalid smoke target URL (HTTPS *.vercel.app required): ${baseUrl}`);
  }
  const cleanBase = baseUrl.replace(/\/$/, '');
  const results = [];
  for (const ep of endpoints) {
    const res = await fetchFn(`${cleanBase}${ep}`, { method: 'GET' }, 10000);
    results.push({ endpoint: ep, status: res.status, ok: res.status >= 200 && res.status < 300 });
  }
  return {
    passed: results.every((r) => r.ok),
    results,
  };
}

export async function notifyBossPrReady(
  payload,
  { approvalUrl, bridgeToken, webhookSecret, fetchFn = fetchWithTimeout, now = () => Date.now() }
) {
  const body = { action: 'notify_pr_ready', ...payload };
  const rawBody = JSON.stringify(body);
  const timestamp = Math.floor(now() / 1000);
  const signature = signDevAgentRequest({ secret: webhookSecret, timestamp, rawBody });

  const res = await fetchFn(
    approvalUrl,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bridgeToken}`,
        'X-Agent-Timestamp': String(timestamp),
        'X-Agent-Signature-256': signature,
      },
      body: rawBody,
    },
    12000
  );
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args['smoke-url']) {
    const report = await runSmokeCheck(String(args['smoke-url']));
    console.log(JSON.stringify(report, null, 2));
    if (!report.passed) {
      process.exit(1);
    }
    return;
  }

  if (args['notify-boss']) {
    const approvalUrl = String(args['approval-url'] || process.env.DEV_AGENT_APPROVAL_URL || '').trim();
    const bridgeToken = String(process.env.DEV_AGENT_BRIDGE_TOKEN || '').trim();
    const webhookSecret = String(process.env.DEV_AGENT_WEBHOOK_SECRET || '').trim();

    if (!approvalUrl || !bridgeToken || !webhookSecret) {
      console.log('ℹ️ 尚未配置 DEV_AGENT_APPROVAL_URL / DEV_AGENT_BRIDGE_TOKEN / DEV_AGENT_WEBHOOK_SECRET，略過自動推播。');
      return;
    }

    const res = await notifyBossPrReady(
      {
        taskId: String(args['task-id'] || ''),
        repository: String(args.repo || 'qazwsx32100/gass'),
        featureBranch: String(args.branch || ''),
        effectiveRiskLevel: String(args['risk-level'] || 'L2'),
        objectiveTitle: String(args.title || '多代理自動化 PR'),
        prNumber: args['pr-number'] ? Number(args['pr-number']) : null,
        prUrl: String(args['pr-url'] || ''),
        previewUrl: String(args['preview-url'] || ''),
      },
      { approvalUrl, bridgeToken, webhookSecret }
    );
    console.log(JSON.stringify(res, null, 2));
    if (res.status < 200 || res.status >= 300) {
      process.exit(1);
    }
    return;
  }

  console.error('Usage: node scripts/dev-agent-smoke-and-notify.mjs (--smoke-url <url> | --notify-boss ...)');
  process.exit(1);
}

const currentFile = fileURLToPath(import.meta.url);
const isMain =
  Boolean(process.argv[1]) &&
  (process.platform === 'win32'
    ? path.resolve(process.argv[1]).toLowerCase() === path.resolve(currentFile).toLowerCase()
    : path.resolve(process.argv[1]) === path.resolve(currentFile));

if (isMain) {
  main().catch((err) => {
    console.error('❌ Smoke/Notify CLI Error:', err.message);
    process.exit(1);
  });
}
