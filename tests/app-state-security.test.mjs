import test from 'node:test';
import assert from 'node:assert/strict';
import { isAccountSessionAllowed, secureStateForSave } from '../api/_auth.js';
import { getPublicSessionForClient, validateStateWriteScope } from '../api/app-state.js';

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

test('allows an enabled account on an unrecognized device', () => {
  const state = {
    adminSecurity: { disabled: false, approvedDevices: [] },
    shareholders: [{ id: 'SH002', disabled: false, approvedDevices: [] }]
  };

  assert.equal(isAccountSessionAllowed(state, { id: 'ADMIN', deviceId: 'NEW-ADMIN-DEVICE' }), true);
  assert.equal(isAccountSessionAllowed(state, { id: 'SH002', deviceId: 'NEW-USER-DEVICE' }), true);
});

test('still blocks disabled or missing accounts after device approval is removed', () => {
  const state = {
    adminSecurity: { disabled: true },
    shareholders: [{ id: 'SH002', disabled: true }]
  };

  assert.equal(isAccountSessionAllowed(state, { id: 'ADMIN' }), false);
  assert.equal(isAccountSessionAllowed(state, { id: 'SH002' }), false);
  assert.equal(isAccountSessionAllowed(state, { id: 'SH999' }), false);
});

test('blocks material edits to approved income for non-admin', () => {
  const nextState = {
    ...baseState,
    incomes: [{ ...approvedIncome, amount: 999 }]
  };

  const result = validateStateWriteScope(baseState, nextState, { role: 'bookkeeper', id: 'BK001' });

  assert.equal(result.ok, false);
  assert.match(result.error, /cannot be materially changed/i);
});

