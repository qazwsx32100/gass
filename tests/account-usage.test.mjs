import test from 'node:test';
import assert from 'node:assert/strict';
import { activeAccountsOnly, getAccountUsage } from '../src/utils/accountUsage.js';

test('counts account transactions and budgets before deletion', () => {
  const usage = getAccountUsage('6101', {
    incomes: [{ accountCode: '6101' }],
    expenses: [{ accountCode: '6101' }, { accountCode: '6102' }],
    budgets: [{ accountCode: '6101' }],
    accounts: [{ code: '6101' }]
  });
  assert.equal(usage.transactionCount, 2);
  assert.equal(usage.budgetCount, 1);
  assert.equal(usage.canDelete, false);
});

test('parent accounts with children cannot be deleted', () => {
  const usage = getAccountUsage('6101', {
    accounts: [{ code: '6101' }, { code: '610101', parentCode: '6101' }]
  });
  assert.equal(usage.childCount, 1);
  assert.equal(usage.canDelete, false);
});

test('prefix-based legacy children also protect their parent from deletion', () => {
  const usage = getAccountUsage('6101', {
    accounts: [{ code: '6101' }, { code: '610101' }]
  });
  assert.equal(usage.childCount, 1);
  assert.equal(usage.canDelete, false);
});

test('disabled accounts are excluded from new transaction selection', () => {
  assert.equal(activeAccountsOnly({ disabled: false }), true);
  assert.equal(activeAccountsOnly({}), true);
  assert.equal(activeAccountsOnly({ disabled: true }), false);
});
