import { requireDashboardAdmin } from '@/lib/dashboard/auth';
import prisma from '@/lib/prisma';
import { BOOSTA_COMPANY_ID } from '@/lib/company';
import { Empty, OpsPage, safeDate } from '@/components/ops-shell';
import { OpportunityDecisionControls } from './opportunity-decision-controls';

export const dynamic = 'force-dynamic';

export default async function Opportunities() {
  await requireDashboardAdmin();
  const rows = await prisma.opportunity.findMany({
    where: { companyId: BOOSTA_COMPANY_ID },
    orderBy: { createdAt: 'desc' },
    include: { redTeam: true, decisions: { orderBy: { decidedAt: 'desc' }, take: 1 } },
  });

  return <OpsPage eyebrow="OPPORTUNITY ENGINE" title="Opportunity Vault" description="Evidence-backed candidates must be scored, independently challenged, and decided by the human owner before Phase 4 planning.">
    <section className="panel">
      <div className="list">
        {rows.map((row) => <article className="approval-row" key={row.id} style={{ display: 'block' }}>
          <div>
            <span className="badge">{row.status}</span>
            <h3>{row.title}</h3>
            <p>{row.customer} · score {row.totalScore}/100 · confidence {row.confidence}/100 · {row.redTeam ? 'Red Team complete' : 'Red Team required'} · {row.decisions[0]?.decision ?? 'No human decision'} · {safeDate(row.createdAt)}</p>
          </div>
          {row.status === 'READY_FOR_DECISION' && row.redTeam ? <OpportunityDecisionControls id={row.id} /> : <p>{row.redTeam ? 'Decision recorded or further research underway.' : 'An independent Red Team record is required before the owner gate opens.'}</p>}
        </article>)}
        {!rows.length ? <Empty>No durable opportunity candidates yet. Discovery reports remain research until a candidate is explicitly recorded.</Empty> : null}
      </div>
    </section>
  </OpsPage>;
}
