import { requireDashboardAdmin } from '@/lib/dashboard/auth';
import { listMissions } from '@/lib/dashboard/operations';
import { Empty, EntityLink, OpsPage } from '@/components/ops-shell';
export const dynamic = 'force-dynamic';

export default async function MissionsPage() {
  await requireDashboardAdmin();
  const missions = await listMissions();
  return <OpsPage eyebrow="OPERATIONS" title="Missions" description="Mission intent, execution state, ownership, economics, and next actions."><section className="panel"><div className="list">{missions.map(m => {
    const complete = m.tasks.filter(x => x.task.status === 'completed').length;
    const spend = m.tasks.reduce((sum, x) => sum + x.task.estimatedCost, 0);
    const tokens = m.tasks.reduce((sum, x) => sum + x.task.tokenUsage, 0);
    return <EntityLink key={m.id} href={`/missions/${m.id}`} title={m.goal} detail={`${m.project?.name ?? 'No project'} · ${m.status} · ${complete}/${m.tasks.length} tasks · $${spend.toFixed(2)} / $${m.budgetUsd.toFixed(2)} · ${tokens.toLocaleString()} tokens`} />;
  })}{missions.length === 0 ? <Empty>No missions have been recorded.</Empty> : null}</div></section></OpsPage>;
}
