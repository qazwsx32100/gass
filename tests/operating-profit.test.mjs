import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateOperatingProfit,
  isFixedOperatingExpense,
  isGasInventoryPurchaseExpense
} from '../src/utils/operatingProfit.js';

const accounts = [
  { code: '5101', name: '進氣成本' },
  { code: '6101', name: '員工薪資' },
  { code: '6102', name: '店租費用' },
  { code: '6104', name: '車輛折舊與維修' },
  { code: '6199', name: '其他費用' }
];

test('進氣成本不會被當成其他變動費用重複扣除', () => {
  assert.equal(isGasInventoryPurchaseExpense({ accountCode: '5101' }, '進氣成本'), true);
});

test('固定成本可依科目辨識，明確維修仍為變動費用', () => {
  assert.equal(isFixedOperatingExpense({ accountCode: '6101' }, '員工薪資'), true);
  assert.equal(isFixedOperatingExpense({ accountCode: '6104', remarks: '車輛維修' }, '車輛折舊與維修'), false);
});

test('單日淨利會分攤當月固定成本，且不重複扣瓦斯進貨', () => {
  const result = calculateOperatingProfit({
    companyExpenses: [
      { id: 'gas', date: '2026-08-02', accountCode: '5101', amount: 62000, status: 'approved' },
      { id: 'salary', date: '2026-08-20', accountCode: '6101', amount: 31000, status: 'approved' },
      { id: 'repair', date: '2026-08-10', accountCode: '6104', amount: 1000, remarks: '車輛維修', status: 'approved' }
    ],
    activeExpenses: [
      { id: 'gas', date: '2026-08-02', accountCode: '5101', amount: 62000, status: 'approved' },
      { id: 'repair', date: '2026-08-10', accountCode: '6104', amount: 1000, remarks: '車輛維修', status: 'approved' }
    ],
    chartOfAccounts: accounts,
    periodType: 'date',
    periodValue: '2026-08-10',
    totalRevenue: 20000,
    gasSalesAmount: 18000,
    gasGrossProfit: 6000
  });

  assert.equal(result.gasCost, 12000);
  assert.equal(result.variableExpenses, 1000);
  assert.equal(result.fixedCostAllocated, 1000);
  assert.equal(result.operatingProfit, 6000);
});

test('整月報表會扣除整月固定成本', () => {
  const result = calculateOperatingProfit({
    companyExpenses: [
      { id: 'rent', date: '2026-08-01', accountCode: '6102', amount: 21000, status: 'approved' }
    ],
    activeExpenses: [],
    chartOfAccounts: accounts,
    periodType: 'month',
    periodValue: '2026-08',
    totalRevenue: 100000,
    gasSalesAmount: 80000,
    gasGrossProfit: 30000
  });

  assert.equal(result.fixedCostAllocated, 21000);
  assert.equal(result.operatingProfit, 29000);
});
