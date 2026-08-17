import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_AUTONOMY_POLICY, evaluateActionAuthority, evaluateAutonomy } from '../autonomy';

const policy = { ...DEFAULT_AUTONOMY_POLICY, autonomousMode: true };
const context = { projectAuthorized: true, risk: 'medium' as const, taskEstimatedCost: 1, runEstimatedCost: 2, tasksInRun: 3, activeTasks: 1, repairAttempts: 0, emergencyStop: false };

test('authorized bounded yellow work auto-approves', () => assert.equal(evaluateAutonomy(policy, context).decision, 'AUTO_APPROVE'));
test('autonomy is opt-in', () => assert.equal(evaluateAutonomy({ ...policy, autonomousMode: false }, context).decision, 'REQUIRE_HUMAN'));
test('high risk remains human-only', () => assert.equal(evaluateAutonomy(policy, { ...context, risk: 'high' }).decision, 'REQUIRE_HUMAN'));
test('prohibited work is rejected', () => assert.equal(evaluateAutonomy(policy, { ...context, risk: 'prohibited' }).decision, 'REJECT'));
test('emergency stop blocks automatic approval', () => assert.equal(evaluateAutonomy(policy, { ...context, emergencyStop: true }).decision, 'REQUIRE_HUMAN'));
test('task, run, concurrency, and repair limits stop autonomy', () => {
  assert.equal(evaluateAutonomy(policy, { ...context, tasksInRun: 20 }).decision, 'REQUIRE_HUMAN');
  assert.equal(evaluateAutonomy(policy, { ...context, activeTasks: 2 }).decision, 'REQUIRE_HUMAN');
  assert.equal(evaluateAutonomy(policy, { ...context, repairAttempts: 2 }).decision, 'REQUIRE_HUMAN');
  assert.equal(evaluateAutonomy(policy, { ...context, taskEstimatedCost: 3 }).decision, 'REQUIRE_HUMAN');
  assert.equal(evaluateAutonomy(policy, { ...context, runEstimatedCost: 20 }).decision, 'REQUIRE_HUMAN');
});
test('bounded manager evaluation may complete automatically', () => assert.equal(evaluateAutonomy(policy, { ...context, risk: 'high', isManagerEvaluation: true }).decision, 'AUTO_APPROVE'));
test('action authority keeps consequential actions human-only', () => {
  for (const action of ['spending','deployment','communication','contracting','publishing','agent-creation'] as const) assert.equal(evaluateActionAuthority(policy, action, context).allowed, false);
  assert.equal(evaluateActionAuthority(policy, 'internal-analysis', context).allowed, true);
  assert.equal(evaluateActionAuthority(policy, 'draft-pr', context).allowed, true);
});
