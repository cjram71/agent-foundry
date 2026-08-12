export * from './n8n.js';
export interface WorkflowContract {
  id: string; version: string; trigger: string; filters: string[]; normalization: string[];
  deterministicSteps: string[]; aiDecisionSteps: string[]; actions: string[]; validation: string[];
  exceptionHandling: string[]; retryStrategy: string; approvalGates: string[]; expectedOutput: string;
  owner: string; projectId?: string; businessId?: string; enabled: boolean;
}
export interface WorkflowInvocation { correlationId:string; input:unknown; approvals:readonly string[]; idempotencyKey:string }
export interface WorkflowAudit { correlationId:string; workflow:string; decision:'accepted'|'denied'; reason:string }
export interface WorkflowExecutionPlan { workflow:string; correlationId:string; idempotencyKey:string; deterministicSteps:string[]; aiDecisionSteps:string[]; actions:string[]; validations:string[] }

const semver=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const id=/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
export function validateWorkflow(contract:WorkflowContract):string[]{
  const errors:string[]=[];
  if(!id.test(contract.id))errors.push('invalid workflow id');
  if(!semver.test(contract.version))errors.push('invalid workflow version');
  if(!contract.trigger.trim())errors.push('trigger is required');
  if(!contract.owner.trim())errors.push('owner is required');
  if(!contract.expectedOutput.trim())errors.push('expectedOutput is required');
  if(!contract.validation.length)errors.push('validation is required');
  if(!contract.exceptionHandling.length)errors.push('exception handling is required');
  if(!contract.retryStrategy.trim())errors.push('retry strategy is required');
  if(contract.aiDecisionSteps.length && !contract.approvalGates.length)errors.push('AI decision steps require an approval gate');
  if(!contract.projectId&&!contract.businessId)errors.push('projectId or businessId scope is required');
  return errors;
}

export class WorkflowFactory {
  private readonly consumed=new Set<string>();
  constructor(private readonly audit:(event:WorkflowAudit)=>void=()=>{}){}
  compile(contract:WorkflowContract, invocation:WorkflowInvocation):WorkflowExecutionPlan{
    const workflow=`${contract.id}@${contract.version}`;
    const deny=(reason:string):never=>{this.audit({correlationId:invocation.correlationId,workflow,decision:'denied',reason});throw new Error(reason);};
    const errors=validateWorkflow(contract); if(errors.length)deny(`Invalid workflow contract: ${errors.join('; ')}`);
    if(!contract.enabled)deny('Workflow is disabled');
    if(!invocation.correlationId.trim())deny('Correlation ID is required');
    if(!invocation.idempotencyKey.trim())deny('Idempotency key is required');
    const key=`${workflow}:${invocation.idempotencyKey}`; if(this.consumed.has(key))deny('Duplicate workflow invocation');
    const missing=contract.approvalGates.filter(gate=>!invocation.approvals.includes(gate)); if(missing.length)deny(`Missing approvals: ${missing.join(', ')}`);
    this.consumed.add(key); this.audit({correlationId:invocation.correlationId,workflow,decision:'accepted',reason:'contract and approvals satisfied'});
    return{workflow,correlationId:invocation.correlationId,idempotencyKey:invocation.idempotencyKey,deterministicSteps:[...contract.filters,...contract.normalization,...contract.deterministicSteps],aiDecisionSteps:[...contract.aiDecisionSteps],actions:[...contract.actions],validations:[...contract.validation]};
  }
}
