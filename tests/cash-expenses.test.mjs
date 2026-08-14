import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCashExpenses } from '../src/utils/cashExpenses.js';

test('cash expenses include only paid costs in the selected period', () => {
  const result = calculateCashExpenses({
    expenses: [
      { id: 'PAID', date: '2026-08-01', status: 'approved', paymentStatus: 'paid', paymentMethod: 'cash', amount: 1000 },
      { id: 'UNPAID', date: '2026-08-01', status: 'approved', paymentStatus: 'unpaid', paymentMethod: 'payable', amount: 2500 },
      { id: 'VOID', date: '2026-08-01', status: 'void', paymentStatus: 'paid', paymentMethod: 'cash', amount: 900 }
    ],
    bankTransactions: [],
    isDateIncluded: date => String(date).startsWith('2026-08')
  });

  assert.equal(result.totalExpenses, 1000);
  assert.equal(result.entries.length, 1);
});

test('payable cost is recognized on its actual settlement date without double counting', () => {
  const result = calculateCashExpenses({
    expenses: [
      { id: 'AP-1', date: '2026-07-20', status: 'approved', paymentStatus: 'paid', paymentMethod: 'payable', settlementId: 'SET-1', amount: 3000 }
    ],
    bankTransactions: [
      { id: 'SET-1', date: '2026-08-05', direction: 'out', sourceType: 'settlement', amount: 3000 }
    ],
    isDateIncluded: date => String(date).startsWith('2026-08')
  });

  assert.equal(result.totalExpenses, 3000);
  assert.equal(result.entries.length, 1);
});
