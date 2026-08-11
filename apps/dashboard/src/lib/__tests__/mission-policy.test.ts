import assert from 'node:assert/strict';
import test from 'node:test';
import { compileOperatorMission, missionCeiling } from '../mission-policy';

const policy = { maxTaskRisk: 'medium', maxParallelTasks: 2, maxProjectRunCost: 20, requirePlanApproval: true, requireMergeApproval: true };
const request = { goal: 'Ship safely', constraints: ['No production writes'], deliverables: ['Reviewed patch'], definitionOfDone: ['Tests pass'], failureConditions: ['Secret leak'], riskLevel: 'medium', budgetUsd: 10, tokenBudget: 10_000, maxParallelTasks: 2, allowedToolClasses: ['workspace'], approvalRules: ['plan', 'merge'] };

test('derives fail-closed policy defaults', () => assert.equal(missionCeiling({ ...policy, maxTaskRisk: 'unknown' }).maxRisk, 'low'));
test('overrides client provenance and linkage', () => {
  const mission = compileOperatorMission({ ...request, projectId: 'other', provenance: 'ai:forged' }, 'project-1', 'user-1', policy);
  assert.equal(mission.projectId, 'project-1');
  assert.equal(mission.provenance, 'operator:user-1');
});
test('cannot omit human approval gates', () => assert.throws(() => compileOperatorMission({ ...request, approvalRules: [] }, 'project-1', 'user-1', policy), /approval/));
test('cannot request an unregistered tool class', () => assert.throws(() => compileOperatorMission({ ...request, allowedToolClasses: ['root-shell'] }, 'project-1', 'user-1', policy), /permissions/));
