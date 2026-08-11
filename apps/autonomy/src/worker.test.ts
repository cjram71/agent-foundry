import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRunReport, normalizeAutonomyPolicy } from './worker';

test('normalizes bounded policy values', () => { const p=normalizeAutonomyPolicy({autonomousMode:true,autoApproveMaxRisk:'high',maxParallelTasks:99,maxRepairAttempts:-1,maxTasksPerRun:100,maxTaskCost:999,maxProjectRunCost:9999});assert.equal(p.autoApproveMaxRisk,'medium');assert.equal(p.maxParallelTasks,5);assert.equal(p.maxRepairAttempts,0);assert.equal(p.maxTasksPerRun,50); });
test('report includes task evidence and recommendations', () => { const report=buildRunReport({id:'r1',objective:'test'},[{title:'Feature',id:'t1',state:'AWAITING_APPROVAL',status:'awaiting_human_review',riskLevel:'medium',branchName:'b',pullRequestUrl:'https://github.com/o/r/pull/1',previewUrl:null,tokenUsage:10,estimatedCost:0,agentRuns:[{role:'coder',provider:'local',model:'qwen',status:'success',tokenUsage:10}],attempts:[{attemptNumber:1,status:'completed',commitSha:'abc',outcomeSummary:'passed'}]}]);assert.equal(report.summary.total,1);assert.equal(report.summary.awaitingHuman,1);assert.match(report.recommendations.join(' '),/Review/); });
