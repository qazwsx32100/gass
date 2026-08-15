import test from 'node:test';
import assert from 'node:assert/strict';

import { isGasRevenueEntry } from '../src/utils/gasRevenue.js';

test('gas revenue includes cash sales, monthly receivables, and current debt summaries', () => {
  assert.equal(isGasRevenueEntry({ gasKg: 20, amount: 700 }), true);
  assert.equal(isGasRevenueEntry({ summaryOnly: true, syncType: 'daily_summary_monthly', amount: 1200 }), true);
  assert.equal(isGasRevenueEntry({ summaryOnly: true, syncType: 'daily_summary_debt', amount: 500 }), true);
});

test('gas revenue excludes settlements and non-gas income', () => {
  assert.equal(isGasRevenueEntry({ syncType: 'receivable_opening', amount: 1200 }), false);
  assert.equal(isGasRevenueEntry({ syncType: 'revenue_stove', amount: 2900 }), false);
  assert.equal(isGasRevenueEntry({ summaryOnly: true, syncType: 'daily_summary_inspection', amount: 900 }), false);
});
