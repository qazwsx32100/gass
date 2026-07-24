import test from 'node:test';
import assert from 'node:assert/strict';
import { getNextCompanyId, sanitizeInactiveCompanies } from '../src/utils/companyState.js';
import { INITIAL_COMPANIES } from '../src/db/mockData.js';

test('production seed does not include the removed entertainment demo company', () => {
  assert.deepEqual(INITIAL_COMPANIES.map(company => company.id), ['COMP001']);
  assert.equal(INITIAL_COMPANIES.some(company => company.name.includes('藝人')), false);
});

test('removes the legacy entertainment demo company from cached state', () => {
  const state = {
    companies: [
      { id: 'COMP001', name: '盛隆瓦斯行' },
      { id: 'COMP002', name: '星光藝人經紀公司' }
    ],
    shareholders: [
      { id: 'SH001', allowedCompanies: ['COMP001', 'COMP002'] }
    ],
    auditArchive: []
  };

  const sanitized = sanitizeInactiveCompanies(state);

  assert.deepEqual(sanitized.companies.map(company => company.id), ['COMP001']);
  assert.deepEqual(sanitized.shareholders[0].allowedCompanies, ['COMP001']);
});

test('keeps a deleted company hidden when stale client state reintroduces it', () => {
  const staleClientState = {
    companies: [
      { id: 'COMP001', name: '盛隆瓦斯行' },
      { id: 'COMP002', name: '已刪除公司' }
    ],
    shareholders: [
      { id: 'SH001', allowedCompanies: ['COMP001', 'COMP002'] }
    ],
    auditArchive: []
  };
  const cloudReferenceState = {
    companies: [{ id: 'COMP001', name: '盛隆瓦斯行' }],
    auditArchive: [{
      id: 'AUD001',
      collection: 'companies',
      recordId: 'COMP002',
      action: 'delete',
      archivedAt: '2026-07-19T11:32:32.442Z'
    }]
  };

  const sanitized = sanitizeInactiveCompanies(staleClientState, cloudReferenceState);

  assert.deepEqual(sanitized.companies.map(company => company.id), ['COMP001']);
  assert.deepEqual(sanitized.shareholders[0].allowedCompanies, ['COMP001']);
});

test('allows an explicitly restored company after a later restore event', () => {
  const state = {
    companies: [{ id: 'COMP002', name: '正式新公司' }],
    shareholders: [],
    auditArchive: [
      {
        id: 'AUD002',
        collection: 'companies',
        recordId: 'COMP002',
        action: 'restore',
        archivedAt: '2026-07-20T10:00:00.000Z'
      },
      {
        id: 'AUD001',
        collection: 'companies',
        recordId: 'COMP002',
        action: 'delete',
        archivedAt: '2026-07-19T10:00:00.000Z'
      }
    ]
  };

  const sanitized = sanitizeInactiveCompanies(state);

  assert.deepEqual(sanitized.companies, state.companies);
});

test('does not reuse a company id that belongs to retained deletion history', () => {
  const nextId = getNextCompanyId(
    [{ id: 'COMP001', name: '盛隆瓦斯行' }],
    [{ collection: 'companies', recordId: 'COMP002', action: 'delete' }]
  );

  assert.equal(nextId, 'COMP003');
});
