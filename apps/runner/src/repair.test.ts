import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRepairBudget, buildCoderPrompt, buildRepairPrompt, ReviewRejectedError, MAX_FEEDBACK_CHARS } from './repair';

test('repair budget parsing: default, zero, ceiling, invalid', () => {
  assert.equal(parseRepairBudget(undefined), 2);
  assert.equal(parseRepairBudget(''), 2);
  assert.equal(parseRepairBudget('   '), 2);
  assert.equal(parseRepairBudget('0'), 0, 'explicit zero disables repair');
  assert.equal(parseRepairBudget('1'), 1);
  assert.equal(parseRepairBudget('3'), 3);
  assert.equal(parseRepairBudget('99'), 3, 'hard ceiling');
  assert.equal(parseRepairBudget('-2'), 0, 'floor');
  assert.equal(parseRepairBudget('not-a-number'), 2, 'invalid input keeps the default');
});

const PARTS = {
  repository: 'acme/widgets',
  title: 'Fix the flaky test',
  instruction: 'Make the billing test deterministic',
  planSummary: '{"summary":"adjust the clock stub …"}',
  context: '\nsrc/billing.test.ts (200 bytes)',
};

test('cycle-0 coder prompt is exactly the pre-P11 contract', () => {
  const prompt = buildCoderPrompt(PARTS);
  assert.match(prompt, /human-gated delivery system/);
  assert.match(prompt, /Implement only the approved task/);
  assert.match(prompt, /Repository: acme\/widgets/);
  assert.match(prompt, /Approved plan: \{"summary":"adjust the clock stub/);
  assert.match(prompt, /Return only JSON/);
  assert.doesNotMatch(prompt, /repair attempt/i, 'cycle 0 must not look like a repair');
});

test('repair prompt carries constraints, bounded feedback, and cycle metadata', () => {
  const prompt = buildRepairPrompt({
    ...PARTS,
    previousSummary: 'Stubbed the clock',
    failureStage: 'command:2',
    feedback: 'FAIL src/billing.test.ts\nExpected 0 got 1',
    cycle: 1,
    budget: 2,
  });
  assert.match(prompt, /human-gated delivery system/, 'constraints never drop');
  assert.match(prompt, /repair attempt 1 of 2/);
  assert.match(prompt, /failed validation stage "command:2"/);
  assert.match(prompt, /Failure output:\nFAIL src\/billing\.test\.ts/);
  assert.match(prompt, /Previous change summary: Stubbed the clock/);
  assert.match(prompt, /Return only JSON/);
});

test('review-rejection repair prompt uses reviewer wording', () => {
  const prompt = buildRepairPrompt({
    ...PARTS,
    previousSummary: 'Changed the schema',
    failureStage: 'review',
    feedback: 'REJECTED: migration drops a column without a guard',
    cycle: 2,
    budget: 3,
  });
  assert.match(prompt, /rejected by the safety review/);
  assert.match(prompt, /Reviewer feedback:\nREJECTED: migration drops/);
});

test('oversized feedback is capped from the tail', () => {
  const prompt = buildRepairPrompt({
    ...PARTS,
    previousSummary: 'x'.repeat(20),
    failureStage: 'command:1',
    feedback: `HEAD${'y'.repeat(MAX_FEEDBACK_CHARS * 2)}TAIL`,
    cycle: 1,
    budget: 2,
  });
  assert.doesNotMatch(prompt, /HEAD/, 'the oldest end of the feedback is dropped');
  assert.match(prompt, /TAIL/, 'the newest end survives');
});

test('ReviewRejectedError caps its message and keeps the full feedback', () => {
  const feedback = `REJECTED: ${'z'.repeat(MAX_FEEDBACK_CHARS * 2)}`;
  const error = new ReviewRejectedError(feedback);
  assert.ok(error.message.length <= MAX_FEEDBACK_CHARS);
  assert.equal(error.feedback, feedback);
  assert.equal(error.name, 'ReviewRejectedError');
});
