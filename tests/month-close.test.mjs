import test from 'node:test';
import assert from 'node:assert/strict';
import { compareMonthlyBaseline, getLatestRestoreDrillStatus, validateRestoreDrill } from '../src/utils/monthClose.js';

test('blank old-system baseline does not block monthly close', () => {
  const result = compareMonthlyBaseline({ actualRevenue: 100, actualExpenses: 50, actualReceivables: 20 });
  assert.equal(result.hasBaseline, false);
  assert.equal(result.mismatchCount, 0);
});

test('monthly baseline reports each old/new mismatch', () => {
  const result = compareMonthlyBaseline({
    expectedRevenue: '100',
    expectedExpenses: '55',
    expectedReceivables: '20',
    actualRevenue: 100,
    actualExpenses: 50,
    actualReceivables: 25
  });
  assert.equal(result.mismatchCount, 2);
  assert.deepEqual(result.rows.map(row => row.difference), [0, -5, 5]);
});

test('restore drill must be passed within 90 days', () => {
  const now = new Date('2026-09-23T00:00:00Z');
  const recent = getLatestRestoreDrillStatus([{ id: 'A', result: 'passed', verifiedAt: '2026-09-01T00:00:00Z' }], now);
  const stale = getLatestRestoreDrillStatus([{ id: 'B', result: 'passed', verifiedAt: '2026-05-01T00:00:00Z' }], now);
  assert.equal(recent.recent, true);
  assert.equal(stale.recent, false);
});

test('a passed restore drill requires identity and all verification checks', () => {
  const invalid = validateRestoreDrill({ result: 'passed', backupId: '', operator: '' });
  assert.equal(invalid.valid, false);
  assert.equal(invalid.errors.length, 6);

  const valid = validateRestoreDrill({
    result: 'passed',
    backupId: 'BKP001',
    operator: '管理員',
    recordCountsVerified: true,
    loginVerified: true,
    reportsVerified: true,
    rollbackVerified: true
  });
  assert.equal(valid.valid, true);
});
