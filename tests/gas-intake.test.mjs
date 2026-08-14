import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGasIntakeTimeline,
  getMonthlyGasIntakeView,
  summarizeMonthlyGasIntake
} from '../src/utils/gasIntake.js';

const purchases = [
  {
    date: '2026-07-02',
    qty50kg: 2,
    qty20kg: 1,
    totalGasKg: 5,
    amount: 2300
  },
  {
    date: '2026-07-15',
    qty20kg: 3,
    grossKg: 60,
    totalKg: 58,
    totalGasKg: 2,
    amount: 1160
  },
  {
    date: '2026-06-20',
    qty50kg: 1,
    grossKg: 50,
    totalKg: 50,
    amount: 1000
  }
];

test('groups gas intake by month and calculates net intake metrics', () => {
  const [july, june] = summarizeMonthlyGasIntake(purchases);

  assert.equal(july.yearMonth, '2026-07');
  assert.equal(july.grossKg, 180);
  assert.equal(july.residualKg, 7);
  assert.equal(july.netKg, 173);
  assert.equal(july.amount, 3460);
  assert.equal(july.intakeDays, 2);
  assert.equal(july.cylinderCount, 6);
  assert.equal(july.quantityBySpec[50], 2);
  assert.equal(july.quantityBySpec[20], 4);
  assert.equal(july.averageCostPerKg, 20);
  assert.equal(june.netKg, 50);
});

test('compares the selected month with its previous calendar month', () => {
  const report = getMonthlyGasIntakeView(purchases, '2026-07');

  assert.equal(report.current.netKg, 173);
  assert.equal(report.previous.netKg, 50);
  assert.equal(report.changeKg, 123);
  assert.equal(report.changePercent, 246);
});

test('fills missing months in the 12-month trend without inventing intake', () => {
  const timeline = buildGasIntakeTimeline(purchases, '2026-07', 3);

  assert.deepEqual(timeline.map(month => month.yearMonth), ['2026-05', '2026-06', '2026-07']);
  assert.deepEqual(timeline.map(month => month.netKg), [0, 50, 173]);
});