test('blocks deleting an approved income for non-admin', () => {
  const nextState = {
    ...baseState,
    incomes: []
  };

  const result = validateStateWriteScope(baseState, nextState, { role: 'bookkeeper', id: 'BK001' });

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

test('blocks changing the original payment method after approval for non-admin', () => {
  const nextState = {
    ...baseState,
    incomes: [{ ...approvedIncome, paymentMethod: 'bank_transfer', bankId: 'BANK001' }]
  };

  const result = validateStateWriteScope(baseState, nextState, { role: 'bookkeeper', id: 'BK001' });

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

test('uses the current database role instead of a stale client role', () => {
  const session = getPublicSessionForClient({
    shareholders: [{
      id: 'SH002',
      name: 'Current User',
      email: 'current@example.com',
      role: 'bookkeeper'
    }]
  }, {
    id: 'SH002',
    name: 'Stale User',
    email: 'stale@example.com',
    role: 'admin'
  });

  assert.equal(session.role, 'bookkeeper');
  assert.equal(session.name, 'Current User');
  assert.equal(session.email, 'current@example.com');
});

test('returns the administrator password-change requirement from cloud state', () => {
  const session = getPublicSessionForClient({
    adminSecurity: { requiresPasswordChange: true }
  }, {
    id: 'ADMIN',
    name: 'Owner',
    email: 'owner@example.com',
    role: 'admin'
  });

  assert.equal(session.role, 'admin');
  assert.equal(session.requiresPasswordChange, true);
});

test('allows schema normalization fields and adding new approved expenses without blocking write scope', () => {
  const previousState = {
    ...baseState,
    expenses: [{
      id: 'EXP-OLD-001',
      companyId: 'COMP001',
      date: '2026-07-01',
      amount: 500,
      status: 'approved',
      remarks: 'old expense'
    }]
  };

  const nextState = {
    ...previousState,
    expenses: [
      {
        ...previousState.expenses[0],
        taxType: 'taxable',
        taxIncluded: true,
        vatAmount: null,
        unitPrice: 0,
        quantity: 0,
        calculatedAmount: 0,
        gasKg: 0,
        isEffectiveForReport: true
      },
      {
        id: 'EXP-NEW-002',
        companyId: 'COMP001',
        date: '2026-10-01',
        accountCode: '5101',
        amount: 1500,
        status: 'approved',
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        remarks: 'newly added approved expense'
      }
    ]
  };

  const result = validateStateWriteScope(previousState, nextState, { role: 'admin', id: 'ADMIN' });
  assert.equal(result.ok, true);
});

test('allows non-admin to register expense when prior periods are locked and historical schema fields are normalized', () => {
  const previousState = {
    ...baseState,
    periodLocks: [{ yearMonth: '2026-07', locked: true }],
    expenses: [{
      id: 'EXP-OLD-001',
      companyId: 'COMP001',
      date: '2026-07-01',
      amount: 500,
      status: 'approved',
      remarks: 'old expense'
    }]
  };

  const nextState = {
    ...previousState,
    expenses: [
      {
        ...previousState.expenses[0],
        taxType: 'taxable',
        taxIncluded: true,
        vatAmount: null,
        effectiveForReport: true
      },
      {
        id: 'EXP-NEW-002',
        companyId: 'COMP001',
        date: '2026-10-02',
        accountCode: '6103',
        amount: 800,
        status: 'approved',
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        remarks: 'new October expense'
      }
    ]
  };

  const result = validateStateWriteScope(previousState, nextState, { role: 'bookkeeper', id: 'BK001' });
  assert.equal(result.ok, true);
});

test('allows non-admin to register expense when arbitrary new/unlisted schema metadata fields exist on approved historical transactions', () => {
  const previousState = {
    ...baseState,
    expenses: [{
      id: 'EXP-OLD-001',
      companyId: 'COMP001',
      date: '2026-07-01',
      amount: 500,
      paymentMethod: 'cash',
      status: 'approved',
      remarks: 'old expense'
    }]
  };

  const nextState = {
    ...previousState,
    expenses: [
      {
        ...previousState.expenses[0],
        customerType: 'VIP',
        checkNo: 'CK1234',
        checkDueDate: '2026-08-01',
        createdByName: '記帳員',
        createdByRole: 'bookkeeper',
        entryNature: 'operating',
        futureCustomField2027: 'safe_metadata',
        returnedBy: null,
        returnedByName: null,
        effectiveForReport: true
      },
      {
        id: 'EXP-NEW-003',
        companyId: 'COMP001',
        date: '2026-10-02',
        accountCode: '6101',
        amount: 1200,
        status: 'approved',
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        remarks: 'new expense with arbitrary metadata on older items'
      }
    ]
  };

  const result = validateStateWriteScope(previousState, nextState, { role: 'bookkeeper', id: 'BK001' });
  assert.equal(result.ok, true);
});

test('allows non-admin to sync when empty/null collections differ in serialization', () => {
  const previousState = {
    ...baseState,
    loans: undefined,
    adminSecurity: null,
    domainReadiness: {}
  };

  const nextState = {
    ...baseState,
    loans: [],
    adminSecurity: {},
    domainReadiness: null,
    expenses: [
      {
        id: 'EXP-NEW-004',
        companyId: 'COMP001',
        date: '2026-10-02',
        accountCode: '6101',
        amount: 300,
        status: 'approved',
        paymentMethod: 'cash',
        paymentStatus: 'paid'
      }
    ]
  };

  const result = validateStateWriteScope(previousState, nextState, { role: 'bookkeeper', id: 'BK001' });
  assert.equal(result.ok, true);
});

test('allows non-admin to update when journal entries and lines are present in state', () => {
  const previousState = {
    ...baseState,
    journalEntries: [{ id: 'J-001', amount: 500 }],
    journalLines: [{ id: 'JL-001', lineNo: 1 }]
  };

  const nextState = {
    ...previousState,
    journalEntries: [{ id: 'J-001', amount: 500 }, { id: 'J-002', amount: 800 }],
    journalLines: [{ id: 'JL-001', lineNo: 1 }, { id: 'JL-002', lineNo: 1 }],
    expenses: [
      {
        id: 'EXP-NEW-005',
        companyId: 'COMP001',
        date: '2026-10-02',
        accountCode: '6101',
        amount: 800,
        status: 'approved',
        paymentMethod: 'cash',
        paymentStatus: 'paid'
      }
    ]
  };

  const result = validateStateWriteScope(previousState, nextState, { role: 'bookkeeper', id: 'BK001' });
  assert.equal(result.ok, true);
});

