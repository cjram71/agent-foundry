import { requireDashboardAdmin } from '@/lib/dashboard/auth';
import prisma from '@/lib/prisma';
import { BOOSTA_COMPANY_ID } from '@/lib/company';
import { Empty, OpsPage, safeDate } from '@/components/ops-shell';
import GovernanceControls from './governance-controls';

export const dynamic = 'force-dynamic';

export default async function ProjectGovernancePage() {
  await requireDashboardAdmin();
  const [opportunities, projects] = await Promise.all([
    prisma.opportunity.findMany({ where: { companyId: BOOSTA_COMPANY_ID, status: 'APPROVE', project: null }, orderBy: { updatedAt: 'desc' }, select: { id: true, title: true, customer: true } }),
    prisma.project.findMany({ where: { companyId: BOOSTA_COMPANY_ID }, orderBy: { createdAt: 'desc' }, include: { sourceOpportunity: { select: { title: true } }, plans: { orderBy: { version: 'desc' }, take: 1 }, _count: { select: { tasks: true } } } }),
  ]);
  return <OpsPage eyebrow="PHASE 4" title="Project governance" description="Approved opportunities become draft projects. Execution stays locked until a separate Master Project Plan approval.">
    <GovernanceControls opportunities={opportunities} />
    <section className="panel"><div className="list">
      {projects.map(project => <article className="approval-row" key={project.id} style={{display:'block'}}>
        <div className="panel-head"><div><span className="badge">{project.governanceStatus}</span><h3>{project.name}</h3><p>{project.sourceOpportunity ? `From ${project.sourceOpportunity.title}` : 'Legacy workspace'} · plan v{project.planVersion} · approved v{project.approvedPlanVersion ?? 'none'} · {project._count.tasks} tasks · {safeDate(project.createdAt)}</p></div></div>
        {project.pausedReason ? <p role="alert">Paused: {project.pausedReason}</p> : null}
        {project.sourceOpportunityId ? <GovernanceControls project={{id:project.id,name:project.name,status:project.governanceStatus,latestPlan:project.plans[0] ? {version:project.plans[0].version,status:project.plans[0].status} : null}} /> : <p>Legacy workspace remains governed by its existing authorization and task gates.</p>}
      </article>)}
      {!projects.length ? <Empty>No governed projects exist.</Empty> : null}
    </div></section>
  </OpsPage>;
}
