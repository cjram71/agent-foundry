import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXECUTE_JOB_OPTIONS,
  PLAN_JOB_OPTIONS,
  decideEnqueue,
  executeJobId,
  planJobId,
} from '../queue-policy.ts';

test('queue-policy: no existing job means add', () => {
  assert.equal(decideEnqueue(null), 'add');
});

test('queue-policy: finished jobs are replaced (legitimate retry after rollback)', () => {
  assert.equal(decideEnqueue('completed'), 'replace');
  assert.equal(decideEnqueue('failed'), 'replace');
});

test('queue-policy: live jobs are reused, never duplicated', () => {
  for (const state of ['waiting', 'active', 'delayed', 'prioritized', 'waiting-children', 'paused', 'repeat', 'unknown-future-state']) {
    assert.equal(decideEnqueue(state), 'reuse', state);
  }
});

test('queue-policy: job ids are deterministic per task and action (no timestamps)', () => {
  assert.equal(planJobId('task-1'), 'plan-task-1');
  assert.equal(planJobId('task-1'), planJobId('task-1'), 'stable across calls');
  assert.equal(executeJobId('task-1'), 'execute-task-1');
  assert.notEqual(planJobId('task-1'), planJobId('task-2'));
  assert.doesNotMatch(planJobId('task-1'), /-\d{10,}$/, 'no millisecond timestamp suffix');
});

test('queue-policy: plan jobs retry with bounded exponential backoff', () => {
  assert.equal(PLAN_JOB_OPTIONS.attempts, 3, 'transient provider failures deserve bounded retries');
  assert.equal(PLAN_JOB_OPTIONS.backoff.type, 'exponential');
  assert.ok(PLAN_JOB_OPTIONS.backoff.delay >= 10000, 'backoff must be slow enough to matter for rate limits');
  assert.equal(PLAN_JOB_OPTIONS.removeOnComplete, true, 'completed jobs free the deterministic id immediately');
  assert.equal(PLAN_JOB_OPTIONS.removeOnFail, false, 'failed jobs are kept for forensics');
});

test('queue-policy: execute jobs do not blind-retry (side-effecting work)', () => {
  assert.equal(EXECUTE_JOB_OPTIONS.attempts, 1, 'execution is human-gated for recovery; no silent re-execution');
  assert.equal(EXECUTE_JOB_OPTIONS.removeOnComplete, true);
  assert.equal(EXECUTE_JOB_OPTIONS.removeOnFail, false);
});
