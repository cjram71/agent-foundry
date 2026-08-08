import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MANAGER_LIMITS,
  parseManagerPlan,
  sanitizeText,
  buildTaskDrafts,
} from '../index.ts';
import { DEFAULT_POLICY } from '@foundry/policy';

const POLICY = DEFAULT_POLICY;

// ---------- parse ----------

test('parse: valid planner output yields bounded, re-sequenced steps', () => {
  const raw = JSON.stringify({
    summary: 'plan',
    selectedAgents: [{ catalogId: 'x' }],
    steps: [
      { order: 1, title: 'Assess the repository', description: 'Look at things.', files: ['src/'], validation: 'npm test' },
      { order: 2, title: 'Draft roadmap', description: 'Write it down.' },
    ],
    risks: ['scope'],
    acceptanceCriteria: ['All steps reviewed by a human'],
  });
  const parsed = parseManagerPlan(raw);
  assert.ok(parsed);
  assert.equal(parsed.steps.length, 2);
  assert.deepEqual(parsed.steps.map((s) => s.order), [1, 2]);
  assert.equal(parsed.steps[0].validation, 'npm test');
  assert.equal(parsed.steps[1].validation, null);
  assert.deepEqual(parsed.acceptanceCriteria, ['All steps reviewed by a human']);
  assert.equal(parsed.dropped, 0);
});

test('parse: non-plan documents return null instead of throwing', () => {
  assert.equal(parseManagerPlan('not json'), null);
  assert.equal(parseManagerPlan('[1,2,3]'), null);
  assert.equal(parseManagerPlan('42'), null);
  assert.equal(parseManagerPlan(undefined), null);
  assert.equal(parseManagerPlan('{"steps":"nope"}') === null, false, 'object without steps array parses to an empty plan');
});

test('parse: malformed and over-limit steps are dropped and counted, never repaired', () => {
  const raw = JSON.stringify({
    steps: [
      'a plain string',
      { title: 'no' },
      { title: 'Valid step here', description: 'ok' },
      { title: 'Valid step here', description: 'duplicate title' },
      { title: 'x'.repeat(MANAGER_LIMITS.maxTitleLength + 1), description: 'too long' },
    ],
  });
  const parsed = parseManagerPlan(raw);
  assert.ok(parsed);
  assert.deepEqual(parsed.steps.map((s) => s.title), ['Valid step here']);
  assert.equal(parsed.dropped, 4);
});

test('parse: step and criteria counts are capped', () => {
  const many = Array.from({ length: MANAGER_LIMITS.maxSteps + 5 }, (_, i) => ({ title: `Step number ${i}`, description: 'd' }));
  const raw = JSON.stringify({ steps: many, acceptanceCriteria: Array.from({ length: 30 }, (_, i) => `c${i}`) });
  const parsed = parseManagerPlan(raw);
  assert.ok(parsed);
  assert.equal(parsed.steps.length, MANAGER_LIMITS.maxSteps);
  assert.equal(parsed.dropped, 5);
  assert.equal(parsed.acceptanceCriteria.length, MANAGER_LIMITS.maxAcceptanceCriteria);
});

test('parse: control characters and runaway whitespace are sanitized', () => {
  assert.equal(sanitizeText('ab\n\n\t c'), 'a b c');
  const parsed = parseManagerPlan(JSON.stringify({ steps: [{ title: 'Do    the   thing', description: 'line1\nline2' }] }));
  assert.ok(parsed);
  assert.equal(parsed.steps[0].title, 'Do the thing');
  assert.equal(parsed.steps[0].description, 'line1 line2');
});

// ---------- drafts ----------

test('drafts: descriptors use the fixed template; noise-free steps stay low risk', () => {
  const parse = parseManagerPlan(JSON.stringify({
    steps: [{ title: 'Harden login rate limiting', description: 'Add tests around the limiter.', validation: 'npm test' }],
    acceptanceCriteria: ['Limiter covered by tests'],
  }));
  assert.ok(parse);
  const plan = buildTaskDrafts({ parse, projectName: 'Demo', evaluationTaskId: 'eval-1', policy: POLICY });
  assert.equal(plan.drafts.length, 1);
  const draft = plan.drafts[0];
  assert.match(draft.completeInstruction, /approved AI Project Manager evaluation for Demo/);
  assert.match(draft.completeInstruction, /evaluation task eval-1/);
  assert.match(draft.completeInstruction, /Step 1: Harden login rate limiting/);
  assert.match(draft.completeInstruction, /- Limiter covered by tests/);
  assert.equal(draft.effectiveRisk, 'low', 'no detector fires on rate-limit test work');
  assert.deepEqual(plan.skipped, []);
});

test('drafts: high-risk step content escalates the descriptor risk deterministically', () => {
  const parse = parseManagerPlan(JSON.stringify({
    steps: [{ title: 'Prepare production rollout', description: 'Plan how to deploy to production safely with a checklist.' }],
  }));
  assert.ok(parse);
  const plan = buildTaskDrafts({ parse, projectName: 'Demo', evaluationTaskId: 'e', policy: POLICY });
  assert.equal(plan.drafts.length, 1, 'admitted under the default high ceiling');
  assert.equal(plan.drafts[0].effectiveRisk, 'high');
});

test('drafts: prohibited steps are excluded with rule ids, never created', () => {
  const parse = parseManagerPlan(JSON.stringify({
    steps: [
      { title: 'Auto-merge the update into production', description: 'Ship it.' },
      { title: 'Write the launch checklist', description: 'Normal work.' },
    ],
  }));
  assert.ok(parse);
  const plan = buildTaskDrafts({ parse, projectName: 'Demo', evaluationTaskId: 'e', policy: POLICY });
  assert.deepEqual(plan.drafts.map((d) => d.title), ['Write the launch checklist']);
  assert.equal(plan.skipped.length, 1);
  assert.equal(plan.skipped[0].order, 1);
  assert.ok(plan.skipped[0].matchedRules.includes('prohibited.auto-merge-bypass'));
});

test('drafts: tightened project ceiling filters steps the same way as task creation', () => {
  const parse = parseManagerPlan(JSON.stringify({
    steps: [
      { title: 'Adjust billing page layout', description: 'Move the invoice table.' },
      { title: 'Typo fix in footer', description: 'One word.' },
    ],
  }));
  assert.ok(parse);
  const plan = buildTaskDrafts({ parse, projectName: 'Demo', evaluationTaskId: 'e', policy: { ...POLICY, maxTaskRisk: 'low' } });
  assert.deepEqual(plan.drafts.map((d) => d.title), ['Typo fix in footer']);
  assert.equal(plan.skipped.length, 1);
  assert.ok(plan.skipped[0].reasons[0].includes("'low'"));
});

test('drafts: unusable evaluation output yields an empty plan rather than an error', () => {
  const plan = buildTaskDrafts({ parse: parseManagerPlan('garbage'), projectName: 'Demo', evaluationTaskId: 'e', policy: POLICY });
  assert.deepEqual(plan.drafts, []);
  assert.deepEqual(plan.skipped, []);
});
