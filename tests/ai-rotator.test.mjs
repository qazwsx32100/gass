import test from 'node:test';
import assert from 'node:assert/strict';
import { getAiCandidates, buildAccountQueue, resetRotationPointer } from '../api/_ai-rotator.js';

test('AI Rotator: getAiCandidates returns fallback accounts with correct priorities', async () => {
  const candidates = await getAiCandidates();
  assert.ok(Array.isArray(candidates));
  assert.ok(candidates.length >= 4);

  const acc1 = candidates.find(c => c.id === 'acc-1');
  const acc4 = candidates.find(c => c.id === 'acc-4');

  assert.equal(acc1?.name, 'qaz');
  assert.equal(acc1?.provider, 'gemini');
  assert.equal(acc1?.priority, 1);

  assert.equal(acc4?.name, 'OpenAI (備援防線)');
  assert.equal(acc4?.provider, 'openai');
  assert.equal(acc4?.priority, 99);
});

test('AI Rotator: priorities guarantee Gemini runs before OpenAI fallback', async () => {
  const candidates = await getAiCandidates();
  const geminiAccounts = candidates.filter(c => c.provider === 'gemini');
  const openaiAccounts = candidates.filter(c => c.provider === 'openai');

  for (const gem of geminiAccounts) {
    for (const oai of openaiAccounts) {
      assert.ok(gem.priority < oai.priority, `Gemini (${gem.priority}) should have higher priority than OpenAI (${oai.priority})`);
    }
  }
});

test('AI Rotator: buildAccountQueue implements True Round-Robin (真輪調) across Gemini accounts', async () => {
  const candidates = [
    { id: 'acc-1', name: 'qaz', provider: 'gemini', enabled: true, priority: 1 },
    { id: 'acc-2', name: '無名', provider: 'gemini', enabled: true, priority: 2 },
    { id: 'acc-3', name: '神燈', provider: 'gemini', enabled: true, priority: 3 },
    { id: 'acc-4', name: 'OpenAI (備援防線)', provider: 'openai', enabled: true, priority: 99 }
  ];

  resetRotationPointer(0);

  // Request 1: should lead with qaz
  const q1 = buildAccountQueue(candidates, 'round-robin');
  assert.equal(q1[0].name, 'qaz');
  assert.equal(q1[1].name, '無名');
  assert.equal(q1[2].name, '神燈');
  assert.equal(q1[3].name, 'OpenAI (備援防線)');

  // Request 2: should lead with 無名
  const q2 = buildAccountQueue(candidates, 'round-robin');
  assert.equal(q2[0].name, '無名');
  assert.equal(q2[1].name, '神燈');
  assert.equal(q2[2].name, 'qaz');
  assert.equal(q2[3].name, 'OpenAI (備援防線)');

  // Request 3: should lead with 神燈
  const q3 = buildAccountQueue(candidates, 'round-robin');
  assert.equal(q3[0].name, '神燈');
  assert.equal(q3[1].name, 'qaz');
  assert.equal(q3[2].name, '無名');
  assert.equal(q3[3].name, 'OpenAI (備援防線)');

  // Request 4: wraps back to qaz
  const q4 = buildAccountQueue(candidates, 'round-robin');
  assert.equal(q4[0].name, 'qaz');
  assert.equal(q4[1].name, '無名');
  assert.equal(q4[2].name, '神燈');
  assert.equal(q4[3].name, 'OpenAI (備援防線)');
});

test('AI Rotator: buildAccountQueue automatically skips accounts in cooldown', async () => {
  const future = Date.now() + 60_000;
  const candidatesWithCooldown = [
    { id: 'acc-1', name: 'qaz', provider: 'gemini', enabled: true, priority: 1, status: 'cooldown', cooldownUntil: future },
    { id: 'acc-2', name: '無名', provider: 'gemini', enabled: true, priority: 2 },
    { id: 'acc-3', name: '神燈', provider: 'gemini', enabled: true, priority: 3 },
    { id: 'acc-4', name: 'OpenAI (備援防線)', provider: 'openai', enabled: true, priority: 99 }
  ];

  resetRotationPointer(0);

  // Active pool has 2 items: 無名, 神燈
  const q1 = buildAccountQueue(candidatesWithCooldown, 'round-robin');
  assert.equal(q1[0].name, '無名');
  assert.equal(q1[1].name, '神燈');
  assert.equal(q1[2].name, 'OpenAI (備援防線)');

  const q2 = buildAccountQueue(candidatesWithCooldown, 'round-robin');
  assert.equal(q2[0].name, '神燈');
  assert.equal(q2[1].name, '無名');
  assert.equal(q2[2].name, 'OpenAI (備援防線)');
});

