import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCashRevenue } from '../src/utils/cashRevenue.js';

test('excludes unpaid sales and recognizes them only when settlement is received', () => {
  const result = calculateCashRevenue({
    incomes: [
      { id: 'PAID', date: '2026-08-01', status: 'approved', paymentStatus: 'paid', paymentMethod: 'cash', amount: 1000 },
      { id: 'MONTHLY', date: '2026-08-01', status: 'approved', paymentStatus: 'unpaid', paymentMethod: 'receivable', amount: 2500 },
      { id: 'DEBT', date: '2026-08-01', status: 'approved', paymentStatus: 'unpaid', paymentMethod: 'receivable', amount: 1200 }
    ],
    bankTransactions: [
      { id: 'SET-M', date: '2026-08-10', status: 'approved', direction: 'in', sourceType: 'settlement', settlementCategory: 'monthly', amount: 800 }
    ]
  });

  assert.equal(result.directIncomeAmount, 1000);
  assert.equal(result.settlementAmount, 800);
  assert.equal(result.totalRevenue, 1800);
});

test('does not count a settled income and its settlement twice', () => {
  const result = calculateCashRevenue({
    incomes: [
      { id: 'AR-1', date: '2026-08-01', status: 'approved', paymentStatus: 'paid', paymentMethod: 'receivable', settlementId: 'SET-1', amount: 3000 }
    ],
    bankTransactions: [
      { id: 'SET-1', date: '2026-08-15', status: 'approved', direction: 'in', sourceType: 'settlement', settlementCategory: 'monthly', amount: 3000 }
    ]
  });

  assert.equal(result.entries.length, 1);
  assert.equal(result.totalRevenue, 3000);
});

test('uses the receipt date when filtering cash revenue periods', () => {
  const result = calculateCashRevenue({
    incomes: [],
    bankTransactions: [
      { id: 'SET-JUL', date: '2026-07-31', status: 'approved', direction: 'in', sourceType: 'settlement', settlementCategory: 'current_debt', amount: 500 },
      { id: 'SET-AUG', date: '2026-08-01', status: 'approved', direction: 'in', sourceType: 'settlement', settlementCategory: 'current_debt', amount: 700 }
    ],
    isDateIncluded: date => String(date).startsWith('2026-08')
  });

  assert.equal(result.totalRevenue, 700);
});

test('uses the actual payment date for imported settlements', () => {
  const result = calculateCashRevenue({
    incomes: [],
    bankTransactions: [
      { id: 'SET-JUL-AUG', date: '2026-07-30', actualPaymentDate: '2026-08-06', direction: 'in', sourceType: 'settlement', amount: 3125 }
    ],
    isDateIncluded: date => String(date).startsWith('2026-08')
  });

  assert.equal(result.totalRevenue, 3125);
  assert.equal(result.entries[0].recognitionDate, '2026-08-06');
});

test('recognizes legacy settlement rows without status or category', () => {
  const result = calculateCashRevenue({
    incomes: [
      { id: 'OLD-DEBT', date: '2026-07-01', status: 'approved', paymentStatus: 'paid', paymentMethod: 'cash', settlementId: 'OLD-SET', amount: 615 }
    ],
    bankTransactions: [
      { id: 'OLD-SET', date: '2026-07-05', direction: 'in', sourceType: 'settlement', sourceId: 'OLD-DEBT', amount: 615 }
    ]
  });

  assert.equal(result.directIncomeAmount, 0);
  assert.equal(result.settlementAmount, 615);
  assert.equal(result.totalRevenue, 615);
});
