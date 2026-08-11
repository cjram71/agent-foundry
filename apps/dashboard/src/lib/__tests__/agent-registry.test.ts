import assert from 'node:assert/strict';
import test from 'node:test';
import registry from '../../../../../config/agents/registry.json' with { type: 'json' };
import { isLifecycleAction, manifestChecksum, validateAgentManifest } from '../agent-registry.ts';
import type { AgentManifest } from '@foundry/agent-contracts';

test('all candidate manifests pass the API-boundary validator', () => {
  for (const manifest of registry as AgentManifest[]) assert.doesNotThrow(() => validateAgentManifest(manifest));
});

test('manifest checksums are deterministic and sensitive to versioned content', () => {
  const manifest = registry[0] as AgentManifest;
  assert.equal(manifestChecksum(manifest), manifestChecksum(structuredClone(manifest)));
  const changed = structuredClone(manifest); changed.version = '9.9.9';
  assert.notEqual(manifestChecksum(manifest), manifestChecksum(changed));
});

test('lifecycle action parser rejects arbitrary actions', () => {
  assert.equal(isLifecycleAction('activate'), true);
  assert.equal(isLifecycleAction('retire'), true);
  assert.equal(isLifecycleAction('delete'), false);
  assert.equal(isLifecycleAction('self-approve'), false);
});
