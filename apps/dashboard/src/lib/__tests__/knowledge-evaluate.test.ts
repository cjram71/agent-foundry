import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { buildFidelityPrompt, evaluateEvidenceDeterministically, parseFidelityVerdicts } from '../knowledge/evaluate';

const excerpt = 'Malla Taipale is the author.';
const excerptHash = createHash('sha256').update(excerpt).digest('hex');
const companyId = 'BSTA-COMP-001';
const entityRow = { id: 'ev1', companyId, excerpt, excerptHash, sourceLocation: 'p1', entityId: 'e1', relationId: null, entity: { companyId, confidence: 0.9, name: 'Malla Taipale' }, relation: null };

test('evaluateEvidenceDeterministically approves a well-formed entity claim', () => {
  const result = evaluateEvidenceDeterministically(entityRow);
  assert.equal(result.approved, true);
  assert.equal(result.reason, null);
});

test('evaluateEvidenceDeterministically rejects a tampered excerpt (hash mismatch)', () => {
  const result = evaluateEvidenceDeterministically({ ...entityRow, excerpt: 'a different excerpt than what was hashed' });
  assert.equal(result.approved, false);
  assert.match(result.reason ?? '', /excerpt hash/);
});

test('evaluateEvidenceDeterministically rejects evidence citing neither an entity nor a relation', () => {
  const result = evaluateEvidenceDeterministically({ ...entityRow, entityId: null, entity: null });
  assert.match(result.reason ?? '', /exactly one entity or relation/);
});

test('evaluateEvidenceDeterministically rejects evidence citing both an entity and a relation', () => {
  const result = evaluateEvidenceDeterministically({ ...entityRow, relationId: 'r1', relation: { companyId, confidence: 0.5, relationType: 'X' } });
  assert.match(result.reason ?? '', /exactly one entity or relation/);
});

test('evaluateEvidenceDeterministically rejects a cross-company reference', () => {
  const result = evaluateEvidenceDeterministically({ ...entityRow, entity: { companyId: 'OTHER-COMPANY', confidence: 0.9, name: 'X' } });
  assert.match(result.reason ?? '', /different company/);
});

test('evaluateEvidenceDeterministically rejects an out-of-range confidence', () => {
  const result = evaluateEvidenceDeterministically({ ...entityRow, entity: { companyId, confidence: 1.5, name: 'X' } });
  assert.match(result.reason ?? '', /confidence is out of range/);
});

test('buildFidelityPrompt includes each claim excerpt and id', () => {
  const prompt = buildFidelityPrompt([entityRow]);
  assert.match(prompt, /ev1/);
  assert.match(prompt, /Malla Taipale is the author\./);
});

test('parseFidelityVerdicts accepts one entry per expected claim', () => {
  const text = JSON.stringify({ verdicts: [{ claimId: 'ev1', verdict: 'APPROVED', reason: 'supported' }] });
  const result = parseFidelityVerdicts(text, ['ev1']);
  assert.equal(result.length, 1);
  assert.equal(result[0].verdict, 'APPROVED');
});

test('parseFidelityVerdicts rejects a bare top-level array (must be an object with a verdicts array)', () => {
  const text = JSON.stringify([{ claimId: 'ev1', verdict: 'APPROVED', reason: '' }]);
  assert.throws(() => parseFidelityVerdicts(text, ['ev1']), /must be a JSON object with a "verdicts" array/);
});

test('parseFidelityVerdicts rejects a claimId outside this run', () => {
  const text = JSON.stringify({ verdicts: [{ claimId: 'not-in-this-run', verdict: 'APPROVED', reason: '' }] });
  assert.throws(() => parseFidelityVerdicts(text, ['ev1']), /must reference a claim in this run/);
});

test('parseFidelityVerdicts rejects a missing claim (not exactly one entry per claim)', () => {
  const text = JSON.stringify({ verdicts: [] });
  assert.throws(() => parseFidelityVerdicts(text, ['ev1']), /exactly one entry per claim/);
});

test('parseFidelityVerdicts rejects an invalid verdict value', () => {
  const text = JSON.stringify({ verdicts: [{ claimId: 'ev1', verdict: 'MAYBE', reason: '' }] });
  assert.throws(() => parseFidelityVerdicts(text, ['ev1']), /must be APPROVED or REJECTED/);
});
