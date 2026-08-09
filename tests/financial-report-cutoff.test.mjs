import test from 'node:test';
import assert from 'node:assert/strict';
import { FINANCIAL_REPORT_START_DATE, isReportableRepayment } from '../src/utils/reportPolicy.js';

test('new financial reports start on 2026-07-01', () => {
  assert.equal(FINANCIAL_REPORT_START_DATE, '2026-07-01');
});

test('repayments only count when the original debt is in the new-report era', () => {
  const incomes = [
    { id: 'OLD', date: '2026-06-30' },
    { id: 'NEW', date: '2026-07-01' }
  ];

  assert.equal(isReportableRepayment({ sourceId: 'OLD' }, incomes), false);
  assert.equal(isReportableRepayment({ sourceId: 'NEW' }, incomes), true);
  assert.equal(isReportableRepayment({ debtOriginDate: '2026-06-15' }, incomes), false);
  assert.equal(isReportableRepayment({ debtOriginDate: '2026-07-15' }, incomes), true);
  assert.equal(isReportableRepayment({ remarks: '當日營業彙總 - 還款' }, incomes), false);
});
