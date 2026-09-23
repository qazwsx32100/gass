import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAccountGroups, findParentAccount, getTopLevelAccount } from '../src/utils/accountHierarchy.js';

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
