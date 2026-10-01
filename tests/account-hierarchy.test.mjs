import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAccountGroups, findParentAccount, getTopLevelAccount } from '../src/utils/accountHierarchy.js';
import { INITIAL_CHART_OF_ACCOUNTS } from '../src/db/mockData.js';

const accounts = [
  { code: '4101', name: '瓦斯收入', type: 'revenue' },
  { code: '410101', name: '現金瓦斯', type: 'revenue' },
  { code: '6104', name: '車輛費用', type: 'expense' },
  { code: '710110', name: '貨車燃料稅', type: 'expense', parentCode: '6104' }
];

test('infers a parent from the longest compatible account prefix', () => {
  assert.equal(findParentAccount(accounts[1], accounts)?.code, '4101');
});

test('explicit parent mapping supports legacy codes outside the parent prefix', () => {
  assert.equal(findParentAccount(accounts[3], accounts)?.code, '6104');
  assert.equal(getTopLevelAccount(accounts[3], accounts)?.code, '6104');
});

test('groups every account under exactly one first-level account', () => {
  const groups = buildAccountGroups(accounts);
  assert.deepEqual(groups.map(group => [group.parent.code, group.accounts.map(item => item.code)]), [
    ['4101', ['4101', '410101']],
    ['6104', ['6104', '710110']]
  ]);
});

test('integrates the requested expense details into the existing chart of accounts', () => {
  const expenseGroups = buildAccountGroups(INITIAL_CHART_OF_ACCOUNTS.filter(account => account.type === 'expense'));
  const byParent = new Map(expenseGroups.map(group => [group.parent.name, group.accounts.map(account => account.name)]));

  assert.deepEqual(byParent.get('股東分紅'), ['股東分紅', '曄鏵', '子毛', '小龍']);
  assert.deepEqual(byParent.get('車輛油資'), [
    '車輛油資',
    '油桶',
    '塑膠車 PKA-7032（淺藍）',
    '檔車（紅色）',
    '檔車（藍色）',
    '發財車 BBR-7931',
    '發財車 5417-J8'
  ]);
  assert.deepEqual(byParent.get('水電瓦斯與電信'), ['水電瓦斯與電信', '水費', '電費', '電話費', '網路費']);
  assert.deepEqual(byParent.get('稅捐'), ['稅捐', '營業稅', '營利事業所得稅']);
});
