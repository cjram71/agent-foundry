import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePlan, CATALOG_REPOSITORY, CatalogProvenance } from './plan';

const PROVENANCE: CatalogProvenance = { repository: CATALOG_REPOSITORY, commit: 'a'.repeat(40), pinned: true };

function validPlan(agentCount = 2) {
  const agents = Array.from({ length: agentCount }, (_, index) => ({
    catalogId: `${String(index + 1).padStart(2, '0')}-agent`,
    name: `Agent ${index + 1}`,
    reason: 'Specialist fit for this task',
    responsibilities:
      index === 0
        ? ['Review all code changes for defects and security issues']
        : index === 1
          ? ['Write and run unit tests for every modified module']
          : ['Implement the assigned module changes'],
  }));
  return {
    summary: 'Implement the approved instruction with a small verified team',
    selectedAgents: agents,
    catalogSource: { repository: 'https://attacker.example/fake', commit: 'b'.repeat(40), pinned: false },
    steps: [{ order: 1, title: 'Implement', description: 'Apply the planned change', files: ['src/a.ts'], validation: 'npm test' }],
    risks: ['Regression in the billing path'],
    acceptanceCriteria: ['All tests pass'],
  };
}

function allowed(count: number): Set<string> {
  return new Set(Array.from({ length: count }, (_, index) => `${String(index + 1).padStart(2, '0')}-agent`));
}

test('accepts a valid plan and stamps server-side provenance', () => {
  const plan = validatePlan(validPlan(), allowed(2), PROVENANCE, 5);
  assert.deepEqual(plan.catalogSource, PROVENANCE, 'planner-supplied provenance must be overwritten');
  assert.equal(plan.selectedAgents.length, 2);
  assert.equal(plan.catalogSource.pinned, true);
});

test('rejects agents outside the verified catalog, duplicates, and oversized teams', () => {
  const unknown = validPlan();
  unknown.selectedAgents[0].catalogId = '99-not-in-catalog';
  assert.throws(() => validatePlan(unknown, allowed(2), PROVENANCE, 5), /not in the verified catalog/);

  const duplicate = validPlan();
  duplicate.selectedAgents[1] = { ...duplicate.selectedAgents[1], catalogId: duplicate.selectedAgents[0].catalogId };
  assert.throws(() => validatePlan(duplicate, allowed(2), PROVENANCE, 5), /selected twice/);

  const oversized = validPlan(6);
  assert.throws(() => validatePlan(oversized, allowed(6), PROVENANCE, 5), /between 1 and 5/);

  const empty = validPlan(0);
  assert.throws(() => validatePlan(empty, allowed(2), PROVENANCE, 5), /between 1 and 5/);
});

test('manager evaluations may use the wider 15-agent ceiling', () => {
  const plan = validatePlan(validPlan(10), allowed(10), PROVENANCE, 15);
  assert.equal(plan.selectedAgents.length, 10);
});

test('enforces the code review and testing responsibility gate', () => {
  const noReview = validPlan();
  noReview.selectedAgents = [
    { catalogId: '01-agent', name: 'Builder', reason: 'Builds the change', responsibilities: ['Implement all module changes'] },
    { catalogId: '02-agent', name: 'Tester', reason: 'Verifies the change', responsibilities: ['Write and run unit tests'] },
  ];
  assert.throws(() => validatePlan(noReview, allowed(2), PROVENANCE, 5), /code review responsibility/);

  const noTesting = validPlan();
  noTesting.selectedAgents = [
    { catalogId: '01-agent', name: 'Reviewer', reason: 'Reviews the change', responsibilities: ['Code review every change for defects'] },
    { catalogId: '02-agent', name: 'Analyst', reason: 'Analyses the diff', responsibilities: ['Perform static analysis of the change'] },
  ];
  assert.throws(() => validatePlan(noTesting, allowed(2), PROVENANCE, 5), /testing responsibility/);
});

test('rejects malformed plan structure', () => {
  const notObject = () => validatePlan('plan?', allowed(2), PROVENANCE, 5);
  assert.throws(notObject, /not an object/);

  const shortSummary = { ...validPlan(), summary: 'too short' };
  assert.throws(() => validatePlan(shortSummary, allowed(2), PROVENANCE, 5), /summary/);

  const noSteps = { ...validPlan(), steps: [] };
  assert.throws(() => validatePlan(noSteps, allowed(2), PROVENANCE, 5), /steps/);

  const noCriteria = { ...validPlan(), acceptanceCriteria: [] };
  assert.throws(() => validatePlan(noCriteria, allowed(2), PROVENANCE, 5), /acceptance/);

  const badOrder = validPlan();
  (badOrder.steps[0] as Record<string, unknown>).order = 'first';
  assert.throws(() => validatePlan(badOrder, allowed(2), PROVENANCE, 5), /order/);

  const badValidation = validPlan();
  badValidation.steps[0].validation = '   ';
  assert.throws(() => validatePlan(badValidation, allowed(2), PROVENANCE, 5), /validation/);
});

test('bounds free-text fields supplied by the model', () => {
  const longReason = validPlan();
  longReason.selectedAgents[0].reason = 'r'.repeat(601);
  assert.throws(() => validatePlan(longReason, allowed(2), PROVENANCE, 5), /reason/);

  const shortReason = validPlan();
  shortReason.selectedAgents[0].reason = 'short';
  assert.throws(() => validatePlan(shortReason, allowed(2), PROVENANCE, 5), /reason/);

  const longResponsibility = validPlan();
  longResponsibility.selectedAgents[0].responsibilities = ['Review this ' + 'x'.repeat(500)];
  assert.throws(() => validatePlan(longResponsibility, allowed(2), PROVENANCE, 5), /responsibilit/);

  const noResponsibilities = validPlan();
  noResponsibilities.selectedAgents[0].responsibilities = [];
  assert.throws(() => validatePlan(noResponsibilities, allowed(2), PROVENANCE, 5), /responsibilit/);
});
