import type { AgentRuntimeState, AttentionItem, ServiceSnapshot, SystemStatus } from './types';

const activeStates=new Set(['QUEUED','PLANNING','RUNNING','VALIDATING','REPAIRING','REVIEWING','PR_CREATED','PREVIEW_PENDING']);
export function deriveAgentState(input:{taskState?:string|null;runStatus?:string|null;hasPendingApproval?:boolean}):AgentRuntimeState{
 if(input.hasPendingApproval||input.taskState==='AWAITING_APPROVAL'||input.taskState==='CHANGES_REQUESTED'||input.taskState==='HUMAN_INPUT_REQUIRED')return'approval_required';
 if(['FAILED','CODE_FAILED','INFRASTRUCTURE_FAILED','SECURITY_BLOCKED'].includes(input.taskState||'')||input.runStatus==='failed')return'failed';
 if(input.taskState==='REVIEWING')return'reviewing';if(input.taskState==='REPAIRING')return'working';if(['QUEUED','PLANNING','PREVIEW_PENDING'].includes(input.taskState||''))return'waiting';if(activeStates.has(input.taskState||'')||input.runStatus==='running')return'working';if(!input.taskState&&!input.runStatus)return'idle';return'unknown';
}
export function deriveSystemStatus(input:{emergencyStop:boolean|null;services:ServiceSnapshot[]|null;attention:AttentionItem[]|null;databaseAvailable:boolean;queuesAvailable:boolean}):SystemStatus{
 if(input.emergencyStop===true)return'emergency_stop';if(!input.databaseAvailable)return'unknown';
 const critical=input.attention?.some(item=>item.severity==='critical');if(critical)return'attention_required';
 if(input.services?.some(service=>['stopped','unavailable'].includes(service.status)))return'degraded';
 if(!input.queuesAvailable||!input.services)return'degraded';return'operational';
}
export function nextTaskAction(state:string):string{const actions:Record<string,string>={DRAFT:'Request a plan.',PLANNING:'The orchestrator is preparing a plan.',AWAITING_APPROVAL:'Waiting for owner approval.',QUEUED:'Waiting for the assigned worker.',RUNNING:'The assigned agent is implementing the task.',VALIDATING:'Waiting for Runner validation.',REPAIRING:'A bounded repair attempt is running.',REVIEWING:'Independent review is running.',PR_CREATED:'Draft pull request created.',PREVIEW_PENDING:'Waiting for preview evidence.',PREVIEW_READY:'Preview is ready for review.',CHANGES_REQUESTED:'Waiting for changes to be resubmitted.',HUMAN_INPUT_REQUIRED:'Owner input is required.',APPROVED:'Ready for deliberate completion.',FAILED:'Failed; inspect evidence before retrying.',CODE_FAILED:'Code validation failed.',INFRASTRUCTURE_FAILED:'Infrastructure failed; bounded recovery is required.',SECURITY_BLOCKED:'Security policy quarantined this task.',CANCELLED:'Task was cancelled.',COMPLETED:'Task completed.',REJECTED:'Task was rejected.'};return actions[state]||'Next action is unknown.'}
export function redactDashboardText(value:unknown,max=240):string{const text=typeof value==='string'?value:String(value??'');return text.replace(/(?:bearer\s+|api[_-]?key["'=:\s]+|password["'=:\s]+|token["'=:\s]+)[^\s,;]+/gi,'[REDACTED]').slice(0,max)}
