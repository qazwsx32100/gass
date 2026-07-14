import test from 'node:test';
import assert from 'node:assert/strict';
import { validateStateWriteScope } from '../api/app-state.js';

const approvedIncome = {
  id: 'REV-APPROVED-001',
  companyId: 'COMP001',
  date: '2026-07-14',
  accountCode: '4101',
  amount: 1000,
  status: 'approved',
  paymentMethod: 'receivable',
  paymentStatus: 'unpaid',
  remarks: 'approved income'
};

const baseState = {
  incomes: [approvedIncome],
  expenses: [],
  shareholders: [{ id: 'SH001', name: 'Owner' }],
  logs: []
};

test('blocks material edits to approved income even for admin', () => {
  const nextState = {
    ...baseState,
    incomes: [{ ...approvedIncome, amount: 999 }]
  };

  const result = validateStateWriteScope(baseState, nextState, { role: 'admin', id: 'ADMIN' });

  assert.equal(result.ok, false);
  assert.match(result.error, /cannot be materially changed/i);
});

test('blocks deleting an approved income', () => {
  const nextState = {
    ...baseState,
    incomes: []
  };

  const result = validateStateWriteScope(baseState, nextState, { role: 'admin', id: 'ADMIN' });

  assert.equal(result.ok, false);
  assert.match(result.error, /cannot be deleted/i);
});

test('allows settlement fields on approved income', () => {
  const nextState = {
    ...baseState,
    incomes: [{
      ...approvedIncome,
      paymentMethod: 'bank_transfer',
      bankId: 'BANK001',
      paymentStatus: 'paid',
      remarks: 'approved income (settled)'
    }]
  };

  const result = validateStateWriteScope(baseState, nextState, { role: 'admin', id: 'ADMIN' });

  assert.equal(result.ok, true);
});

test('prevents bookkeeper from changing protected shareholder data', () => {
  const nextState = {
    ...baseState,
    shareholders: [{ id: 'SH001', name: 'Changed' }]
  };

  const result = validateStateWriteScope(baseState, nextState, { role: 'bookkeeper', id: 'BK001' });

  assert.equal(result.ok, false);
  assert.match(result.error, /protected data/i);
});

test('prevents bookkeeper from changing database table migration plan', () => {
  const previousState = {
    ...baseState,
    databaseTablePlan: [{ id: 'DBT_LEDGER', status: 'planned' }]
  };
  const nextState = {
    ...previousState,
    databaseTablePlan: [{ id: 'DBT_LEDGER', status: 'done' }]
  };

  const result = validateStateWriteScope(previousState, nextState, { role: 'bookkeeper', id: 'BK001' });

  assert.equal(result.ok, false);
  assert.match(result.error, /protected data/i);
});
