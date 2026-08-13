import assert from 'node:assert/strict';
import test from 'node:test';
import { discoveryMissionContract, discoveryRoles, manifestFor, supportRoleIds } from '../boosta-discovery';

test('discovery has independent specialists followed by one CEO synthesis', () => {
  assert.equal(supportRoleIds.length, 5);
  assert.equal(discoveryRoles.at(-1)?.id, 'boosta-ai-ceo');
  assert.equal(new Set(discoveryRoles.map(role => role.id)).size, discoveryRoles.length);
});

test('every discovery agent is read-only and candidate-memory-only', () => {
  for (const role of discoveryRoles) {
    const manifest = manifestFor(role);
    assert.deepEqual(manifest.permissions.filesystem.write, []);
    assert.deepEqual(manifest.permissions.tools.allow, []);
    assert.equal(manifest.contract?.memoryWriteMode, 'candidate-only');
    assert.equal(manifest.risk.approvalRequired, true);
  }
});

test('mission contract prohibits consequential activity', () => {
  assert(discoveryMissionContract.constraints.some(value => value.includes('No spending')));
  assert(discoveryMissionContract.definitionOfDone.some(value => value.includes('Human decision')));
});
