import test from 'node:test';
import assert from 'node:assert/strict';

import { isShareholderDistributionEntry } from '../src/utils/expensePolicy.js';

test('recognizes the shareholder dividend parent and detail accounts', () => {
  assert.equal(isShareholderDistributionEntry({ accountCode: '6110' }), true);
  assert.equal(isShareholderDistributionEntry({ accountCode: '611001' }), true);
  assert.equal(isShareholderDistributionEntry({ accountCode: '6102' }), false);
});

test('recognizes explicitly tagged equity distributions', () => {
  assert.equal(isShareholderDistributionEntry({ entryNature: 'equity_distribution' }), true);
});
