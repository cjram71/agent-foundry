import { requireDashboardAdmin } from '@/lib/dashboard/auth';
import prisma from '@/lib/prisma';
import { loadExecutiveLayer } from '@/lib/executive-layer';
import { DataPanel, Empty, OpsPage } from '@/components/ops-shell';

export const dynamic = 'force-dynamic';

export default async function CeoPage() {
  await requireDashboardAdmin();
  const { agents, errors } = await loadExecutiveLayer(prisma);
  const ceo = agents.find((row) => row.id === 'BSTA-EXEC-001');
  const coo = agents.find((row) => row.id === 'BSTA-EXEC-002');
  return <OpsPage eyebrow="EXECUTIVE LAYER" title="AI CEO & Chief of Staff" description="Executive intelligence is separated from legal authority and transactional execution.">
    {errors.length ? <section className="panel"><div className="honest-status">Executive registry validation failed: {errors.join(' · ')}</div></section> : null}
    <section className="executive-metrics">
      <div className="metric blue"><span>Executive identities</span><strong>{agents.length}</strong><small>Both remain staged</small></div>
      <div className="metric green"><span>Financial authority</span><strong>SEK 0</strong><small>Human approval required</small></div>
      <div className="metric purple"><span>External actions</span><strong>Blocked</strong><small>Tool Gateway required</small></div>
      <div className="metric amber"><span>Legal authority</span><strong>Human</strong><small>Never delegated to AI</small></div>
    </section>
    <div className="grid-two">
      <ExecutiveCard agent={ceo}/><ExecutiveCard agent={coo}/>
    </div>
    <DataPanel title="Authority boundary"><ul className="plain-list"><li>The AI CEO recommends, prioritizes, challenges assumptions and requests decisions.</li><li>The COO coordinates approved work, dependencies, schedules and reports.</li><li>Neither executive may spend, contract, publish, communicate externally or deploy.</li><li>The human owner may pause, reject, override or revoke at any time.</li></ul></DataPanel>
  </OpsPage>;
}

function ExecutiveCard({ agent }: { agent: Awaited<ReturnType<typeof loadExecutiveLayer>>['agents'][number] | undefined }) {
  if (!agent) return <section className="panel"><Empty>Executive identity is missing.</Empty></section>;
  return <section className="panel"><div className="panel-head"><div><p className="eyebrow">{agent.id}</p><h2>{agent.name}</h2><p>{agent.role} · {agent.status}</p></div><span className="badge">{agent.riskLevel}</span></div><p className="instruction">{agent.purpose}</p><div className="detail-grid"><p><b>Manager</b><br/>{agent.manager?.name ?? 'Human owner'}</p><p><b>Department</b><br/>{agent.department.name}</p><p><b>Model</b><br/>{agent.model}</p><p><b>Direct reports</b><br/>{agent._count.subordinates}</p></div><h3 className="list-title">Responsibilities</h3><ul className="plain-list">{agent.responsibilities.map((item) => <li key={item}>{item}</li>)}</ul></section>;
}
