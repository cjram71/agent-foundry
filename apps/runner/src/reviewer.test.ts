import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReviewVerdict, combineLensFeedback, isTransientProviderError } from './reviewer';

test('parseReviewVerdict honors the APPROVED/REJECTED contract', () => {
  assert.equal(parseReviewVerdict('APPROVED: clean diff, no unsafe operations'), true);
  assert.equal(parseReviewVerdict('approved — looks good'), true);
  assert.equal(parseReviewVerdict('REJECTED: exfiltrates凭据 via curl'), false);
  assert.equal(parseReviewVerdict('rejected'), false);
});

test('parseReviewVerdict never approves unparseable output', () => {
  assert.equal(parseReviewVerdict(''), null);
  assert.equal(parseReviewVerdict(undefined), null);
  assert.equal(parseReviewVerdict(null), null);
  assert.equal(parseReviewVerdict('   '), null);
  assert.equal(parseReviewVerdict('I think this is probably fine'), null, 'prose is not an APPROVED verdict');
  assert.equal(parseReviewVerdict('NOT APPROVED'), null, 'negated verdict is not APPROVED');
});

test('combineLensFeedback attributes both lenses and bounds total length', () => {
  const combined = combineLensFeedback('APPROVED: safe', 'REJECTED: misses acceptance criterion 2');
  assert.match(combined, /^Safety review: APPROVED: safe/);
  assert.match(combined, /Plan-fidelity review: REJECTED: misses acceptance criterion 2/);
  const huge = combineLensFeedback('s'.repeat(5000), 'f'.repeat(5000));
  assert.ok(huge.length <= 3900);
});


test('transient provider classification falls back on transport failures', () => {
  for (const message of ['fetch failed', 'network socket closed', 'ECONNRESET', 'ETIMEDOUT', 'The operation was aborted due to timeout', '429 RESOURCE_EXHAUSTED']) {
    assert.equal(isTransientProviderError(new Error(message)), true, message);
  }
  assert.equal(isTransientProviderError(new Error('invalid API key')), false);
});
