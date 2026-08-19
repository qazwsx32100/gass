import assert from 'node:assert/strict';
import test from 'node:test';

import { getErrorReference, getSafeErrorSummary } from '../src/utils/errorDiagnostics.js';

test('shows a stable reference for the same client error', () => {
  const error = new TypeError("Cannot read properties of undefined (reading 'map')");
  assert.equal(getErrorReference(error), getErrorReference(error));
  assert.match(getErrorReference(error), /^ERP-[0-9A-F]{8}$/);
});

test('redacts sensitive values from the visible error summary', () => {
  const error = new Error('request failed for user@example.com?token=secret-value');
  const summary = getSafeErrorSummary(error);
  assert.doesNotMatch(summary, /user@example\.com/);
  assert.doesNotMatch(summary, /secret-value/);
  assert.match(summary, /\[REDACTED_EMAIL\]/);
  assert.match(summary, /token=\[REDACTED\]/);
});
