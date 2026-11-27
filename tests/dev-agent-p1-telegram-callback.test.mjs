/**
 * tests/dev-agent-p1-telegram-callback.test.mjs
 * 盛隆瓦斯 — P1 收尾驗證：Telegram 按鈕回調 (dev_approve / dev_reject) 嚴格 SuperAdmin (8862712587) 授權與就地編輯卡片測試
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SUPERADMIN_TELEGRAM_ID,
  TASK_STATES,
} from '../api/_dev-agent-protocol.js';
import {
  parseDevAgentCallbackData,
  handleDevAgentTelegramCallback,
} from '../api/_dev-agent-audit.js';
import { createDevAgentApprovalHandler } from '../api/dev-agent-approval.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const BRIDGE_TOKEN = 'p1-tg-cb-bridge-token';
const WEBHOOK_SECRET = 'p1-tg-cb-hmac-secret';
const FIXED_NOW_MS = Date.parse('2026-11-28T00:05:00+08:00');

describe('P1: Telegram Multi-Agent L3 Callback Handler', () => {
  it('parseDevAgentCallbackData parses approve/reject callback strings accurately', () => {
    assert.deepEqual(parseDevAgentCallbackData('dev_approve:TASK-20261127-7E9206:5'), {
      action: 'approve',
      taskId: 'TASK-20261127-7E9206',
      prNumber: 5,
    });
    assert.deepEqual(parseDevAgentCallbackData('dev_reject:TASK-20261127-7E9206:5'), {
      action: 'reject',
      taskId: 'TASK-20261127-7E9206',
      prNumber: 5,
    });
    assert.equal(parseDevAgentCallbackData('act:ack_order:123'), null);
  });

  it('blocks non-Boss Telegram user clicking dev_approve button with 403 SUPERADMIN_ONLY alert', async () => {
    let alertShown = false;
    let mergeCalled = false;

    const approvalHandler = createDevAgentApprovalHandler({
      env: {
        DEV_AGENT_BRIDGE_TOKEN: BRIDGE_TOKEN,
        DEV_AGENT_WEBHOOK_SECRET: WEBHOOK_SECRET,
        DEV_AGENT_AUTO_MERGE_ENABLED: 'true',
        GITHUB_ACTIONS_PAT: 'mock-pat',
      },
      fetchFn: async () => {
        mergeCalled = true;
        return { status: 200, json: async () => ({ merged: true }) };
      },
      now: () => FIXED_NOW_MS,
    });

    const result = await handleDevAgentTelegramCallback({
      cb: { id: 'cb-impostor', data: 'dev_approve:TASK-20261127-7E9206:5' },
      token: 'mock-tg-token',
      chatId: '9999999',
      fromId: '9999999',
      messageId: 101,
      originalText: '原本審核卡',
      env: {
        DEV_AGENT_BRIDGE_TOKEN: BRIDGE_TOKEN,
        DEV_AGENT_WEBHOOK_SECRET: WEBHOOK_SECRET,
      },
      approvalHandler,
      answerCallbackFn: async (_t, _id, _txt, showAlert) => {
        alertShown = showAlert;
      },
      editMessageFn: async () => {
        throw new Error('Should not edit message on unauthorized click');
      },
      now: () => FIXED_NOW_MS,
    });

    assert.equal(result.handled, true);
    assert.equal(result.httpStatus, 403);
    assert.equal(result.body.code, 'SUPERADMIN_ONLY');
    assert.equal(alertShown, true);
    assert.equal(mergeCalled, false);
  });

  it('allows Boss (8862712587) to approve & squash-merge PR #5 and strips action buttons while keeping PR URL', async () => {
    let editedText = '';
    let editedMarkup = null;
    let mergeCalls = 0;

    const approvalHandler = createDevAgentApprovalHandler({
      env: {
        DEV_AGENT_BRIDGE_TOKEN: BRIDGE_TOKEN,
        DEV_AGENT_WEBHOOK_SECRET: WEBHOOK_SECRET,
        DEV_AGENT_AUTO_MERGE_ENABLED: 'true',
        GITHUB_ACTIONS_PAT: 'mock-pat',
      },
      fetchFn: async (url) => {
        if (url.includes('/pulls/5/merge')) {
          mergeCalls += 1;
          return { status: 200, json: async () => ({ merged: true, sha: 'abcdef1234567' }) };
        }
        throw new Error(`Unexpected URL: ${url}`);
      },
      now: () => FIXED_NOW_MS,
    });

    const cb = {
      id: 'cb-boss-ok',
      data: 'dev_approve:TASK-20261127-7E9206:5',
      message: {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔍 檢視 PR 變更', url: 'https://github.com/qazwsx32100/gass/pull/5' }],
            [
              { text: '✅ 核准並合併 main', callback_data: 'dev_approve:TASK-20261127-7E9206:5' },
              { text: '🛑 駁回退回', callback_data: 'dev_reject:TASK-20261127-7E9206:5' },
            ],
          ],
        },
      },
    };

    const res = await handleDevAgentTelegramCallback({
      cb,
      token: 'mock-tg-token',
      chatId: SUPERADMIN_TELEGRAM_ID,
      fromId: SUPERADMIN_TELEGRAM_ID,
      messageId: 202,
      originalText: '原本 PR #5 審核卡',
      env: {
        DEV_AGENT_BRIDGE_TOKEN: BRIDGE_TOKEN,
        DEV_AGENT_WEBHOOK_SECRET: WEBHOOK_SECRET,
      },
      approvalHandler,
      answerCallbackFn: async () => {},
      editMessageFn: async (_cid, _mid, text, opts) => {
        editedText = text;
        editedMarkup = opts.replyMarkup;
      },
      now: () => FIXED_NOW_MS,
    });

    assert.equal(res.handled, true);
    assert.equal(res.httpStatus, 200);
    assert.equal(res.body.ok, true);
    assert.equal(mergeCalls, 1);
    assert.ok(editedText.includes('老闆已核准'));
    assert.ok(editedText.includes('abcdef1'));
    assert.equal(editedMarkup.inline_keyboard.length, 1);
    assert.equal(editedMarkup.inline_keyboard[0][0].url, 'https://github.com/qazwsx32100/gass/pull/5');
  });

  it('allows Boss (8862712587) to reject task cleanly and verifies api/telegram-webhook.js wiring', async () => {
    const approvalHandler = createDevAgentApprovalHandler({
      env: {
        DEV_AGENT_BRIDGE_TOKEN: BRIDGE_TOKEN,
        DEV_AGENT_WEBHOOK_SECRET: WEBHOOK_SECRET,
      },
      now: () => FIXED_NOW_MS,
    });

    let editedText = '';
    const res = await handleDevAgentTelegramCallback({
      cb: { id: 'cb-boss-rej', data: 'dev_reject:TASK-20261127-7E9206:5' },
      token: 'mock-tg-token',
      chatId: SUPERADMIN_TELEGRAM_ID,
      fromId: SUPERADMIN_TELEGRAM_ID,
      messageId: 203,
      originalText: '原本 PR #5 審核卡',
      env: {
        DEV_AGENT_BRIDGE_TOKEN: BRIDGE_TOKEN,
        DEV_AGENT_WEBHOOK_SECRET: WEBHOOK_SECRET,
      },
      approvalHandler,
      answerCallbackFn: async () => {},
      editMessageFn: async (_cid, _mid, text) => {
        editedText = text;
      },
      now: () => FIXED_NOW_MS,
    });

    assert.equal(res.httpStatus, 200);
    assert.equal(res.body.approvalResponse.status, TASK_STATES.REJECTED);
    assert.ok(editedText.includes('老闆已駁回退回'));

    const webhookSrc = fs.readFileSync(path.join(ROOT, 'api', 'telegram-webhook.js'), 'utf8');
    assert.ok(webhookSrc.includes('handleDevAgentTelegramCallback'));
    assert.ok(webhookSrc.includes("data.startsWith('dev_approve:')"));
    assert.ok(webhookSrc.includes("data.startsWith('dev_reject:')"));
  });
});
