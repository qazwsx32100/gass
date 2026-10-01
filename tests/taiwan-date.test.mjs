import test from 'node:test';
import assert from 'node:assert/strict';
import { getTaiwanDateString } from '../src/utils/taiwanDate.js';

test('returns Taiwan calendar date rather than UTC date near midnight', () => {
  assert.equal(getTaiwanDateString(new Date('2026-09-25T16:30:00.000Z')), '2026-09-26');
  assert.equal(getTaiwanDateString(new Date('2026-09-26T02:00:00.000Z')), '2026-09-26');
});
