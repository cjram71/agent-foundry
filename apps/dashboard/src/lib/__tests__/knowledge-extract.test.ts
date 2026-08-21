import assert from 'node:assert/strict';
import test from 'node:test';
import { buildExtractionPrompt, parseExtraction } from '../knowledge/extract';

const valid = JSON.stringify({
  entities: [{ localId: 'e1', entityType: 'PERSON', name: 'Malla Taipale', canonicalKey: 'malla-taipale', attributes: {}, confidence: 0.9, excerpt: 'Malla Taipale is the author.', sourceLocation: 'paragraph 1' }],
  relations: [{ fromLocalId: 'e1', toLocalId: 'e1', relationType: 'SELF_TEST', attributes: {}, confidence: 0.5, excerpt: 'Malla Taipale is the author.', sourceLocation: 'paragraph 1' }],
  aliases: [{ surfaceForm: 'Malla', localId: 'e1', confidence: 0.8 }],
});

test('parseExtraction accepts a well-formed response', () => {
  const result = parseExtraction(valid);
  assert.equal(result.entities.length, 1);
  assert.equal(result.relations.length, 1);
  assert.equal(result.aliases.length, 1);
  assert.equal(result.entities[0].canonicalKey, 'malla-taipale');
});

test('parseExtraction rejects non-JSON', () => {
  assert.throws(() => parseExtraction('not json'), /valid JSON/);
});

test('parseExtraction rejects a relation referencing an undeclared entity', () => {
  const bad = JSON.parse(valid);
  bad.relations[0].fromLocalId = 'does-not-exist';
  assert.throws(() => parseExtraction(JSON.stringify(bad)), /must reference a declared entity/);
});

test('parseExtraction rejects an out-of-range confidence', () => {
  const bad = JSON.parse(valid);
  bad.entities[0].confidence = 1.5;
  assert.throws(() => parseExtraction(JSON.stringify(bad)), /confidence must be a number in \[0,1\]/);
});

test('parseExtraction rejects an alias localId that was never declared', () => {
  const bad = JSON.parse(valid);
  bad.aliases[0].localId = 'ghost';
  assert.throws(() => parseExtraction(JSON.stringify(bad)), /must be null or reference a declared entity/);
});

test('parseExtraction accepts a null alias localId (unmatched, kept not dropped)', () => {
  const withNull = JSON.parse(valid);
  withNull.aliases[0].localId = null;
  const result = parseExtraction(JSON.stringify(withNull));
  assert.equal(result.aliases[0].localId, null);
});

test('buildExtractionPrompt includes the document title and content', () => {
  const prompt = buildExtractionPrompt({ title: 'Skolvalet', namespace: 'crm', content: 'A short document body.' });
  assert.match(prompt, /Skolvalet/);
  assert.match(prompt, /A short document body\./);
});
