import assert from 'node:assert/strict';
import test from 'node:test';
import { parseKnowledgeAgentResult } from './agent-result';
test('accepts a bounded sourced agent result', () => {
  const result = parseKnowledgeAgentResult(JSON.stringify({
    completed: ['market scan'], waitingForApproval: [], uncertain: ['market size'], evidence: ['https://a.test', 'https://b.test'],
    memoryCandidates: [{ summary: 'Observed pricing', content: 'Competitor pricing observed', sourceReference: 'https://a.test', confidence: 0.8 }], artifact: '# Brief\nSourced result',
  }));
  assert.equal(result.evidence.length, 2); assert.equal(result.memoryCandidates[0].confidence, 0.8);
});
test('rejects unsourced and malformed output', () => {
  assert.throws(() => parseKnowledgeAgentResult(JSON.stringify({ completed: [], waitingForApproval: [], uncertain: [], evidence: [], memoryCandidates: [], artifact: 'brief' })), /two evidence/);
  assert.throws(() => parseKnowledgeAgentResult('{bad'), /JSON/);
});
test('rejects invalid memory candidates', () => {
  assert.throws(() => parseKnowledgeAgentResult(JSON.stringify({ completed: [], waitingForApproval: [], uncertain: [], evidence: ['a','b'], memoryCandidates: [{ summary: 'x', content: 'y', sourceReference: '', confidence: 2 }], artifact: 'brief' })), /invalid/);
});
