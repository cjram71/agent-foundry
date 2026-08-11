import assert from 'node:assert/strict';
import test from 'node:test';
import { validateRegistry, type AgentManifest, type ToolDefinition } from './index';

const tools: ToolDefinition[] = [
  { id: 'health-check', description: 'Read health', risk: 'green', sideEffect: false, approvalRequired: false, executor: 'control-plane' },
  { id: 'modify-firewall', description: 'Change firewall', risk: 'red', sideEffect: true, approvalRequired: true, executor: 'human-only' },
  { id: 'unrestricted-root-shell', description: 'Root shell', risk: 'black', sideEffect: true, approvalRequired: true, executor: 'never' },
  { id: 'docker-socket', description: 'Rootful Docker socket', risk: 'black', sideEffect: true, approvalRequired: true, executor: 'never' },
  { id: 'disable-audit-logs', description: 'Disable logs', risk: 'black', sideEffect: true, approvalRequired: true, executor: 'never' },
  { id: 'self-approve-privilege', description: 'Self approve', risk: 'black', sideEffect: true, approvalRequired: true, executor: 'never' }
];

function agent(): AgentManifest {
  return {
    id: 'test-agent', name: 'Test', version: '1.0.0', status: 'staging', mission: 'Test policy validation', responsibilities: ['test'],
    models: { primary: 'local:test', fallback: 'local:test', permitted: ['local:test'] },
    permissions: { filesystem: { read: ['/tmp'], write: ['/tmp/test'] }, network: [], tools: { allow: ['health-check'], approvalRequired: ['modify-firewall'], deny: ['unrestricted-root-shell', 'docker-socket', 'disable-audit-logs', 'self-approve-privilege'] }, databases: { read: [], write: [] } },
    memory: { read: ['working'], write: ['working'] }, budget: { maximumTaskCostUsd: 1, maximumDailyCostUsd: 5, tokenLimit: 1000, retries: 1 },
    risk: { classification: 'yellow', approvalRequired: false, escalationRules: ['escalate red'] }, evaluation: { requiredTests: ['unit'] }, logging: { enabled: true }
  };
}

test('accepts a least-privilege manifest', () => assert.deepEqual(validateRegistry([agent()], tools), []));
test('rejects root write and red auto-allow', () => {
  const value = agent(); value.permissions.filesystem.write = ['/']; value.permissions.tools.allow = ['modify-firewall']; value.permissions.tools.approvalRequired = [];
  const errors = validateRegistry([value], tools); assert(errors.some(e => e.includes('root filesystem'))); assert(errors.some(e => e.includes('high-risk')));
});
test('requires mandatory black denies', () => { const value = agent(); value.permissions.tools.deny = []; assert(validateRegistry([value], tools).filter(e => e.includes('mandatory deny')).length === 4); });
