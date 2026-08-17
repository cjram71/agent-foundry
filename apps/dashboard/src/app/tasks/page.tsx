import Link from 'next/link';
import prisma from '@/lib/prisma';
import EmergencyStop from '@/components/emergency-stop';
import { requireDashboardAdmin } from '@/lib/dashboard/auth';
import { BOOSTA_COMPANY_ID } from '@/lib/company';

export const dynamic = 'force-dynamic';
export default async function TasksPage() {
  await requireDashboardAdmin();
  const tasks = await prisma.task.findMany({ where: { project: { companyId: BOOSTA_COMPANY_ID } }, orderBy: { createdAt: 'desc' }, include: { project: true, _count: { select: { agentRuns: true, approvals: true } } } });
  return <div className="page-stack"><header className="page-header"><div><p className="eyebrow">WORK QUEUE</p><h1>Tasks</h1><p>Plan, approve, execute, and review agent work from one place.</p></div><Link className="button primary" href="/tasks/new">+ New task</Link></header><EmergencyStop/>
    <div className="panel table-panel"><div className="table"><div className="table-row table-head"><span>Task</span><span>Status</span><span>Risk</span><span>Runs</span><span>Cost</span></div>{tasks.map(t=><Link href={`/tasks/${t.id}`} className="table-row" key={t.id}><span><strong>{t.title}</strong><small>{t.project.name}</small></span><span><i className={`badge status-${t.status}`}>{t.status.replaceAll('_',' ')}</i></span><span><i className={`risk risk-${t.riskLevel}`}>{t.riskLevel}</i></span><span>{t._count.agentRuns}</span><span>${t.estimatedCost.toFixed(2)}</span></Link>)}</div>{!tasks.length&&<div className="empty">No tasks yet. Create the first task for an authorised project.</div>}</div>
  </div>;
}
