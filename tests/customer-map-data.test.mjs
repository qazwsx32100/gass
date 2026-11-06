import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeCustomerMapData, normalizeCustomerMapRow, escapeHtml, STATUS_TO_COLOR } from '../src/utils/customerMapData.js';

const raw = JSON.parse(readFileSync(new URL('../src/data/customerMapData.json', import.meta.url), 'utf8'));
const panelSource = readFileSync(new URL('../src/components/GasCustomerMapPanel.jsx', import.meta.url), 'utf8');
const reportsSource = readFileSync(new URL('../src/pages/ReportsView.jsx', import.meta.url), 'utf8');

test('customer map: every status maps to a known color', () => {
  for (const row of raw) {
    assert.ok(row.status in STATUS_TO_COLOR, `unknown status ${row.status} on #${row.id}`);
  }
});

test('customer map: normalized color counts match CUSTOMER_MAP_STATS', () => {
  const data = normalizeCustomerMapData(raw);
  const counts = { blue: 0, green: 0, pink: 0, red: 0, gray: 0 };
  data.forEach((c) => { counts[c.col] += 1; });
  assert.equal(data.length, 3934);
  assert.deepEqual(counts, { blue: 1078, green: 158, pink: 39, red: 157, gray: 2502 });
});

test('customer map: rows without address fall back to navigable coordinates and null days', () => {
  const c = normalizeCustomerMapRow({ id: 1, name: 'x', lat: 25.1, lng: 121.5, status: 'WITHIN_6_MONTHS' });
  assert.equal(c.col, 'blue');
  assert.equal(c.clean, '25.1,121.5');
  assert.equal(c.days, null);
  assert.equal(c.gas, '-');
});

test('customer map: popup text is HTML-escaped', () => {
  assert.equal(escapeHtml('<img src=x onerror=1>"'), '&lt;img src=x onerror=1&gt;&quot;');
});

test('customer map: 500KB dataset is no longer inlined in the component bundle', () => {
  assert.ok(!panelSource.includes('export const ALL_CUSTOMERS_MAP_DATA = ['));
  assert.ok(panelSource.includes("import('../data/customerMapData.json')"));
  assert.ok(panelSource.length < 60000, `panel source still ${panelSource.length} bytes`);
});

test('customer map: ReportsView lazy-loads the map panel', () => {
  assert.ok(!/^import GasCustomerMapPanel from/m.test(reportsSource));
  assert.ok(reportsSource.includes("lazy(() => import('../components/GasCustomerMapPanel'))"));
});
