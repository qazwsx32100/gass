import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildReceivableSettlementAllocations,
  calculateReceivablesByOriginMonth,
  RECEIVABLE_TYPES
} from '../src/utils/receivables.js';

const companyId = 'COMPANY-1';
const income = (id, date, amount, receivableType, extra = {}) => ({
  id,
  companyId,
  date,
  amount,
  receivableType,
  paymentStatus: 'unpaid',
  paymentMethod: 'receivable',
  status: 'approved',
  ...extra
});

test('legacy imported collections do not offset open balances from another month', () => {
  const incomes = [
    income('JUL-M', '2026-07-18', 47175, RECEIVABLE_TYPES.MONTHLY, { syncType: 'receivable_opening' }),
    income('JUL-D', '2026-07-19', 1230, RECEIVABLE_TYPES.CURRENT_DEBT, { syncType: 'receivable_opening' }),
    income('AUG-M', '2026-08-03', 12980, RECEIVABLE_TYPES.MONTHLY, { syncType: 'receivable_opening' }),
    income('AUG-D', '2026-08-07', 1880, RECEIVABLE_TYPES.CURRENT_DEBT, { syncType: 'receivable_opening' })
  ];
  const bankTransactions = [{
    id: 'SL-SYNC-SET-monthly-1',
    companyId,
    date: '2026-07-01',
    actualPaymentDate: '2026-08-08',
    amount: 22555,
    settlementCategory: RECEIVABLE_TYPES.MONTHLY,
    direction: 'in',
    sourceType: 'settlement',
    status: 'approved',
    syncSource: 'shenglong'
  }];

  const july = calculateReceivablesByOriginMonth({ companyId, originMonth: '2026-07', incomes, bankTransactions });
  const august = calculateReceivablesByOriginMonth({ companyId, originMonth: '2026-08', incomes, bankTransactions });

  assert.equal(july.monthly.outstandingAmount, 47175);
  assert.equal(july.currentDebt.outstandingAmount, 1230);
  assert.equal(august.monthly.outstandingAmount, 12980);
  assert.equal(august.currentDebt.outstandingAmount, 1880);
});

test('a later collection is allocated back to the receivable origin month', () => {
  const incomes = [income('JUL-M', '2026-07-31', 5000, RECEIVABLE_TYPES.MONTHLY)];
  const allocation = buildReceivableSettlementAllocations({
    companyId,
    asOfDate: '2026-08-10',
    type: RECEIVABLE_TYPES.MONTHLY,
    amount: 2000,
    incomes,
    bankTransactions: []
  });
  const bankTransactions = [{
    id: 'AUG-PAYMENT',
    companyId,
    date: '2026-08-10',
    amount: 2000,
    settlementCategory: RECEIVABLE_TYPES.MONTHLY,
    receivableAllocations: allocation.allocations,
    direction: 'in',
    sourceType: 'settlement',
    status: 'approved'
  }];

  const july = calculateReceivablesByOriginMonth({
    companyId,
    asOfDate: '2026-08-10',
    originMonth: '2026-07',
    incomes,
    bankTransactions
  });
  const august = calculateReceivablesByOriginMonth({
    companyId,
    asOfDate: '2026-08-10',
    originMonth: '2026-08',
    incomes,
    bankTransactions
  });

  assert.deepEqual(allocation.allocations, [{ incomeId: 'JUL-M', originMonth: '2026-07', amount: 2000 }]);
  assert.equal(july.monthly.settledAmount, 2000);
  assert.equal(july.monthly.outstandingAmount, 3000);
  assert.equal(august.total.outstandingAmount, 0);
});
