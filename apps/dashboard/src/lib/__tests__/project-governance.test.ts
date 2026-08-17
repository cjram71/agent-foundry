import assert from 'node:assert/strict';
import test from 'node:test';
import { hashMasterPlan, isApprovedGovernance, masterPlanSections, normalizeMasterPlan, validRepositoryPart } from '../project-governance.ts';

const complete = Object.fromEntries(masterPlanSections.map((key) => [key, `${key} plan`]));

test('master plans require every governance section', () => {
  assert.equal(Object.keys(normalizeMasterPlan(complete)).length, masterPlanSections.length);
  assert.throws(() => normalizeMasterPlan({ objective: 'only one' }), /customer is required/);
});

test('master plan hashing is deterministic', () => {
  const plan = normalizeMasterPlan(complete);
  assert.equal(hashMasterPlan(plan), hashMasterPlan(plan));
});

test('governance and repository values fail closed', () => {
  assert.equal(isApprovedGovernance('APPROVED'), true);
  assert.equal(isApprovedGovernance('PLAN_PENDING_APPROVAL'), false);
  assert.equal(validRepositoryPart('cjram71'), true);
  assert.equal(validRepositoryPart('../escape'), false);
});
