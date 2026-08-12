import {requireDashboardAdmin} from '@/lib/dashboard/auth';
import {loadServiceHealth} from '@/lib/dashboard/services';
import {Empty,OpsPage,safeDate} from '@/components/ops-shell';
import {getN8nClient,n8nConfigured} from '@/lib/n8n';
export const dynamic='force-dynamic';
export default async function Workflows(){
 await requireDashboardAdmin();
 const health=(await loadServiceHealth()).find(service=>service.id==='n8n');
 let workflows:Array<Record<string,unknown>>=[],executions:Array<Record<string,unknown>>=[],error='';
 if(n8nConfigured())try{const client=getN8nClient();const results=await Promise.all([client.list(),client.executions()]);workflows=results[0].data;executions=results[1].data;}catch(value){error=value instanceof Error?value.message:'n8n unavailable';}
 const failures=executions.filter(item=>item.status==='error'||item.finished===false).length;
 return <OpsPage eyebrow="INTELLIGENCE" title="Workflow Factory" description="Create, validate, deploy disabled, approve, activate, monitor, and retire project-scoped n8n workflows.">
  <div className="metric-grid"><article className="metric green"><span>n8n</span><strong>{health?.status??'Unknown'}</strong></article><article className="metric blue"><span>Workflows</span><strong>{workflows.length}</strong></article><article className="metric purple"><span>Recent executions</span><strong>{executions.length}</strong></article><article className="metric amber"><span>Failures</span><strong>{failures}</strong></article></div>
  {!n8nConfigured()?<section className="panel"><h2>Deployment locked</h2><p className="muted">Configure a scoped N8N_API_KEY for Agent Foundry. Drafting and validation remain available; deployment fails closed.</p></section>:null}
  {error?<section className="notice error">{error}</section>:null}
  <section className="panel"><div className="panel-head"><div><h2>Managed workflows</h2><p>New workflows are deployed disabled and require explicit activation approval.</p></div></div>{workflows.length?<div className="list">{workflows.map(item=><div className="list-row" key={String(item.id)}><span><strong>{String(item.name||item.id)}</strong><small>Updated {safeDate(item.updatedAt as string|undefined)}</small></span><em className={'badge '+(item.active?'status-approved':'')}>{item.active?'Active':'Disabled'}</em></div>)}</div>:<Empty>No n8n workflows are visible through the authorized adapter.</Empty>}</section>
  <section className="panel"><h2>Factory API</h2><p className="instruction">POST /api/workflows validates a Workflow Contract and allowlisted n8n JSON, then deploys it disabled. PATCH /api/workflows/:id activates or deactivates it; activation requires explicit approval.</p></section>
 </OpsPage>;
}
