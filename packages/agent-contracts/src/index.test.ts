import assert from 'node:assert/strict';
import test from 'node:test';
import { certificationReadiness, validateRegistry, type AgentManifest, type ToolDefinition } from './index';

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
test('v2 contracts enforce a narrow job and candidate-only learning', () => {
  const value = agent();
  value.contract = {
    oneJob: 'Produce a verified report', exclusions: ['publish the report'], deliverables: ['one report'],
    operatingLoop: ['apply memory', 'gather', 'do', 'self-check', 'propose learnings', 'report'],
    selfChecks: ['every claim has evidence'], reportFields: ['completed', 'waitingForApproval', 'uncertain'],
    memoryWriteMode: 'candidate-only', consequentialActions: ['modify-firewall'], supervisedTrialsRequired: 5,
    minimumAcceptanceRate: 0.8, scheduling: 'after-certification', maximumRuntimeMinutes: 30, maximumToolCalls: 40,
  };
  assert.deepEqual(validateRegistry([value], tools), []);
  value.contract.memoryWriteMode = 'candidate-only';
  value.contract.exclusions = [];
  assert(validateRegistry([value], tools).some(x => x.includes('exclusion')));
});
test('certification requires trial, quality, security, and Charter evidence', () => {
  const value = agent();
  value.contract = { oneJob: 'Report', exclusions: ['publish'], deliverables: ['report'], operatingLoop: ['gather','do','check','report'], selfChecks: ['sourced'], reportFields: ['completed','waitingForApproval','uncertain'], memoryWriteMode: 'candidate-only', consequentialActions: ['modify-firewall'], supervisedTrialsRequired: 3, minimumAcceptanceRate: 0.8, scheduling: 'after-certification', maximumRuntimeMinutes: 30, maximumToolCalls: 40 };
  assert.equal(certificationReadiness(value, { supervisedRuns: 2, acceptedRuns: 2, requiredTestsPassed: true, securityReviewPassed: true, charterCompliant: true }).ready, false);
  assert.equal(certificationReadiness(value, { supervisedRuns: 5, acceptedRuns: 4, requiredTestsPassed: true, securityReviewPassed: true, charterCompliant: true }).ready, true);
});
