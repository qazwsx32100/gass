import test from 'node:test';
import assert from 'node:assert/strict';
import { filterLedgerTransactions, summarizeLedgerTransactions } from '../src/utils/ledgerSearch.js';

const expenses = [
  {
    id: 'EXP-001',
    date: '2026-08-05',
    accountCode: '6101',
    employeeName: '王小明',
    payrollMonth: '2026-08',
    amount: 42000,
    remarks: '8 月薪資'
  },
  {
    id: 'EXP-002',
    date: '2026-08-05',
    accountCode: '6101',
    employeeName: '陳小華',
    payrollMonth: '2026-07',
    amount: 39000,
    remarks: '7 月薪資延後發放'
  },
  {
    id: 'EXP-003',
    date: '2026-08-06',
    accountCode: '6102',
    amount: 12000,
    counterpartyName: '房東李先生',
    remarks: '店面租金'
  }
];

const accountNames = { 6101: '員工薪資', 610110: '工錢', 6102: '租金支出' };

test('searches salary account and lists only the selected payroll month', () => {
  const result = filterLedgerTransactions(expenses, {
    query: '員工薪資',
    yearMonth: '2026-08',
    accountNames
  });

  assert.deepEqual(result.map(item => item.employeeName), ['王小明']);
});

test('searches employee name, counterparty, remarks, and transaction id', () => {
  assert.equal(filterLedgerTransactions(expenses, { query: '陳小華', allMonths: true, accountNames }).length, 1);
  assert.equal(filterLedgerTransactions(expenses, { query: '房東', allMonths: true, accountNames }).length, 1);
  assert.equal(filterLedgerTransactions(expenses, { query: '延後發放', allMonths: true, accountNames }).length, 1);
  assert.equal(filterLedgerTransactions(expenses, { query: 'EXP-003', allMonths: true, accountNames }).length, 1);
});

test('searching a parent salary account includes its wage subaccounts', () => {
  const result = filterLedgerTransactions([
    ...expenses,
    {
      id: 'EXP-SUB-1',
      companyId: 'COMP001',
      accountCode: '610110',
      amount: 2090,
      payrollMonth: '2026-08',
      date: '2026-08-20',
      employeeName: '阿義',
      remarks: '工錢'
    }
  ], {
    query: '員工薪資',
    yearMonth: '2026-08',
    accountNames
  });

  assert.deepEqual(result.map(item => item.id).sort(), ['EXP-001', 'EXP-SUB-1']);
  assert.equal(summarizeLedgerTransactions(result).amount, 44090);
});

test('supports multiple keywords and totals the visible results', () => {
  const result = filterLedgerTransactions(expenses, {
    query: '員工薪資 王小明',
    allMonths: true,
    accountNames
  });

  assert.deepEqual(summarizeLedgerTransactions(result), { count: 1, excludedCount: 0, amount: 42000 });
});

test('keeps void records visible but excludes them from the displayed total', () => {
  const result = summarizeLedgerTransactions([
    { id: 'EXP-A', status: 'approved', amount: 42000 },
    { id: 'EXP-V', status: 'void', amount: 39000 }
  ]);

  assert.deepEqual(result, { count: 2, excludedCount: 1, amount: 42000 });
});
