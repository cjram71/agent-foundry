import type { WorkflowContract } from './index.js';
export type WorkflowRisk='low'|'medium'|'high';
export interface N8nNode{id:string;name:string;type:string;typeVersion:number;position:[number,number];parameters:Record<string,unknown>;credentials?:Record<string,{id:string;name:string}>}
export interface N8nWorkflow{name:string;nodes:N8nNode[];connections:Record<string,Record<string,Array<Array<{node:string;type:string;index:number}>>>>;settings?:Record<string,unknown>}
export const DEFAULT_ALLOWED_N8N_NODES=new Set(['n8n-nodes-base.manualTrigger','n8n-nodes-base.scheduleTrigger','n8n-nodes-base.webhook','n8n-nodes-base.httpRequest','n8n-nodes-base.set','n8n-nodes-base.if','n8n-nodes-base.switch','n8n-nodes-base.merge','n8n-nodes-base.code','n8n-nodes-base.emailSend','n8n-nodes-base.respondToWebhook']);
const forbiddenKey=/(password|secret|token|api.?key|private.?key|authorization)/i;
export function validateN8nWorkflow(workflow:N8nWorkflow,allowed=DEFAULT_ALLOWED_N8N_NODES):string[]{
 const errors:string[]=[];
 if(!workflow.name?.trim())errors.push('workflow name is required');
 if(!Array.isArray(workflow.nodes)||workflow.nodes.length<1||workflow.nodes.length>100)errors.push('workflow must contain 1-100 nodes');
 const names=new Set<string>(),ids=new Set<string>();
 for(const node of workflow.nodes||[]){
  if(!node.id||ids.has(node.id))errors.push('duplicate or missing node id: '+(node.id||'unknown'));ids.add(node.id);
  if(!node.name||names.has(node.name))errors.push('duplicate or missing node name: '+(node.name||'unknown'));names.add(node.name);
  if(!allowed.has(node.type))errors.push('node type is not allowed: '+node.type);
  const inspect=(value:unknown,path:string):void=>{if(!value||typeof value!=='object')return;for(const [key,item] of Object.entries(value as Record<string,unknown>)){if(forbiddenKey.test(key)&&typeof item==='string'&&item.trim())errors.push('embedded credential-like value at '+path+'.'+key);else inspect(item,path+'.'+key);}};
  inspect(node.parameters,'nodes.'+node.name+'.parameters');
  for(const ref of Object.values(node.credentials||{}))if(!ref?.id)errors.push('credential reference requires an id: '+node.name);
 }
 for(const [source,groups] of Object.entries(workflow.connections||{})){if(!names.has(source))errors.push('connection source does not exist: '+source);for(const outputs of Object.values(groups))for(const group of outputs)for(const edge of group)if(!names.has(edge.node))errors.push('connection target does not exist: '+edge.node);}
 return[...new Set(errors)];
}
export function requiresActivationApproval(risk:WorkflowRisk,actions:string[]):boolean{return risk!=='low'||actions.some(action=>/(send|publish|delete|deploy|payment|charge|write|update|create)/i.test(action));}
export function createStarterWorkflow(contract:WorkflowContract):N8nWorkflow{
 const triggerType=/webhook/i.test(contract.trigger)?'n8n-nodes-base.webhook':/schedule|cron|daily|weekly|hourly/i.test(contract.trigger)?'n8n-nodes-base.scheduleTrigger':'n8n-nodes-base.manualTrigger';
 const trigger:N8nNode={id:'trigger',name:'Trigger',type:triggerType,typeVersion:1,position:[0,0],parameters:triggerType.endsWith('webhook')?{path:contract.id,httpMethod:'POST'}:{}};
 const normalize:N8nNode={id:'normalize',name:'Normalize input',type:'n8n-nodes-base.set',typeVersion:3.4,position:[260,0],parameters:{assignments:{assignments:[]},options:{}}};
 return{name:contract.id,nodes:[trigger,normalize],connections:{Trigger:{main:[[{node:'Normalize input',type:'main',index:0}]]}},settings:{executionOrder:'v1'}};
}
export class N8nClient{
 constructor(private readonly baseUrl:string,private readonly apiKey:string){if(!apiKey)throw new Error('N8N_API_KEY is not configured');}
 private async call<T>(path:string,init:RequestInit={}):Promise<T>{const response=await fetch(this.baseUrl+path,{...init,headers:{'content-type':'application/json','X-N8N-API-KEY':this.apiKey,...init.headers},signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('n8n API request failed with HTTP '+response.status);return await response.json() as T;}
 list(){return this.call<{data:Array<Record<string,unknown>>}>('/api/v1/workflows?limit=100');}
 executions(){return this.call<{data:Array<Record<string,unknown>>}>('/api/v1/executions?limit=50');}
 create(workflow:N8nWorkflow){return this.call<Record<string,unknown>>('/api/v1/workflows',{method:'POST',body:JSON.stringify(workflow)});}
 update(id:string,workflow:N8nWorkflow){return this.call<Record<string,unknown>>('/api/v1/workflows/'+encodeURIComponent(id),{method:'PUT',body:JSON.stringify(workflow)});}
 activate(id:string){return this.call<Record<string,unknown>>('/api/v1/workflows/'+encodeURIComponent(id)+'/activate',{method:'POST'});}
 deactivate(id:string){return this.call<Record<string,unknown>>('/api/v1/workflows/'+encodeURIComponent(id)+'/deactivate',{method:'POST'});}
}
