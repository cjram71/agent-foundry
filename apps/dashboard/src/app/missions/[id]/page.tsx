import { notFound } from 'next/navigation';
import { requireDashboardAdmin } from '@/lib/dashboard/auth';
import { getMission } from '@/lib/dashboard/operations';
import { DataPanel, Empty, EntityLink, OpsPage, safeDate } from '@/components/ops-shell';
export const dynamic = 'force-dynamic';

export default async function MissionDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireDashboardAdmin(); const { id } = await params; const m = await getMission(id); if (!m) notFound();
  const spend = m.tasks.reduce((sum, x) => sum + x.task.estimatedCost, 0); const tokens = m.tasks.reduce((sum, x) => sum + x.task.tokenUsage, 0);
  const active = m.tasks.find(x => !['completed','failed','cancelled'].includes(x.task.status));
  const next = m.approvals.some(a => a.decision === 'pending') ? 'Waiting for owner approval.' : active ? `${active.task.assignedAgent ?? 'An agent'}: ${active.task.title} (${active.task.state}).` : m.status === 'completed' ? 'Mission complete.' : 'No executable next task is recorded.';
  return <OpsPage eyebrow={`MISSION ${m.id}`} title={m.goal} description={next}>
    <details className="mission-collapsible" ><summary>Contract <span>Governance rules</span></summary><DataPanel title="Contract"><div className="detail-grid"><p><b>Context</b><br/>{m.contextSummary ?? 'Not recorded'}</p><p><b>Risk</b><br/>{m.riskLevel}</p><p><b>Workspace</b><br/>{m.project?.name ?? 'Not configured'}</p><p><b>Business</b><br/>{m.businessId ?? 'Not configured'}</p><p><b>Deadline</b><br/>{safeDate(m.deadline)}</p><p><b>Provenance</b><br/>{m.provenance}</p><p><b>Constraints</b><br/>{m.constraints.join(' · ') || 'None recorded'}</p><p><b>Definition of done</b><br/>{m.definitionOfDone.join(' · ') || 'None recorded'}</p><p><b>Allowed tools</b><br/>{m.allowedToolClasses.join(' · ') || 'None recorded'}</p><p><b>Approval rules</b><br/>{m.approvalRules.join(' · ') || 'None recorded'}</p></div></DataPanel></details>
    <details className="mission-collapsible"><summary>Economics <span>Budget and usage</span></summary><DataPanel title="Economics"><p>${spend.toFixed(2)} / ${m.budgetUsd.toFixed(2)} · {tokens.toLocaleString()} / {m.tokenBudget.toLocaleString()} tokens · parallelism {m.maxParallelTasks}</p></DataPanel></details>
    <details className="mission-collapsible"><summary>Execution <span>Tasks and agents</span></summary><DataPanel title="Execution"><div className="list">{m.tasks.map(x => <EntityLink key={x.taskId} href={`/tasks/${x.taskId}`} title={`${x.sequence}. ${x.task.title}`} detail={`${x.task.state} · ${x.task.assignedAgent ?? 'Unassigned'} · ${x.task.attempts.length} attempts · ${x.task.agentRuns.length} model runs`} />)}{m.tasks.length === 0 ? <Empty>No tasks are linked to this mission.</Empty> : null}</div></DataPanel></details>
    <details className="mission-collapsible"><summary>Mission activity <span>Audit timeline</span></summary><DataPanel title="Mission activity"><div className="list">{m.events.map(e => <div className="approval-row" key={e.id}><div><h3>{e.type}</h3><p>{e.actor} · {safeDate(e.createdAt)} · correlation {e.correlationId ?? 'not recorded'}</p></div></div>)}{m.events.length === 0 ? <Empty>No mission events recorded.</Empty> : null}</div></DataPanel></details>
  </OpsPage>;
}
