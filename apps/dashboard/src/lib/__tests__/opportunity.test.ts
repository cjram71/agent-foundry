import assert from 'node:assert/strict';import test from 'node:test';import{isOpportunityDecision,scoreOpportunity,scoreKeys,validateEvidence}from'../opportunity.ts';
const scores=Object.fromEntries(scoreKeys.map(key=>[key,7])) as Parameters<typeof scoreOpportunity>[0];
test('opportunity scoring is deterministic and bounded',()=>{assert.equal(scoreOpportunity(scores),scoreOpportunity(scores));assert(scoreOpportunity(scores)>=0&&scoreOpportunity(scores)<=100)});
test('risk and cost reduce the opportunity score',()=>{assert(scoreOpportunity({...scores,risk:1,cost:1})>scoreOpportunity({...scores,risk:10,cost:10}))});
test('evidence and human decision inputs fail closed',()=>{assert.throws(()=>validateEvidence(['one']),/2 evidence/);assert.equal(isOpportunityDecision('APPROVE'),true);assert.equal(isOpportunityDecision('AUTO_APPROVE'),false)});
