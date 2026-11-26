import test from 'node:test';
import assert from 'node:assert/strict';
import { getLineSupabaseConfig, getLineSupabaseSource } from '../api/_auth.js';

const ENV_KEYS = [
  'LINE_SUPABASE_URL',
  'LINE_SUPABASE_SECRET_KEY',
  'LINE_SUPABASE_SERVICE_ROLE_KEY',
  'LINE_SUPABASE_ANON_KEY',
  'SUPABASE_URL',
  'VITE_SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_PUBLISHABLE_KEY',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'VITE_SUPABASE_ANON_KEY',
];

function withEnv(overrides, fn) {
  const backup = {};
  for (const k of ENV_KEYS) {
    backup[k] = process.env[k];
    delete process.env[k];
  }
  Object.assign(process.env, overrides);
  try {
    return fn();
  } finally {
    for (const k of ENV_KEYS) {
      if (backup[k] === undefined) delete process.env[k];
      else process.env[k] = backup[k];
    }
  }
}

test('LINE_SUPABASE_URL is prioritized over finance SUPABASE_URL', () => {
  withEnv({
    SUPABASE_URL: 'https://finance.example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'finance-test-key',
    LINE_SUPABASE_URL: 'https://xyfglvwvirqopbkqirew.supabase.co/',
    LINE_SUPABASE_SERVICE_ROLE_KEY: 'line-test-key',
  }, () => {
    const cfg = getLineSupabaseConfig();
    assert.equal(cfg.url, 'https://xyfglvwvirqopbkqirew.supabase.co');
    assert.equal(cfg.key, 'line-test-key');
    assert.equal(cfg.source, 'line_supabase');
    assert.equal(getLineSupabaseSource(), 'line_supabase');
  });
});

test('falls back smoothly to default SUPABASE_URL when LINE_SUPABASE_URL is unset', () => {
  withEnv({
    VITE_SUPABASE_URL: 'https://finance.example.supabase.co',
    VITE_SUPABASE_PUBLISHABLE_KEY: 'finance-pub-key',
  }, () => {
    const cfg = getLineSupabaseConfig();
    assert.equal(cfg.url, 'https://finance.example.supabase.co');
    assert.equal(cfg.key, 'finance-pub-key');
    assert.equal(cfg.source, 'fallback_default_supabase');
    assert.equal(getLineSupabaseSource(), 'fallback_default_supabase');
  });
});

test('returns null / unconfigured when neither LINE nor finance Supabase env is set', () => {
  withEnv({}, () => {
    assert.equal(getLineSupabaseConfig(), null);
    assert.equal(getLineSupabaseSource(), 'unconfigured');
  });
});
