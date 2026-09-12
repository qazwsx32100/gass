import test from 'node:test';
import assert from 'node:assert/strict';
import { canViewOwnerCashBalance } from '../src/utils/ownerCashAccess.js';

test('owner cash balance is visible only to the fixed Yang Meng-Long admin account', () => {
  assert.equal(canViewOwnerCashBalance('admin', {
    id: 'ADMIN',
    email: 'qazwsx32100@gmail.com'
  }), true);

  assert.equal(canViewOwnerCashBalance('admin', {
    id: 'SH001',
    email: 'qazwsx32100@gmail.com'
  }), false);
  assert.equal(canViewOwnerCashBalance('readonly_shareholder', {
    id: 'ADMIN',
    email: 'qazwsx32100@gmail.com'
  }), false);
  assert.equal(canViewOwnerCashBalance('admin', {
    id: 'ADMIN',
    email: 'someone@example.com'
  }), false);
});
