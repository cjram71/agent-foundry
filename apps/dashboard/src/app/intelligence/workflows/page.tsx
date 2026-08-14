import {requireDashboardAdmin} from '@/lib/dashboard/auth';
import {loadServiceHealth} from '@/lib/dashboard/services';
import {OpsPage} from '@/components/ops-shell';
import {getN8nClient,n8nConfigured} from '@/lib/n8n';
import prisma from '@/lib/prisma';
import {WorkflowFactoryConsole} from './workflow-factory-console';
export const dynamic='force-dynamic';
export default async function Workflows(){
 await requireDashboardAdmin();
 const configured=n8nConfigured();
 const [health,projects]=await Promise.all([loadServiceHealth(),prisma.project.findMany({where:{authorisedStatus:true},orderBy:{createdAt:'desc'},select:{id:true,name:true,productionUrl:true}})]);
 let workflows:Array<Record<string,unknown>>=[],executions:Array<Record<string,unknown>>=[],error='';
 if(configured)try{const client=getN8nClient();const results=await Promise.all([client.list(),client.executions()]);workflows=results[0].data;executions=results[1].data;}catch(value){error=value instanceof Error?value.message:'n8n unavailable';}
 const failures=executions.filter(item=>item.status==='error'||item.finished===false).length;
 return <OpsPage eyebrow="INTELLIGENCE" title="Workflow Factory" description="Create, validate, deploy disabled, approve, activate, monitor, and retire Boosta workspace-scoped n8n workflows.">
  <div className="metric-grid"><article className="metric green"><span>n8n</span><strong>{health.find(item=>item.id==='n8n')?.status??'Unknown'}</strong></article><article className="metric blue"><span>Workflows</span><strong>{workflows.length}</strong></article><article className="metric purple"><span>Recent executions</span><strong>{executions.length}</strong></article><article className="metric amber"><span>Failures</span><strong>{failures}</strong></article></div>
  {error?<section className="notice error">{error}</section>:null}
  <WorkflowFactoryConsole projects={projects} initialWorkflows={workflows} initialExecutions={executions} configured={configured}/>
 </OpsPage>;
}
