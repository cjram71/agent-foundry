import assert from 'node:assert/strict';
import test from 'node:test';
import { compileMission, validateMissionContract, type MissionContract, type MissionPolicyCeiling } from './index';

const ceiling: MissionPolicyCeiling = { maxRisk: 'medium', maxBudgetUsd: 20, maxTokenBudget: 50_000, maxParallelTasks: 2, allowedToolClasses: ['github-read', 'workspace'], requiredApprovalRules: ['merge'] };
const valid: MissionContract = { goal: 'Ship a reviewed change', constraints: ['Preserve approval gates'], deliverables: ['Patch'], definitionOfDone: ['Tests pass'], failureConditions: ['Secret exposure'], riskLevel: 'medium', budgetUsd: 10, tokenBudget: 20_000, maxParallelTasks: 2, allowedToolClasses: ['workspace'], approvalRules: ['merge'], projectId: 'project-1', provenance: 'operator:request-1' };

test('accepts a bounded mission', () => assert.equal(validateMissionContract(valid, ceiling).ok, true));
test('rejects budget, risk, concurrency, and tool widening', () => {
  const result = validateMissionContract({ ...valid, riskLevel: 'high', budgetUsd: 21, tokenBudget: 50_001, maxParallelTasks: 3, allowedToolClasses: ['root-shell'] }, ceiling);
  for (const expected of ['riskLevel', 'budgetUsd', 'tokenBudget', 'maxParallelTasks', 'allowedToolClasses']) assert(result.errors.some(error => error.includes(expected)));
});
test('requires deterministic completion and failure criteria', () => {
  const result = validateMissionContract({ ...valid, definitionOfDone: [], failureConditions: [] }, ceiling);
  assert.equal(result.ok, false);
});
test('compiler treats AI output as untrusted and fails closed', () => {
  assert.throws(() => compileMission({ ...valid, allowedToolClasses: ['workspace', 'admin'] }, ceiling), /policy permissions/);
  assert.equal(compileMission(valid, ceiling).goal, valid.goal);
});
test('rejects malformed linkage and deadline', () => {
  const result = validateMissionContract({ ...valid, projectId: '../escape', deadline: 'not-a-date' }, ceiling);
  assert.equal(result.ok, false);
});
