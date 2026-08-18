import assert from 'node:assert/strict';
import test from 'node:test';

import { isLazyImportLoadError, lazyImportWithRecovery } from '../src/utils/lazyImportRecovery.js';

test('recognizes stale deployment lazy-import failures', () => {
  assert.equal(isLazyImportLoadError(new TypeError('Failed to fetch dynamically imported module: /assets/Reports.js')), true);
  assert.equal(isLazyImportLoadError(new Error('ChunkLoadError: Loading chunk 42 failed')), true);
  assert.equal(isLazyImportLoadError(new Error('報表資料格式錯誤')), false);
});

test('reloads the current page once with a cache-busting marker', async () => {
  const originalWindow = globalThis.window;
  const entries = new Map();
  let replacedUrl = '';

  globalThis.window = {
    location: {
      href: 'https://example.test/?share=true',
      replace(url) { replacedUrl = url; },
    },
    sessionStorage: {
      getItem(key) { return entries.get(key) || null; },
      setItem(key, value) { entries.set(key, value); },
      removeItem(key) { entries.delete(key); },
    },
  };

  try {
    void lazyImportWithRecovery(
      () => Promise.reject(new TypeError('Failed to fetch dynamically imported module')),
      'reports',
    );
    await new Promise((resolve) => setImmediate(resolve));

    const recovered = new URL(replacedUrl);
    assert.equal(recovered.searchParams.get('share'), 'true');
    assert.ok(recovered.searchParams.get('_app_refresh'));
  } finally {
    globalThis.window = originalWindow;
  }
});

test('does not hide real report calculation failures', async () => {
  await assert.rejects(
    lazyImportWithRecovery(() => Promise.reject(new Error('報表資料格式錯誤')), 'reports'),
    /報表資料格式錯誤/,
  );
});
