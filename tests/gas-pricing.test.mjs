import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMonthlyGasPrice } from '../src/utils/gasPricing.js';

test('applies one monthly gas price to every purchase in the selected month', () => {
  const result = applyMonthlyGasPrice({
    purchases: [
      { id: 'JUL-1', companyId: 'COMP001', date: '2026-07-02', totalKg: 100, monthlyGasPrice: 20, amount: 2000 },
      { id: 'JUL-2', companyId: 'COMP001', date: '2026-07-18', totalKg: 50.5, monthlyGasPrice: 20, amount: 1010 },
      { id: 'AUG-1', companyId: 'COMP001', date: '2026-08-01', totalKg: 80, monthlyGasPrice: 21, amount: 1680 },
      { id: 'OTHER', companyId: 'COMP002', date: '2026-07-03', totalKg: 90, monthlyGasPrice: 19, amount: 1710 }
    ],
    companyId: 'COMP001',
    yearMonth: '2026-07',
    monthlyGasPrice: 22.38,
    updatedAt: '2026-08-02T00:00:00.000Z'
  });

  assert.equal(result.purchaseKg, 150.5);
  assert.equal(result.purchaseAmount, 3368);
  assert.equal(result.changed.length, 2);
  assert.deepEqual(
    result.purchases.slice(0, 2).map(item => [item.monthlyGasPrice, item.amount]),
    [[22.38, 2238], [22.38, 1130]]
  );
  assert.equal(result.purchases[2].monthlyGasPrice, 21);
  assert.equal(result.purchases[3].monthlyGasPrice, 19);
});

test('reports no changes when the selected month already uses the same price', () => {
  const result = applyMonthlyGasPrice({
    purchases: [
      { id: 'JUL-1', companyId: 'COMP001', date: '2026-07-02', totalKg: 100, monthlyGasPrice: 22.38, amount: 2238 }
    ],
    companyId: 'COMP001',
    yearMonth: '2026-07',
    monthlyGasPrice: 22.38
  });

  assert.equal(result.changed.length, 0);
  assert.equal(result.purchaseAmount, 2238);
});
