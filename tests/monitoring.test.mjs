import assert from 'node:assert/strict';
import test from 'node:test';
import {
  redactMonitoringText,
  sanitizeMonitoringValue,
  sanitizeSentryEvent
} from '../src/utils/monitoringSanitizer.js';
import { captureServerException } from '../api/_monitoring.js';
import { fetchWithTimeout } from '../api/_fetch.js';

test('monitoring sanitizer redacts credentials and personal contact details', () => {
  const cleaned = sanitizeMonitoringValue({
    endpoint: '/api/app-state',
    status: 500,
    password: 'not-for-monitoring',
    nested: {
      authorization: 'Bearer secret-token',
      message: 'user@example.com failed'
    }
  });

  assert.equal(cleaned.endpoint, '/api/app-state');
  assert.equal(cleaned.status, 500);
  assert.equal(cleaned.password, '[REDACTED]');
  assert.equal(cleaned.nested.authorization, '[REDACTED]');
  assert.equal(cleaned.nested.message, '[REDACTED_EMAIL] failed');
});

test('monitoring sanitizer removes request secrets while preserving diagnostics', () => {
  const cleaned = sanitizeSentryEvent({
    message: 'API failed for owner@example.com',
    request: {
      url: 'https://erp.example.com/?token=secret',
      method: 'POST',
      headers: { authorization: 'Bearer secret' },
      data: { password: 'secret' },
      query_string: 'token=secret'
    },
    user: { id: 'SH001', email: 'owner@example.com', role: 'admin' }
  });

  assert.equal(cleaned.message, 'API failed for [REDACTED_EMAIL]');
  assert.deepEqual(cleaned.request, {
    url: 'https://erp.example.com/',
    method: 'POST'
  });
  assert.deepEqual(cleaned.user, { id: 'SH001' });
});

test('monitoring text sanitizer redacts bearer tokens and sensitive query values', () => {
  const value = redactMonitoringText('Bearer abc.def?x=1 https://erp.test/?code=private&ok=1');
  assert.equal(value, 'Bearer [REDACTED]?x=1 https://erp.test/?code=[REDACTED]&ok=1');
});

test('server monitoring stays safely disabled without a DSN', async () => {
  const previousDsn = process.env.SENTRY_DSN;
  delete process.env.SENTRY_DSN;
  try {
    assert.equal(await captureServerException(new Error('test')), false);
  } finally {
    if (previousDsn === undefined) delete process.env.SENTRY_DSN;
    else process.env.SENTRY_DSN = previousDsn;
  }
});

test('upstream requests fail within the configured timeout', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (_input, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
  });

  try {
    await assert.rejects(
      fetchWithTimeout('https://example.test', {}, 5),
      error => error?.code === 'UPSTREAM_TIMEOUT'
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
