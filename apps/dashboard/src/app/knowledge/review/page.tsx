import { requireDashboardAdmin } from '@/lib/dashboard/auth';
import prisma from '@/lib/prisma';
import { BOOSTA_COMPANY_ID } from '@/lib/company';
import { Empty, OpsPage, safeDate } from '@/components/ops-shell';
import { ReviewControls } from './review-controls';
export const dynamic = 'force-dynamic';

type EvaluatorVerdict = { claimId: string; approved: boolean; deterministicApproved: boolean; deterministicReason: string | null; modelApproved: boolean | null; modelReason: string | null };
type RunOutcome = { evaluatorVerdicts?: EvaluatorVerdict[] };

function verdictFor(verdictsByEvidenceId: Map<string, EvaluatorVerdict>, evidenceId: string) {
  return verdictsByEvidenceId.get(evidenceId) ?? null;
}

export default async function KnowledgeReviewPage() {
  await requireDashboardAdmin();

  const [entities, relations, unmatchedAliases, runs] = await Promise.all([
    prisma.worldEntity.findMany({ where: { companyId: BOOSTA_COMPANY_ID, validationStatus: 'PROPOSED' }, orderBy: { createdAt: 'desc' }, take: 50, include: { evidence: { include: { document: { select: { title: true, sourceUri: true } } } } } }),
    prisma.worldRelation.findMany({ where: { companyId: BOOSTA_COMPANY_ID, validationStatus: 'PROPOSED' }, orderBy: { createdAt: 'desc' }, take: 50, include: { fromEntity: { select: { name: true } }, toEntity: { select: { name: true } }, evidence: { include: { document: { select: { title: true, sourceUri: true } } } } } }),
    prisma.knowledgeAlias.findMany({ where: { companyId: BOOSTA_COMPANY_ID, resolutionStatus: 'UNMATCHED' }, orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.knowledgeExtractionRun.findMany({ where: { companyId: BOOSTA_COMPANY_ID, status: 'COMPLETED' }, select: { outcome: true } }),
  ]);

  const verdictsByEvidenceId = new Map<string, EvaluatorVerdict>();
  for (const run of runs) {
    const outcome = run.outcome as RunOutcome | null;
    for (const verdict of outcome?.evaluatorVerdicts ?? []) verdictsByEvidenceId.set(verdict.claimId, verdict);
  }

  return <OpsPage eyebrow="KNOWLEDGE GRAPH" title="Review queue" description="Every proposed fact stays PROPOSED until a human approves or rejects it here. The evaluator's verdict is a hint, never a decision — model confidence never promotes a fact on its own.">
    <section className="record-grid">
      <div className="record-card"><strong>{entities.length}</strong><span>Proposed entities</span><small>Awaiting review</small></div>
      <div className="record-card"><strong>{relations.length}</strong><span>Proposed relations</span><small>Awaiting review</small></div>
      <div className="record-card"><strong>{unmatchedAliases.length}</strong><span>Unmatched aliases</span><small>Kept, not dropped</small></div>
      <div className="record-card"><strong>0</strong><span>External actions</span><small>Fail-closed</small></div>
    </section>

    <section className="panel table-panel">
      <div className="panel-head"><div><h2>Proposed entities</h2><p>Approving changes validationStatus only — no runner, no external action.</p></div></div>
      <div className="list">
        {entities.map((entity) => <article className="approval-row" key={entity.id}>
          <div>
            <span className="badge">{entity.entityType}</span>
            <h3>{entity.name}</h3>
            <p className="mono">{entity.canonicalKey}</p>
            {entity.evidence.map((evidence) => { const verdict = verdictFor(verdictsByEvidenceId, evidence.id); return <div key={evidence.id} className="list-row"><div><small>&ldquo;{evidence.excerpt}&rdquo;</small><br /><small className="muted">{evidence.document.title} · {evidence.sourceLocation}</small></div>{verdict ? <span className={`badge ${verdict.approved ? 'success' : 'warning'}`}>{verdict.approved ? 'Evaluator: supports' : 'Evaluator: flagged'}</span> : <span className="badge">Evaluator: pending</span>}</div>; })}
          </div>
          <ReviewControls approveAction="approve_entity" rejectAction="reject_entity" id={entity.id} />
        </article>)}
        {!entities.length ? <Empty>No entities are waiting on review.</Empty> : null}
      </div>
    </section>

    <section className="panel table-panel">
      <div className="panel-head"><div><h2>Proposed relations</h2><p>Both endpoints must already be known entities.</p></div></div>
      <div className="list">
        {relations.map((relation) => <article className="approval-row" key={relation.id}>
          <div>
            <span className="badge">{relation.relationType}</span>
            <h3>{relation.fromEntity.name} → {relation.toEntity.name}</h3>
            {relation.evidence.map((evidence) => { const verdict = verdictFor(verdictsByEvidenceId, evidence.id); return <div key={evidence.id} className="list-row"><div><small>&ldquo;{evidence.excerpt}&rdquo;</small><br /><small className="muted">{evidence.document.title} · {evidence.sourceLocation}</small></div>{verdict ? <span className={`badge ${verdict.approved ? 'success' : 'warning'}`}>{verdict.approved ? 'Evaluator: supports' : 'Evaluator: flagged'}</span> : <span className="badge">Evaluator: pending</span>}</div>; })}
          </div>
          <ReviewControls approveAction="approve_relation" rejectAction="reject_relation" id={relation.id} />
        </article>)}
        {!relations.length ? <Empty>No relations are waiting on review.</Empty> : null}
      </div>
    </section>

    <section className="panel table-panel">
      <div className="panel-head"><div><h2>Unmatched aliases</h2><p>Surface forms the deterministic resolver could not confidently link. Kept, not dropped.</p></div></div>
      <div className="table">
        <div className="table-row table-head"><span>Surface form</span><span>Confidence</span><span>Seen</span><span>Action</span></div>
        {unmatchedAliases.map((alias) => <div className="table-row" key={alias.id}><span>{alias.surfaceForm}</span><span>{alias.confidence.toFixed(2)}</span><span><small>{safeDate(alias.createdAt)}</small></span><span><ReviewControls confirmUnmatchedId={alias.id} /></span></div>)}
        {!unmatchedAliases.length ? <Empty>No unmatched aliases.</Empty> : null}
      </div>
    </section>
  </OpsPage>;
}
