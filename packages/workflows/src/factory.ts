import type {WorkflowContract} from './index.js';
import {createStarterWorkflow,requiresActivationApproval,type N8nWorkflow,type WorkflowRisk} from './n8n.js';
export interface ProjectAutomationContext{projectId:string;projectName:string;productionUrl?:string|null;taskCounts?:Record<string,number>;failedQueueJobs?:number}
export interface AutomationRecommendation{id:string;title:string;description:string;risk:WorkflowRisk;value:string}
export function recommendProjectAutomations(context:ProjectAutomationContext):AutomationRecommendation[]{
 const items:AutomationRecommendation[]=[
  {id:'daily-operator-digest',title:'Daily operator digest',description:'Summarize project tasks, approvals, failures, and service health each morning.',risk:'low',value:'Faster daily oversight'},
  {id:'failure-alert',title:'Failure and recovery alerts',description:'Watch operational health, deduplicate failures, and notify the owner when service recovers.',risk:'medium',value:'Shorter incident response'},
 ];
 if(context.productionUrl)items.push({id:'production-health',title:'Production availability monitor',description:'Check the project production URL and escalate repeated failures.',risk:'low',value:'Earlier outage detection'});
 if((context.taskCounts?.DRAFT||0)>0)items.push({id:'approval-reminder',title:'Task and approval reminder',description:'Send a digest when project tasks remain ready for owner decisions.',risk:'low',value:'Less stalled work'});
 return items;
}
const slug=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60)||'workflow';
export function draftWorkflow(projectId:string,projectName:string,intent:string,risk:WorkflowRisk='medium'):{contract:WorkflowContract;workflow:N8nWorkflow;risk:WorkflowRisk}{
 const id=slug(projectName+'-'+intent.slice(0,40));
 const scheduled=/daily|weekly|hourly|schedule|monitor|digest|report|check/i.test(intent),webhook=/webhook|when |on new|submitted|purchase|payment/i.test(intent);
 const trigger=webhook?'webhook event':scheduled?'daily schedule':'manual trigger';
 const sideEffect=/(send|email|publish|update|create|delete|deploy|notify|payment|charge)/i.test(intent);
 const contract:WorkflowContract={id,version:'1.0.0',trigger,filters:['accept project-scoped input only'],normalization:['normalize input into a stable schema'],deterministicSteps:[intent],aiDecisionSteps:[],actions:sideEffect?[intent]:['prepare a reviewable result'],validation:['required output is present','execution contains no embedded credentials'],exceptionHandling:['record the failure and notify the owner after retry exhaustion'],retryStrategy:'two attempts with bounded exponential backoff',approvalGates:requiresActivationApproval(risk,[intent])?['workflow_activation']:[],expectedOutput:'An auditable workflow result for '+projectName,owner:'project owner',projectId,enabled:true};
 return{contract,workflow:createStarterWorkflow(contract),risk};
}
