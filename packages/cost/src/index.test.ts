import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRatePerMillion, estimateUsd, monthWindowStart, evaluateSpendGuard } from './index';

test('rate parsing: unset, invalid, negative all become 0 (no teeth, visible)', () => {
  assert.equal(parseRatePerMillion(undefined), 0);
  assert.equal(parseRatePerMillion(''), 0);
  assert.equal(parseRatePerMillion('  '), 0);
  assert.equal(parseRatePerMillion('banana'), 0);
  assert.equal(parseRatePerMillion('-1.5'), 0);
  assert.equal(parseRatePerMillion('0.35'), 0.35);
  assert.equal(parseRatePerMillion('2'), 2);
});

test('estimateUsd is linear in tokens and rate, safe on junk', () => {
  assert.equal(estimateUsd(2_000_000, 0.5), 1);
  assert.equal(estimateUsd(500_000, 1.2), 0.6);
  assert.equal(estimateUsd(0, 0.5), 0);
  assert.equal(estimateUsd(123_456, 0), 0);
  assert.equal(estimateUsd(-5, 1), 0);
  assert.equal(estimateUsd(Number.NaN, 1), 0);
});

test('month window anchors to UTC month start', () => {
  const start = monthWindowStart(new Date('2026-08-08T10:24:00Z'));
  assert.equal(start.toISOString(), '2026-08-01T00:00:00.000Z');
  assert.equal(monthWindowStart(new Date('2026-01-31T23:59:59Z')).toISOString(), '2026-01-01T00:00:00.000Z');
});

test('spend guard: brake at the ceiling, permissive below, unlimited at <= 0', () => {
  assert.equal(evaluateSpendGuard({ limitUsd: 50, monthToDateUsd: 49.99, rateConfigured: true }).allowed, true);
  const blocked = evaluateSpendGuard({ limitUsd: 50, monthToDateUsd: 50, rateConfigured: true });
  assert.equal(blocked.allowed, false);
  assert.match(blocked.reason || '', /reached the project limit/);
  assert.equal(evaluateSpendGuard({ limitUsd: 50, monthToDateUsd: 61.2, rateConfigured: true }).allowed, false);
  assert.equal(evaluateSpendGuard({ limitUsd: 0, monthToDateUsd: 999, rateConfigured: true }).allowed, true, 'no limit configured');
  assert.equal(evaluateSpendGuard({ limitUsd: 50, monthToDateUsd: 0, rateConfigured: false }).allowed, true, 'rate unconfigured: $0 spend, permissive by design');
});
