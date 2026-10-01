import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('InputsView displays pending and all operational ledger rows without filtering by report eligibility', () => {
  const source = readFileSync(new URL('../src/pages/InputsView.jsx', import.meta.url), 'utf8');

  // Must not use isEffectiveForReport on raw ledger tab items which hides pending items
  const incomeBlock = source.match(/if \(activeSubTab === 'income'\) \{([\s\S]*?)\}/);
  assert.ok(incomeBlock, 'income block should exist');
  assert.ok(!incomeBlock[1].includes('isEffectiveForReport'), 'income table must not filter out pending items with isEffectiveForReport');

  const expenseBlock = source.match(/\} else if \(activeSubTab === 'expense'\) \{([\s\S]*?)\}/);
  assert.ok(expenseBlock, 'expense block should exist');
  assert.ok(!expenseBlock[1].includes('isEffectiveForReport'), 'expense table must not filter out pending items with isEffectiveForReport');

  // Status dropdown contains approved option for admin / reviewers
  assert.ok(source.includes('(isAdmin || canReview) && <option value="approved">'), 'status dropdown must offer approved option for admins/reviewers');

  // handleOpenAdd initializes status to approved for admin/reviewer
  assert.ok(source.includes("(isAdmin || canReview) ? 'approved' : 'pending_admin_review'"), 'handleOpenAdd must default to approved for admin/reviewer');
});
