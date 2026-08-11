import test from 'node:test';
import assert from 'node:assert/strict';
import { getTopAmountEntries } from '../src/utils/rankings.js';

test('ranks dashboard income and expense entries by amount', () => {
  const rows = [
    { id: 'small', amount: 1200 },
    { id: 'largest', amount: 9800 },
    { id: 'middle', amount: 4500 },
    { id: 'second', amount: 7200 }
  ];

  assert.deepEqual(
    getTopAmountEntries(rows, 3).map(item => item.id),
    ['largest', 'second', 'middle']
  );
  assert.deepEqual(rows.map(item => item.id), ['small', 'largest', 'middle', 'second']);
});
