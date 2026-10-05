import test from 'node:test';
import assert from 'node:assert/strict';
import { canViewOwnerCashBalance } from '../src/utils/ownerCashAccess.js';

test('cash balance card is visible to admin, business reviewers, and shareholders, but hidden from bookkeepers', () => {
  assert.equal(canViewOwnerCashBalance('admin'), true);
  assert.equal(canViewOwnerCashBalance('business_reviewer'), true);
  assert.equal(canViewOwnerCashBalance('readonly_shareholder'), true);
  assert.equal(canViewOwnerCashBalance('bookkeeper'), false);
  assert.equal(canViewOwnerCashBalance('unknown'), false);
});

