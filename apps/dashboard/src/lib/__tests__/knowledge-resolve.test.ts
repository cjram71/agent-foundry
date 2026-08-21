import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeSurfaceForm } from '../knowledge/resolve';

test('normalizeSurfaceForm lowercases and hyphenates', () => {
  assert.equal(normalizeSurfaceForm('Malla Taipale'), 'malla-taipale');
});

test('normalizeSurfaceForm strips punctuation and collapses whitespace', () => {
  assert.equal(normalizeSurfaceForm('  Boosta Förlag, AB.  '), 'boosta-f-rlag-ab');
});

test('normalizeSurfaceForm returns empty string for input with no alphanumerics', () => {
  assert.equal(normalizeSurfaceForm('---'), '');
});
