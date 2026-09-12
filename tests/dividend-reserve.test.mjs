import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateDividendReserve } from '../src/utils/dividendReserve.js';

test('custom reserve amount overrides the percentage exactly', () => {
  assert.deepEqual(calculateDividendReserve(33287, 0.1, 5000), {
    reserveAmount: 5000,
    reserveRatio: 5000 / 33287,
    reserveMode: 'amount',
    totalDividends: 28287
  });
});

test('percentage is used when no custom amount is provided', () => {
  assert.deepEqual(calculateDividendReserve(33287, 0.1), {
    reserveAmount: 3329,
    reserveRatio: 3329 / 33287,
    reserveMode: 'ratio',
    totalDividends: 29958
  });
});

test('custom reserve amount is clamped to available profit', () => {
  assert.equal(calculateDividendReserve(1000, 0.1, 5000).reserveAmount, 1000);
});
