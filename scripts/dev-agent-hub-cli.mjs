#!/usr/bin/env node
/**
 * scripts/dev-agent-hub-cli.mjs
 * 盛隆瓦斯 — 多代理 AI 協作中心命令列工具 (CLI)
 *
 * 用法範例：
 *   node scripts/dev-agent-hub-cli.mjs --prompt "新增 LINE 詢價測試" --repo qazwsx32100/gass --dry-run
 *   node scripts/dev-agent-hub-cli.mjs --prompt "..." --bridge-url https://gass-plum.vercel.app/api/dev-agent-dispatch
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCollaborativeSession, dispatchTaskToBridge } from '../api/_dev-agent-hub.js';

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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const prompt = String(args.prompt || '').trim();
  if (!prompt) {
    console.error('Usage: node scripts/dev-agent-hub-cli.mjs --prompt "<需求描述>" [--repo qazwsx32100/gass] [--dry-run] [--bridge-url <url>]');
    process.exit(1);
  }

  const repository = String(args.repo || 'qazwsx32100/gass').trim();
  const dryRun = Boolean(args['dry-run']);
  const preferredProviders = args.providers ? String(args.providers).split(',').map((s) => s.trim()).filter(Boolean) : [];

  const session = await runCollaborativeSession({
    prompt,
    repository,
    dryRun,
    preferredProviders,
  });

  if (!session.ok) {
    console.error('❌ 協作中心拒絕輸入:', session.error);
    process.exit(1);
  }

  console.log('\n🧠 【盛隆多代理 AI 協作中心討論摘要】');
  console.log(`- Task ID: ${session.taskId}`);
  console.log(`- 角色模型分配:`, JSON.stringify(session.roleAssignments));
  for (const turn of session.discussionTranscript) {
    console.log(`  [Round ${turn.round} | ${turn.role} | ${turn.model}] ${turn.summary}`);
  }

  if (!session.preflightPolicy.allowed || session.taskPayload.consensus.status !== 'approved') {
    console.error('\n🛡️ 紅線攔截：未達共識或觸犯最高指令護欄，已中止派發！');
    console.error(JSON.stringify({ consensus: session.taskPayload.consensus, policy: session.preflightPolicy }, null, 2));
    process.exit(2);
  }

  console.log('\n📦 已產出標準 JSON v1.0 工單：');
  console.log(JSON.stringify(session.taskPayload, null, 2));

  if (args['bridge-url']) {
    const bridgeToken = process.env.DEV_AGENT_BRIDGE_TOKEN || '';
    const webhookSecret = process.env.DEV_AGENT_WEBHOOK_SECRET || '';
    if (!bridgeToken || !webhookSecret) {
      console.error('❌ 使用 --bridge-url 時必須設定 DEV_AGENT_BRIDGE_TOKEN 與 DEV_AGENT_WEBHOOK_SECRET 環境變數');
      process.exit(1);
    }

    const res = await dispatchTaskToBridge({
      taskPayload: session.taskPayload,
      bridgeUrl: String(args['bridge-url']),
      bridgeToken,
      webhookSecret,
    });
    console.log('\n🌉 執行橋樑回應：', JSON.stringify(res, null, 2));
    if (res.status < 200 || res.status >= 300) {
      process.exit(1);
    }
  }
}

const currentFile = fileURLToPath(import.meta.url);
const isMain =
  Boolean(process.argv[1]) &&
  (process.platform === 'win32'
    ? path.resolve(process.argv[1]).toLowerCase() === path.resolve(currentFile).toLowerCase()
    : path.resolve(process.argv[1]) === path.resolve(currentFile));

if (isMain) {
  main().catch((err) => {
    console.error('❌ Hub CLI Error:', err.message);
    process.exit(1);
  });
}
