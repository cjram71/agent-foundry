import { requireDashboardAdmin } from '@/lib/dashboard/auth';
import prisma from '@/lib/prisma';
import { BOOSTA_COMPANY_ID } from '@/lib/company';
import { Empty, OpsPage, safeDate } from '@/components/ops-shell';
import { KnowledgeControls } from './knowledge-controls';
export const dynamic = 'force-dynamic';
export default async function KnowledgePage() {
  await requireDashboardAdmin();
  const [documents, runs] = await Promise.all([
    prisma.knowledgeDocument.findMany({ where: { companyId: BOOSTA_COMPANY_ID }, orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.knowledgeExtractionRun.findMany({ where: { companyId: BOOSTA_COMPANY_ID }, orderBy: { createdAt: 'desc' }, take: 20, include: { document: { select: { title: true } } } }),
  ]);
  const pending = documents.filter((document) => document.ingestionStatus === 'PENDING_APPROVAL');
  const approved = documents.filter((document) => document.ingestionStatus === 'APPROVED');
  return <OpsPage eyebrow="KNOWLEDGE GRAPH" title="Documents, under human authority" description="Every document is human-supplied and human-approved before anything is extracted from it. Extraction proposes facts; nothing is trusted until a human promotes it.">
    <section className="record-grid">
      <div className="record-card"><strong>{documents.length}</strong><span>Documents</span><small>Human-registered only</small></div>
      <div className="record-card"><strong>{pending.length}</strong><span>Pending approval</span><small>Founder decision required</small></div>
      <div className="record-card"><strong>{approved.length}</strong><span>Approved</span><small>Eligible for extraction</small></div>
      <div className="record-card"><strong>0</strong><span>External actions</span><small>Fail-closed</small></div>
    </section>
    <KnowledgeControls documents={pending.map((document) => ({ id: document.id, title: document.title }))} approvedDocuments={approved.map((document) => ({ id: document.id, title: document.title }))} />
    <section className="panel table-panel">
      <div className="panel-head"><div><h2>Registered documents</h2><p>Content hash prevents accidental duplicates within a company.</p></div></div>
      <div className="table">
        <div className="table-row table-head"><span>Title</span><span>Namespace</span><span>Status</span><span>Registered</span></div>
        {documents.map((document) => <div className="table-row" key={document.id}><span><strong>{document.title}</strong><small>{document.sourceUri}</small></span><span>{document.namespace}</span><span><i className="badge">{document.ingestionStatus}</i></span><span><small>{safeDate(document.createdAt)}</small></span></div>)}
        {!documents.length ? <Empty>No documents registered yet.</Empty> : null}
      </div>
    </section>
    <section className="panel table-panel">
      <div className="panel-head"><div><h2>Extraction runs</h2><p>Proposed facts still require human review before promotion.</p></div></div>
      <div className="table">
        <div className="table-row table-head"><span>Document</span><span>Status</span><span>Proposed</span><span>Started</span></div>
        {runs.map((run) => <div className="table-row" key={run.id}><span><strong>{run.document.title}</strong><small>{run.errorMessage ?? `${run.model} · ${run.promptVersion}`}</small></span><span><i className="badge">{run.status}</i></span><span>{run.proposedEntityCount} entities · {run.proposedEdgeCount} relations</span><span><small>{safeDate(run.createdAt)}</small></span></div>)}
        {!runs.length ? <Empty>No extraction runs yet.</Empty> : null}
      </div>
    </section>
  </OpsPage>;
}
