import test from 'node:test';
import assert from 'node:assert/strict';
import { selectMonthlyOperatingRevenueEntries } from '../src/utils/operatingRevenue.js';

test('includes cylinder deposits in monthly operating revenue', () => {
  const entries = selectMonthlyOperatingRevenueEntries({
    companyId: 'COMPANY',
    yearMonth: '2026-07',
    incomes: [
      { id: 'GAS', companyId: 'COMPANY', date: '2026-07-01', status: 'approved', amount: 1000 },
      { id: 'DEPOSIT', companyId: 'COMPANY', date: '2026-07-06', status: 'approved', syncType: 'revenue_deposit', remarks: '當日營業彙總 - 押瓶收入', amount: 1500 },
      { id: 'OTHER-MONTH', companyId: 'COMPANY', date: '2026-08-01', status: 'approved', amount: 2000 }
    ]
  });

  assert.deepEqual(entries.map(item => item.id), ['GAS', 'DEPOSIT']);
  assert.equal(entries.reduce((sum, item) => sum + item.amount, 0), 2500);
});

test('still excludes opening balances, pending balances, and reversals', () => {
  const entries = selectMonthlyOperatingRevenueEntries({
    companyId: 'COMPANY',
    yearMonth: '2026-07',
    incomes: [
      { id: 'OPENING', companyId: 'COMPANY', date: '2026-07-01', status: 'approved', syncType: 'receivable_opening', amount: 500 },
      { id: 'PENDING', companyId: 'COMPANY', date: '2026-07-01', status: 'approved', remarks: '尚未核銷', amount: 600 },
      { id: 'BALANCE', companyId: 'COMPANY', date: '2026-07-01', status: 'approved', remarks: '欠款餘額', amount: 700 },
      { id: 'REVERSAL', companyId: 'COMPANY', date: '2026-07-01', status: 'approved', correctionType: 'reversal', amount: 800 }
    ]
  });

  assert.deepEqual(entries, []);
});
