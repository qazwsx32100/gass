import test from 'node:test';
import assert from 'node:assert/strict';
import { getWeightedGasPurchaseCost } from '../src/utils/gasCost.js';

test('uses the weighted unit price without integer amount rounding loss', () => {
  const purchases = [
    { totalKg: 672, monthlyGasPrice: 22.63, amount: 15207 },
    { totalKg: 394, monthlyGasPrice: 22.63, amount: 8916 },
    { totalKg: 690, monthlyGasPrice: 22.63, amount: 15615 },
    { totalKg: 376, monthlyGasPrice: 22.63, amount: 8509 },
    { totalKg: 425, monthlyGasPrice: 22.63, amount: 9618 },
    { totalKg: 602, monthlyGasPrice: 22.63, amount: 13623 }
  ];

  const totalKg = purchases.reduce((sum, item) => sum + item.totalKg, 0);
  const averageCost = getWeightedGasPurchaseCost(purchases) / totalKg;

  assert.equal(averageCost.toFixed(2), '22.63');
});

test('falls back to the recorded amount for legacy rows without a unit price', () => {
  assert.equal(
    getWeightedGasPurchaseCost([{ totalKg: 10, monthlyGasPrice: 0, amount: 225 }]),
    225
  );
});
