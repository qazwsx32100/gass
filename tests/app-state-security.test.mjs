import test from 'node:test';
import assert from 'node:assert/strict';
import { secureStateForSave } from '../api/_auth.js';
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
  const settlement = {
    id: 'SET001',
    companyId: 'COMP001',
    date: '2026-07-15',
    sourceType: 'settlement',
    sourceId: approvedIncome.id,
    transactionType: 'income',
    paymentMethod: 'bank_transfer',
    bankId: 'BANK001',
    amount: 1000
  };
  const nextState = {
    ...baseState,
    incomes: [{
      ...approvedIncome,
      paymentStatus: 'paid',
      paidAt: '2026-07-15',
      paidByMethod: 'bank_transfer',
      paidBankId: 'BANK001',
      settlementId: settlement.id,
      remarks: 'approved income (settled)'
    }],
    bankTransactions: [settlement]
  };

  const result = validateStateWriteScope(baseState, nextState, { role: 'admin', id: 'ADMIN' });

  assert.equal(result.ok, true);
});

test('blocks changing the original payment method after approval', () => {
  const nextState = {
    ...baseState,
    incomes: [{ ...approvedIncome, paymentMethod: 'bank_transfer', bankId: 'BANK001' }]
  };

  const result = validateStateWriteScope(baseState, nextState, { role: 'admin', id: 'ADMIN' });

  assert.equal(result.ok, false);
  assert.match(result.error, /cannot be materially changed/i);
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

test('allows bookkeeper to update gas cylinder inventory records', () => {
  const previousState = {
    ...baseState,
    gasCylinders: [],
    gasDeliveryVehicles: [],
    customerCylinderDeposits: []
  };
  const nextState = {
    ...previousState,
    gasCylinders: [{
      id: 'CYL001',
      companyId: 'COMP001',
      cylinderNo: 'CYL-001',
      barcode: 'BC001',
      qrCode: 'QR001',
      specKg: 20,
      status: 'full',
      locationType: 'warehouse'
    }],
    gasDeliveryVehicles: [{
      id: 'VEH001',
      companyId: 'COMP001',
      plateNo: 'ABC-1234',
      capacityCylinders: 20
    }],
    customerCylinderDeposits: [{
      id: 'DEP001',
      companyId: 'COMP001',
      customerName: '測試客戶',
      cylinderSpecKg: 20,
      depositAmount: 2000
    }]
  };

  const result = validateStateWriteScope(previousState, nextState, { role: 'bookkeeper', id: 'BK001' });

  assert.equal(result.ok, true);
});

test('allows admin to create a shareholder account', () => {
  const nextState = {
    ...baseState,
    shareholders: [
      ...baseState.shareholders,
      {
        id: 'SH002',
        name: 'New User',
        email: 'new.user@example.com',
        role: 'bookkeeper',
        password: '1234'
      }
    ]
  };

  const result = validateStateWriteScope(baseState, nextState, { role: 'admin', id: 'ADMIN' });

  assert.equal(result.ok, true);
});

test('hashes new shareholder password before saving app state', () => {
  const secured = secureStateForSave({
    ...baseState,
    adminSecurity: {},
    shareholders: [
      ...baseState.shareholders,
      {
        id: 'SH002',
        name: 'New User',
        email: 'new.user@example.com',
        role: 'bookkeeper',
        password: '1234'
      }
    ]
  }, baseState);

  const created = secured.shareholders.find(item => item.id === 'SH002');

  assert.equal(created.password, undefined);
  assert.ok(created.passwordHash);
  assert.ok(created.passwordSalt);
  assert.equal(created.passwordAlgo, 'pbkdf2_sha256_120000');
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

test('prevents bookkeeper from changing domain and email readiness settings', () => {
  const previousState = {
    ...baseState,
    domainReadiness: { currentUrl: 'https://erp-weld-three-96.vercel.app', emailNotificationsEnabled: false }
  };
  const nextState = {
    ...previousState,
    domainReadiness: { currentUrl: 'https://example.com', emailNotificationsEnabled: true }
  };

  const result = validateStateWriteScope(previousState, nextState, { role: 'bookkeeper', id: 'BK001' });

  assert.equal(result.ok, false);
  assert.match(result.error, /protected data/i);
});
