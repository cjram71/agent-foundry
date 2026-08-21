import assert from 'node:assert/strict';
import test from 'node:test';
import { estimateTokens, postCallOverage } from '../knowledge/budget';

test('estimateTokens scales with content length plus a fixed overhead', () => {
  const short = estimateTokens('a'.repeat(400));
  const long = estimateTokens('a'.repeat(4000));
  assert.ok(short > 1000, 'includes the fixed prompt overhead');
  assert.ok(long > short, 'longer content estimates more tokens');
});

test('postCallOverage passes when actual usage is within limits', () => {
  assert.equal(postCallOverage(1000, 5000, 1000), null);
});

test('postCallOverage fails closed when actual tokens exceed the run limit', () => {
  const reason = postCallOverage(6000, 5000, 1000);
  assert.match(reason ?? '', /exceeded this run's token limit/);
});

test('postCallOverage fails closed when actual cost exceeds the run limit (rate configured)', () => {
  const previous = process.env.TOKEN_COST_PER_MILLION_USD;
  process.env.TOKEN_COST_PER_MILLION_USD = '1000000'; // $1 per token, forces an overage on a tiny cost limit
  try {
    const reason = postCallOverage(100, 100_000, 1); // 1 cent limit
    assert.match(reason ?? '', /exceeded this run's cost limit/);
  } finally {
    if (previous === undefined) delete process.env.TOKEN_COST_PER_MILLION_USD; else process.env.TOKEN_COST_PER_MILLION_USD = previous;
  }
});
