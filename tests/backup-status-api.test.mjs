import assert from 'node:assert/strict';
import test from 'node:test';
import handler from '../api/_backup-status.js';

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

test('rejects backup reports without the dedicated token', async () => {
  const originalToken = process.env.SYSTEM_STATUS_REPORT_TOKEN;
  process.env.SYSTEM_STATUS_REPORT_TOKEN = 'expected-backup-token';
  try {
    const response = createResponse();
    await handler({ method: 'POST', headers: {}, body: { type: 'backup' } }, response);
    assert.equal(response.statusCode, 401);
    assert.equal(JSON.parse(response.body).error, 'Unauthorized');
  } finally {
    if (originalToken === undefined) delete process.env.SYSTEM_STATUS_REPORT_TOKEN;
    else process.env.SYSTEM_STATUS_REPORT_TOKEN = originalToken;
  }
});

test('stores an authorized verified backup report', async () => {
  const originalFetch = global.fetch;
  const originalToken = process.env.SYSTEM_STATUS_REPORT_TOKEN;
  const writes = [];
  process.env.SYSTEM_STATUS_REPORT_TOKEN = 'expected-backup-token';
  global.fetch = async (url, options = {}) => {
    if (!options.method) {
      return new Response(JSON.stringify({ lastSuccessAt: '2026-08-29T13:00:00.000Z' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    writes.push({ url, body: JSON.parse(options.body) });
    return new Response('{}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  try {
    const response = createResponse();
    await handler({
      method: 'POST',
      headers: { 'x-system-status-token': 'expected-backup-token' },
      body: {
        type: 'backup',
        success: true,
        checkedAt: '2026-08-30T01:00:00.000Z',
        sourceUpdatedAt: '2026-08-29T13:00:00.000Z',
        ageHours: 12,
        sizeBytes: 136640000,
        verified: true,
        message: 'Backup verified.'
      }
    }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].body.healthy, true);
    assert.equal(writes[0].body.verified, true);
    assert.equal(writes[0].body.lastSuccessAt, '2026-08-30T01:00:00.000Z');
  } finally {
    global.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.SYSTEM_STATUS_REPORT_TOKEN;
    else process.env.SYSTEM_STATUS_REPORT_TOKEN = originalToken;
  }
});
