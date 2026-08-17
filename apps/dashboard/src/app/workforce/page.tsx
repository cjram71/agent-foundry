import { requireDashboardAdmin } from '@/lib/dashboard/auth';
import prisma from '@/lib/prisma';
import { loadExecutiveLayer } from '@/lib/executive-layer';
import { OpsPage } from '@/components/ops-shell';

export const dynamic = 'force-dynamic';

export default async function WorkforcePage() {
  await requireDashboardAdmin();
  const { departments, agents } = await loadExecutiveLayer(prisma);
  const staffed = new Set(agents.map((row) => row.departmentId));
  return <OpsPage eyebrow="AI WORKFORCE" title="Departments & authority" description="The durable Phase 2 registry. Unstaffed departments have no implied agents or permissions.">
    <section className="record-grid"><div className="record-card"><strong>{departments.length}</strong><span>Registered departments</span><small>Organizational structure only</small></div><div className="record-card"><strong>{agents.length}</strong><span>Executive identities</span><small>Staged, not autonomous</small></div><div className="record-card"><strong>{staffed.size}</strong><span>Staffed departments</span><small>Executive office only</small></div><div className="record-card"><strong>0</strong><span>Enabled external actions</span><small>Fail-closed baseline</small></div></section>
    <section className="panel table-panel"><div className="table"><div className="table-row table-head"><span>Department</span><span>Executive role</span><span>Authority</span><span>Staffed</span><span>Status</span></div>{departments.map((row) => <div className="table-row" key={row.id}><span><strong>{row.name}</strong><small>{row.code} · {row.purpose}</small></span><span>{row.executiveRole}</span><span>{row.authorityLevel}</span><span>{staffed.has(row.id) ? 'Yes' : 'No'}</span><span><i className="badge">{row.status}</i></span></div>)}</div></section>
  </OpsPage>;
}
