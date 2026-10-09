import test from 'node:test';
import assert from 'node:assert/strict';
import { getAiCandidates } from '../api/_ai-rotator.js';

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
