import assert from 'node:assert/strict';
import test from 'node:test';
import { createBoundedRateLimiter } from '../api/_rateLimit.js';

test('blocks an identity after its configured attempt limit', () => {
  const limiter = createBoundedRateLimiter({ windowMs: 300_000 });

  assert.equal(limiter.check([{ key: 'identity:1:user@example.com', max: 2 }]), false);
  assert.equal(limiter.check([{ key: 'identity:1:user@example.com', max: 2 }]), false);
  assert.equal(limiter.check([{ key: 'identity:1:user@example.com', max: 2 }]), true);
});

test('blocks one IP even when the identity key changes', () => {
  const limiter = createBoundedRateLimiter({ windowMs: 300_000 });

  for (let index = 0; index < 3; index += 1) {
    assert.equal(limiter.check([
      { key: `identity:1:user${index}@example.com`, max: 12 },
      { key: 'ip:1', max: 3 }
    ]), false);
  }

  assert.equal(limiter.check([
    { key: 'identity:1:another@example.com', max: 12 },
    { key: 'ip:1', max: 3 }
  ]), true);
});

test('keeps the limiter storage within its configured bound', () => {
  const limiter = createBoundedRateLimiter({ windowMs: 300_000, maxEntries: 3 });

  for (let index = 0; index < 10; index += 1) {
    limiter.check([{ key: `identity:${index}`, max: 12 }]);
  }

  assert.equal(limiter.size(), 3);
});
