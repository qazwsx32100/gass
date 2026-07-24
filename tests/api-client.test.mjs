import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/db/apiClient.js', import.meta.url), 'utf8');
const moduleSource = source
  .replace(/^import[^\n]*\n/gm, '')
  .replace(/export const /g, 'const ')
  .replace(/\nconst getApiBaseUrl[\s\S]*$/, '\nreturn { resolveApiBaseUrl };');

const { resolveApiBaseUrl } = new Function(moduleSource)();

test('uses relative API base on normal web deployment', () => {
  assert.equal(resolveApiBaseUrl({ protocol: 'https:' }), '');
});

test('uses configured API base when provided', () => {
  assert.equal(
    resolveApiBaseUrl({ configuredUrl: 'https://example.com/', protocol: 'https:' }),
    'https://example.com'
  );
});

test('uses production API base for packaged app protocols', () => {
  assert.equal(
    resolveApiBaseUrl({ protocol: 'file:' }),
    'https://erp-weld-three-96.vercel.app'
  );
});
