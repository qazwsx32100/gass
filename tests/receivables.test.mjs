import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateAggregateReceivables, resolveSettlementType } from '../src/utils/receivables.js';

const income = (overrides) => ({
  id: 'INC-BASE',
  companyId: 'COMP001',
  date: '2026-07-01',
  status: 'approved',
  paymentStatus: 'unpaid',
  amount: 0,
  ...overrides
});

test('resolves legacy settlement type from its source or current-debt fallback', () => {
  assert.equal(
    resolveSettlementType(
      { direction: 'in', sourceType: 'settlement' },
      { remarks: '當日營業彙總 - 月結', paymentMethod: 'receivable' }
    ),
    'monthly'
  );
  assert.equal(
    resolveSettlementType({ direction: 'in', sourceType: 'settlement' }),
    'current_debt'
  );
});

test('does not subtract a per-record settlement twice after its source is marked paid', () => {
  const result = calculateAggregateReceivables({
    companyId: 'COMP001',
    asOfDate: '2026-07-31',
    incomes: [
      income({ id: 'SETTLED', amount: 1250, paymentStatus: 'paid', settlementId: 'SET-1' }),
      income({ id: 'OPEN', amount: 5000, remarks: '當日營業彙總 - 賒欠' })
    ],
    bankTransactions: [
      { id: 'SET-1', companyId: 'COMP001', date: '2026-07-12', direction: 'in', sourceType: 'settlement', sourceId: 'SETTLED', amount: 1250 }
    ]
  });

  assert.equal(result.currentDebt.outstandingAmount, 5000);
  assert.equal(result.total.outstandingAmount, 5000);
});

test('does not subtract imported historical collections from net opening balances', () => {
  const result = calculateAggregateReceivables({
    companyId: 'COMP001',
    asOfDate: '2026-08-31',
    incomes: [
      income({ id: 'SL-OPEN-JUL', date: '2026-07-09', amount: 1230, receivableType: 'current_debt', syncSource: 'shenglong', syncType: 'receivable_opening' }),
      income({ id: 'SL-OPEN-AUG-1', date: '2026-08-10', amount: 2520, receivableType: 'current_debt', syncSource: 'shenglong', syncType: 'receivable_opening' }),
      income({ id: 'SL-OPEN-AUG-2', date: '2026-08-13', amount: 5, receivableType: 'current_debt', syncSource: 'shenglong', syncType: 'receivable_opening' })
    ],
    bankTransactions: [{
      id: 'SL-SYNC-SET-current_debt-2026-08-01',
      companyId: 'COMP001',
      date: '2026-08-01',
      direction: 'in',
      sourceType: 'settlement',
      status: 'approved',
      settlementCategory: 'current_debt',
      syncSource: 'shenglong',
      amount: 26180
    }]
  });

  assert.equal(result.currentDebt.originalAmount, 3755);
  assert.equal(result.currentDebt.settledAmount, 0);
  assert.equal(result.currentDebt.outstandingAmount, 3755);
  assert.equal(result.currentDebt.rows.length, 3);
  assert.equal(result.unmatchedSettlementAmount, 0);
});

test('includes monthly and current debt without customer data', () => {
  const result = calculateAggregateReceivables({
    companyId: 'COMP001',
    asOfDate: '2026-07-31',
    incomes: [
      income({ id: 'INC-M', amount: 2500, paymentMethod: 'receivable', remarks: '當日營業彙總 - 月結' }),
      income({ id: 'INC-D', amount: 1240, paymentMethod: 'cash', remarks: '當日營業彙總 - 賒欠' })
    ],
    bankTransactions: []
  });

  assert.equal(result.monthly.outstandingAmount, 2500);
  assert.equal(result.currentDebt.outstandingAmount, 1240);
  assert.equal(result.total.outstandingAmount, 3740);
});

test('applies legacy repayments to oldest current debt first', () => {
  const result = calculateAggregateReceivables({
    companyId: 'COMP001',
    asOfDate: '2026-07-31',
    incomes: [
      income({ id: 'INC-D1', date: '2026-07-01', amount: 1000, remarks: '當日營業彙總 - 賒欠' }),
      income({ id: 'INC-D2', date: '2026-07-15', amount: 2500, remarks: '當日營業彙總 - 賒欠' })
    ],
    bankTransactions: [{
      id: 'SET-1',
      companyId: 'COMP001',
      date: '2026-07-30',
      direction: 'in',
      sourceType: 'settlement',
      status: 'approved',
      amount: 2000,
      remarks: '當日營業彙總 - 還款'
    }]
  });

  assert.equal(result.currentDebt.settledAmount, 2000);
  assert.equal(result.currentDebt.outstandingAmount, 1500);
  assert.equal(result.currentDebt.rows[0].outstandingAmount, 0);
  assert.equal(result.currentDebt.rows[1].outstandingAmount, 1500);
});

test('keeps monthly receipts separate from current debt repayments', () => {
  const result = calculateAggregateReceivables({
    companyId: 'COMP001',
    asOfDate: '2026-08-31',
    incomes: [
      income({ id: 'INC-M', amount: 2500, remarks: '當日營業彙總 - 月結' }),
      income({ id: 'INC-D', amount: 1240, remarks: '當日營業彙總 - 賒欠' })
    ],
    bankTransactions: [{
      id: 'SET-M',
      companyId: 'COMP001',
      date: '2026-08-01',
      direction: 'in',
      sourceType: 'settlement',
      status: 'approved',
      settlementCategory: 'monthly',
      amount: 1000,
      remarks: '當日營業彙總 - 月結收款'
    }]
  });

  assert.equal(result.monthly.outstandingAmount, 1500);
  assert.equal(result.currentDebt.outstandingAmount, 1240);
  assert.equal(result.total.outstandingAmount, 2740);
});

test('reports unmatched settlements instead of producing a negative balance', () => {
  const result = calculateAggregateReceivables({
    companyId: 'COMP001',
    asOfDate: '2026-07-31',
    incomes: [income({ id: 'INC-D', amount: 500, remarks: '當日營業彙總 - 賒欠' })],
    bankTransactions: [{
      id: 'SET-D',
      companyId: 'COMP001',
      date: '2026-07-20',
      direction: 'in',
      sourceType: 'settlement',
      status: 'approved',
      settlementCategory: 'current_debt',
      amount: 700
    }]
  });

  assert.equal(result.currentDebt.outstandingAmount, 0);
  assert.equal(result.unmatchedSettlementAmount, 200);
});
