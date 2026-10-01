import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTransactionAmount, validateStateTransactionAmounts } from '../src/utils/transactionAmount.js';

test('normalizes integer, decimal, negative, and grouped monetary strings', () => {
  assert.deepEqual(parseTransactionAmount(1250), { ok: true, value: 1250 });
  assert.deepEqual(parseTransactionAmount('1,250'), { ok: true, value: 1250 });
  assert.deepEqual(parseTransactionAmount('-12.5'), { ok: true, value: -12.5 });
});

test('rejects blank, malformed, and non-finite transaction amounts', () => {
  for (const value of ['', '  ', '1,2', 'NT$100', null, undefined, Number.NaN, Infinity]) {
    assert.equal(parseTransactionAmount(value).ok, false, `expected ${String(value)} to be invalid`);
  }
});

test('state write validation requires canonical finite numeric amounts', () => {
  assert.deepEqual(validateStateTransactionAmounts({
    incomes: [{ id: 'I-1', amount: 100 }],
    expenses: [{ id: 'E-1', amount: -25 }]
  }), { ok: true });

  const result = validateStateTransactionAmounts({ incomes: [{ id: 'I-BAD', amount: '100' }] });
  assert.equal(result.ok, false);
  assert.match(result.error, /I-BAD/);
});
