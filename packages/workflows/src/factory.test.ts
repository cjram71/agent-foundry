import test from 'node:test';
import assert from 'node:assert/strict';
import {draftWorkflow,recommendProjectAutomations,validateN8nWorkflow} from './index.js';
test('recommendations adapt to production and draft work',()=>{const items=recommendProjectAutomations({projectId:'p1',projectName:'Example',productionUrl:'https://example.com',taskCounts:{DRAFT:2}});assert.deepEqual(items.map(item=>item.id),['daily-operator-digest','failure-alert','production-health','approval-reminder']);});
test('drafts are project scoped, reviewable, and valid',()=>{const draft=draftWorkflow('p1','Example','Send a daily internal project health digest','medium');assert.equal(draft.contract.projectId,'p1');assert.deepEqual(draft.contract.approvalGates,['workflow_activation']);assert.deepEqual(validateN8nWorkflow(draft.workflow),[]);});
