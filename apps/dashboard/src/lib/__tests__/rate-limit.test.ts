import test from 'node:test';
import assert from 'node:assert/strict';
import { checkRateLimit, clearRateLimit } from '../rate-limit.ts';

test('rate-limit: attempts within the limit are allowed', () => {
  const key = 'ipl:inside';
  for (let i = 0; i < 5; i++) {
    assert.equal(checkRateLimit(key).allowed, true, `attempt ${i + 1} should be allowed`);
  }
  clearRateLimit(key);
});

test('rate-limit: the attempt beyond the limit is blocked with a positive Retry-After', () => {
  const key = 'ipl:blocked';
  for (let i = 0; i < 5; i++) checkRateLimit(key);
  const result = checkRateLimit(key);
  assert.equal(result.allowed, false);
  assert.ok(result.retryAfter >= 1, 'blocked caller must receive a positive Retry-After');
  clearRateLimit(key);
});

test('rate-limit: keys are isolated from each other', () => {
  const a = 'ipl:a';
  const b = 'ipl:b';
  for (let i = 0; i < 5; i++) checkRateLimit(a);
  assert.equal(checkRateLimit(a).allowed, false);
  assert.equal(checkRateLimit(b).allowed, true);
  clearRateLimit(a);
  clearRateLimit(b);
});

test('rate-limit: clearRateLimit resets the counter (successful login path)', () => {
  const key = 'ipl:clear';
  for (let i = 0; i < 5; i++) checkRateLimit(key);
  assert.equal(checkRateLimit(key).allowed, false);
  clearRateLimit(key);
  assert.equal(checkRateLimit(key).allowed, true);
  clearRateLimit(key);
});

test('rate-limit: window expiry restores access', async () => {
  const key = 'ipl:expiry';
  assert.equal(checkRateLimit(key, 2, 40).allowed, true);
  assert.equal(checkRateLimit(key, 2, 40).allowed, true);
  assert.equal(checkRateLimit(key, 2, 40).allowed, false);
  await new Promise((resolve) => setTimeout(resolve, 70));
  assert.equal(checkRateLimit(key, 2, 40).allowed, true, 'entry expires and a fresh window opens');
  clearRateLimit(key);
});
