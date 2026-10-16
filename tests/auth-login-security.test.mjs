import test from 'node:test';
import assert from 'node:assert/strict';
import {
  authenticateShareholder,
  isWeakBannedPassword,
  resolveAdminCredential,
  resolveAdminLoginCredential
} from '../api/auth-login.js';
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

test('uses a temporary recovery password when the stored admin password is stale', () => {
  const storedCredential = hashPassword('forgotten-password');
  const resolved = resolveAdminLoginCredential(
    { shareholders: [] },
    storedCredential,
    'temporary-recovery-password',
    'temporary-recovery-password'
  );

  assert.equal(resolved.source, 'environmentRecovery');
  assert.equal(
    verifyPassword('temporary-recovery-password', resolved.record, resolved.fallbackPassword),
    true
  );
});

test('keeps a valid stored admin password authoritative', () => {
  const storedCredential = hashPassword('current-admin-password');
  const resolved = resolveAdminLoginCredential(
    { shareholders: [] },
    storedCredential,
    'current-admin-password',
    'temporary-recovery-password'
  );

  assert.equal(resolved.source, 'adminSecurity');
});

test('strictly blocks weak default PINs (1234, 6789) from logging in as shareholder even if legacy state had 1234', () => {
  assert.equal(isWeakBannedPassword('1234'), true);
  assert.equal(isWeakBannedPassword('6789'), true);
  assert.equal(isWeakBannedPassword('123456'), true);

  const legacyStateWithWeakPin = {
    shareholders: [{
      id: 'SH002',
      name: '周子傑',
      email: 'zijie@shenglonggas.com',
      role: 'business_reviewer',
      password: '1234'
    }]
  };

  assert.equal(authenticateShareholder(legacyStateWithWeakPin, '周子傑', '1234').matched, false);
  assert.equal(authenticateShareholder(legacyStateWithWeakPin, 'zijie@shenglonggas.com', '6789').matched, false);
  assert.equal(authenticateShareholder({ shareholders: [] }, '林曄鏵', '1234').matched, false);
});

test('authenticates shareholder with custom PBKDF2-SHA256 credential and rejects wrong passwords', () => {
  const customCred = hashPassword('ZijieStrongPass#2026');
  const state = {
    shareholders: [{
      id: 'SH002',
      name: '周子傑',
      email: 'zijie@shenglonggas.com',
      role: 'business_reviewer',
      ...customCred
    }]
  };

  const failedAttempt = authenticateShareholder(state, 'zijie@shenglonggas.com', 'wrong-pass');
  assert.equal(failedAttempt.matched, false);

  const validAttempt = authenticateShareholder(state, 'zijie@shenglonggas.com', 'ZijieStrongPass#2026');
  assert.equal(validAttempt.matched, true);
  assert.equal(validAttempt.user.id, 'SH002');
  assert.equal(validAttempt.user.role, 'business_reviewer');
});

