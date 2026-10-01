import test from 'node:test';
import assert from 'node:assert/strict';
import { isManualGasCostExpenseEntry, isSystemEstimatedExpenseEntry } from '../src/utils/expensePolicy.js';

test('manual 5101 gas purchase vouchers remain actual expenses', () => {
  assert.equal(isSystemEstimatedExpenseEntry({ accountCode: '5101', amount: 12000 }), false);
  assert.equal(isSystemEstimatedExpenseEntry({ accountCode: '5101', createdBy: 'ADMIN' }), false);
});

test('only explicit system estimates are excluded from cash expenses', () => {
  assert.equal(isSystemEstimatedExpenseEntry({ sourceType: 'system_estimate' }), true);
  assert.equal(isSystemEstimatedExpenseEntry({ syncType: 'gas_cost_estimate' }), true);
  assert.equal(isSystemEstimatedExpenseEntry({ systemEstimated: true }), true);
  assert.equal(isSystemEstimatedExpenseEntry({ syncSource: 'shenglong', accountCode: '5101' }), false);
});

test('formal gas cost uses manual 5101-series vouchers and excludes system estimates', () => {
  assert.equal(isManualGasCostExpenseEntry({ accountCode: '5101', amount: 450937 }), true);
  assert.equal(isManualGasCostExpenseEntry({ accountCode: '51010', amount: 23318 }), true);
  assert.equal(isManualGasCostExpenseEntry({ accountCode: '5101', systemEstimated: true }), false);
  assert.equal(isManualGasCostExpenseEntry({ accountCode: '6101', amount: 21000 }), false);
});
