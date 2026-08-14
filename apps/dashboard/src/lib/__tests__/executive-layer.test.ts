import assert from 'node:assert/strict';
import test from 'node:test';
import { phaseTwoDepartmentCodes, validateExecutiveLayer } from '../executive-layer.ts';

const departments = phaseTwoDepartmentCodes.map((code) => ({ code }));
const limits = { spending: false, contracts: false, publishing: false, communications: false, deployment: false };
const agents = [
  { id: 'BSTA-EXEC-001', managerId: null, status: 'STAGING', financialLimitMinor: BigInt(0), externalActionLimit: limits },
  { id: 'BSTA-EXEC-002', managerId: 'BSTA-EXEC-001', status: 'STAGING', financialLimitMinor: BigInt(0), externalActionLimit: limits },
];

test('Phase 2 registry contains every department and the CEO to COO hierarchy', () => {
  assert.deepEqual(validateExecutiveLayer({ departments, agents }), []);
});

test('Phase 2 fails closed on authority or hierarchy drift', () => {
  const unsafe = structuredClone(agents);
  unsafe[1].managerId = null;
  unsafe[1].financialLimitMinor = BigInt(1);
  unsafe[1].externalActionLimit = { ...limits, communications: true };
  assert.deepEqual(validateExecutiveLayer({ departments, agents: unsafe }), [
    'AI COO must report to the AI CEO',
    'BSTA-EXEC-002 must have zero financial authority',
    'BSTA-EXEC-002 has an external action enabled',
  ]);
});
