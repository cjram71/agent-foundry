import { requireDashboardAdmin } from '@/lib/dashboard/auth';
import prisma from '@/lib/prisma';
import { BOOSTA_COMPANY_ID } from '@/lib/company';
import { Empty, OpsPage, safeDate } from '@/components/ops-shell';
import { KnowledgeControls } from './knowledge-controls';
export const dynamic = 'force-dynamic';
export default async function KnowledgePage() {
  await requireDashboardAdmin();
  const documents = await prisma.knowledgeDocument.findMany({ where: { companyId: BOOSTA_COMPANY_ID }, orderBy: { createdAt: 'desc' }, take: 50 });
  const pending = documents.filter((document) => document.ingestionStatus === 'PENDING_APPROVAL');
  return <OpsPage eyebrow="KNOWLEDGE GRAPH" title="Documents, under human authority" description="Every document is human-supplied and human-approved before anything is extracted from it. Extraction proposes facts; nothing is trusted until a human promotes it.">
    <section className="record-grid">
      <div className="record-card"><strong>{documents.length}</strong><span>Documents</span><small>Human-registered only</small></div>
      <div className="record-card"><strong>{pending.length}</strong><span>Pending approval</span><small>Founder decision required</small></div>
      <div className="record-card"><strong>{documents.filter((document) => document.ingestionStatus === 'APPROVED').length}</strong><span>Approved</span><small>Eligible for extraction</small></div>
      <div className="record-card"><strong>0</strong><span>External actions</span><small>Fail-closed</small></div>
    </section>
    <KnowledgeControls documents={pending.map((document) => ({ id: document.id, title: document.title }))} />
    <section className="panel table-panel">
      <div className="panel-head"><div><h2>Registered documents</h2><p>Content hash prevents accidental duplicates within a company.</p></div></div>
      <div className="table">
        <div className="table-row table-head"><span>Title</span><span>Namespace</span><span>Status</span><span>Registered</span></div>
        {documents.map((document) => <div className="table-row" key={document.id}><span><strong>{document.title}</strong><small>{document.sourceUri}</small></span><span>{document.namespace}</span><span><i className="badge">{document.ingestionStatus}</i></span><span><small>{safeDate(document.createdAt)}</small></span></div>)}
        {!documents.length ? <Empty>No documents registered yet.</Empty> : null}
      </div>
    </section>
  </OpsPage>;
}
