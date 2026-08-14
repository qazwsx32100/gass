import test from 'node:test';
import assert from 'node:assert/strict';
import { entriesForCategory, groupLedgerEntriesByCategory } from '../src/utils/ledgerCategories.js';

const accounts = [
  { code: '5101', name: '進氣成本' },
  { code: '6101', name: '員工薪資' },
  { code: '610101', name: '司機配送薪資' },
  { code: '6103', name: '車輛油資' }
];

test('groups subaccounts into their parent expense category', () => {
  const groups = groupLedgerEntriesByCategory({
    entries: [
      { id: 'SALARY-1', accountCode: '6101', amount: 30000 },
      { id: 'SALARY-2', accountCode: '610101', amount: 12000 },
      { id: 'GAS-1', accountCode: '5101', amount: 80000 },
      { id: 'FUEL-1', accountCode: '6103', amount: 5000 }
    ],
    accounts
  });

  assert.deepEqual(groups.map(group => [group.label, group.amount, group.count]), [
    ['進氣成本', 80000, 1],
    ['員工薪資', 42000, 2],
    ['車輛油資', 5000, 1]
  ]);
});

test('uses the original payable account when a settlement has no account code', () => {
  const groups = groupLedgerEntriesByCategory({
    entries: [
      { id: 'SET-1', sourceId: 'EXP-1', recognitionType: 'payable_settlement', amount: 15000 }
    ],
    sourceRecords: [{ id: 'EXP-1', accountCode: '6101' }],
    accounts
  });

  assert.equal(groups[0].label, '員工薪資');
  assert.equal(groups[0].amount, 15000);
});

test('returns only the entries from the selected category', () => {
  const groups = groupLedgerEntriesByCategory({
    entries: [
      { id: 'SALARY', accountCode: '6101', amount: 30000 },
      { id: 'GAS', accountCode: '5101', amount: 50000 }
    ],
    accounts
  });

  assert.deepEqual(entriesForCategory(groups, '6101').map(item => item.id), ['SALARY']);
  assert.equal(entriesForCategory(groups).length, 2);
});
