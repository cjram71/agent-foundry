import test from 'node:test';
import assert from 'node:assert/strict';
import { parseChangeRequestNote, MAX_CHANGE_NOTE_CHARS } from '../change-request';

test('accepts a substantive note, trimmed', () => {
  const result = parseChangeRequestNote({ comments: '  Keep the new endpoint but revert the schema change.  ' });
  assert.deepEqual(result, { ok: true, note: 'Keep the new endpoint but revert the schema change.' });
});

test('rejects missing, empty, and non-string notes', () => {
  for (const body of [{}, { comments: '' }, { comments: '   ' }, { comments: 42 }, { comments: null }, null]) {
    const result = parseChangeRequestNote(body);
    assert.equal(result.ok, false, JSON.stringify(body));
    if (!result.ok) assert.match(result.error, /Describe the required changes/);
  }
});

test('rejects notes beyond the bound', () => {
  const result = parseChangeRequestNote({ comments: 'x'.repeat(MAX_CHANGE_NOTE_CHARS + 1) });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /limited to/);
  const atBound = parseChangeRequestNote({ comments: 'x'.repeat(MAX_CHANGE_NOTE_CHARS) });
  assert.equal(atBound.ok, true);
});
