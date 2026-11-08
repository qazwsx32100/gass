import assert from 'node:assert/strict';
import test from 'node:test';
import handler from '../api/sync-finance.js';

const createResponse = () => ({
  statusCode: 200,
  headers: {},
  body: '',
  status(code) {
    this.statusCode = code;
    return this;
  },
  setHeader(name, value) {
    this.headers[name] = value;
    return this;
  },
  end(value = '') {
    this.body = value;
    return this;
  }
});

test('sync-finance API: rejects non-POST requests with 405', async () => {
  const response = createResponse();
  await handler({ method: 'GET', headers: {} }, response);
  assert.equal(response.statusCode, 405);
});

test('sync-finance API: rejects requests with invalid sync secret with 401', async () => {
  const origSecret = process.env.ERP_SYNC_SECRET;
  process.env.ERP_SYNC_SECRET = 'correct-test-secret-1234567890abcdef';
  try {
    const response = createResponse();
    await handler({
      method: 'POST',
      headers: { 'x-erp-sync-secret': 'wrong-secret' },
      body: {}
    }, response);
    assert.equal(response.statusCode, 401);
  } finally {
    process.env.ERP_SYNC_SECRET = origSecret;
  }
});

test('sync-finance API: accepts valid payload with SYSTEM_STATUS_REPORT_TOKEN and returns structured response', async () => {
  const origToken = process.env.SYSTEM_STATUS_REPORT_TOKEN;
  process.env.SYSTEM_STATUS_REPORT_TOKEN = 'test-system-status-token-64bytes-long-secret-key-1234567890abcdef';
  try {
    const response = createResponse();
    const samplePayload = {
      source: 'shenglong',
      businessDate: '2026-11-08',
      revenueTotal: 3107725,
      receivablesTotal: 53595,
      refundTotal: 27500,
      incomes: [{ id: 'TEST-1', amount: 1000 }],
      expenses: [{ id: 'TEST-E1', amount: 500 }],
      customers: [{ id: 'C1' }],
      bankTransactions: [],
      gasPurchases: []
    };

    await handler({
      method: 'POST',
      headers: {
        'x-status-token': 'test-system-status-token-64bytes-long-secret-key-1234567890abcdef',
        'authorization': 'Bearer test-system-status-token-64bytes-long-secret-key-1234567890abcdef'
      },
      body: { functionName: 'erp_sync_shenglong_finance', params: { p_payload: samplePayload } }
    }, response);

    assert.equal(response.statusCode, 200);
    const result = JSON.parse(response.body);
    assert.equal(result.success, true);
    assert.equal(result.channel, 'vercel_backup_channel');
    assert.equal(result.businessDate, '2026-11-08');
    assert.equal(result.revenueTotal, 3107725);
    assert.equal(result.incomeRows, 1);
    assert.ok(result.backupId);
  } finally {
    process.env.SYSTEM_STATUS_REPORT_TOKEN = origToken;
  }
});
