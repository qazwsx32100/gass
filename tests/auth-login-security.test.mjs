import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAdminCredential } from '../api/auth-login.js';
import { hashPassword, verifyPassword } from '../api/_auth.js';

test('uses the owner account credential when admin security was not initialized', () => {
  const state = {
    shareholders: [{
      id: 'SH001',
      email: 'qazwsx32100@gmail.com',
      password: 'legacy-owner-password'
    }]
  };

  const resolved = resolveAdminCredential(state, {}, '');

  assert.equal(resolved.source, 'ownerAccount');
  assert.equal(verifyPassword('legacy-owner-password', resolved.record, resolved.fallbackPassword), true);
});

test('prefers the initialized admin credential over the owner account', () => {
  const adminCredential = hashPassword('current-admin-password');
  const state = {
    shareholders: [{
      id: 'SH001',
      email: 'qazwsx32100@gmail.com',
      password: 'old-owner-password'
    }]
  };

  const resolved = resolveAdminCredential(state, adminCredential, 'environment-password');

  assert.equal(resolved.source, 'adminSecurity');
  assert.equal(verifyPassword('current-admin-password', resolved.record, resolved.fallbackPassword), true);
  assert.equal(verifyPassword('old-owner-password', resolved.record, resolved.fallbackPassword), false);
});

test('reports a missing admin credential when no safe fallback exists', () => {
  const resolved = resolveAdminCredential({ shareholders: [] }, {}, '');

  assert.equal(resolved.source, 'missing');
  assert.equal(verifyPassword('anything', resolved.record, resolved.fallbackPassword), false);
});
