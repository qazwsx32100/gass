import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/sync-cylinder-history.js';

function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
    end(data) {
      if (data && !this.body) {
        try {
          this.body = JSON.parse(data);
        } catch {
          this.body = data;
        }
      }
      return this;
    }
  };
  return res;
}

test('sync-cylinder-history API: rejects non-POST requests with 405', async () => {
  const req = {
    method: 'GET',
    headers: {}
  };
  const res = createMockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.body?.error, 'Method not allowed');
});

test('sync-cylinder-history API: rejects requests with invalid sync secret with 401', async () => {
  const req = {
    method: 'POST',
    headers: {
      'x-erp-sync-secret': 'invalid_secret_token_12345'
    },
    body: {}
  };
  const res = createMockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 401);
  assert.match(res.body?.error, /Unauthorized/);
});

test('sync-cylinder-history API: accepts valid payload with SYSTEM_STATUS_REPORT_TOKEN and returns structured response', async () => {
  const testToken = 'test-system-status-token-secret-64-bytes-sample-token-abc123456789';
  process.env.SYSTEM_STATUS_REPORT_TOKEN = testToken;

  const samplePayload = {
    source: 'shenglong_cylinder',
    businessDate: '2026-11-09',
    companyId: 'COMP001',
    totalHistoricalRecords: 25479,
    depositCount: 13464,
    refundCount: 12015,
    recentMovements: [
      {
        legacy_id: 31406,
        occurred_on: '2026-11-01',
        event_type: 'refund',
        amount: 2000
      }
    ]
  };

  const req = {
    method: 'POST',
    headers: {
      'x-status-token': testToken,
      'content-type': 'application/json'
    },
    body: samplePayload
  };
  const res = createMockRes();
  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.success, true);
  assert.equal(res.body?.channel, 'vercel_backup_channel');
  assert.equal(res.body?.totalHistoricalRecords, 25479);
  assert.equal(res.body?.movementRows, 1);
  assert.ok(res.body?.backupId);
  assert.ok(res.body?.data);
});
