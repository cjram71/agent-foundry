import Link from 'next/link';
import { requireDashboardAdmin } from '@/lib/dashboard/auth';
import { addressLine, loadBoostaCompany } from '@/lib/company';
import { Empty, OpsPage } from '@/components/ops-shell';
import ConstitutionApproval from '@/components/constitution-approval';

export const dynamic = 'force-dynamic';

const money = (minor: bigint | null) => minor === null
  ? 'Not verified'
  : new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(Number(minor) / 100);

const words = (value: string) => value.replaceAll('_', ' ').toLowerCase().replace(/^\w/, (letter) => letter.toUpperCase());

export default async function CompanyPage() {
  await requireDashboardAdmin();
  const company = await loadBoostaCompany();


  const constitution = company.constitutions[0];
  const grouped = company.activities.reduce<Record<string, typeof company.activities>>((result, activity) => {
    (result[activity.category] ??= []).push(activity);
    return result;
  }, {});

  return <OpsPage eyebrow="BOOSTA FÖRLAG AB" title="Boosta company identity" description="The company identity is configured automatically and locked. Verified facts and operating rules remain visible to the authorized owner.">
    <section className="company-hero panel">
      <div><span className="company-status">{company.status} · IDENTITY LOCKED</span><h2>{company.legalName}</h2><p>{company.description}</p><small>Boosta OS is permanently scoped to organization {company.organizationNumber}. This identity cannot be replaced, renamed, or deleted from the dashboard or API.</small></div>
      <div className="company-actions">{constitution?.status === 'ACTIVE' ? <span className="badge status-approved">Company configured</span> : <ConstitutionApproval/>}<Link className="button secondary" href="/">Back to headquarters</Link></div>
    </section>

    <section className="company-facts">
      <Fact label="Organization number" value={company.organizationNumber}/>
      <Fact label="Managing Director" value={company.managingDirector ?? 'Not verified'}/>
      <Fact label="Registered address" value={addressLine(company.registeredAddress)}/>
      <Fact label="Share capital" value={money(company.shareCapitalMinor)}/>
      <Fact label="Industry" value="58110 · Publishing of books"/>
      <Fact label="Operating model" value={words(company.operatingModel)}/>
    </section>

    <section className="grid-two company-grid">
      <div className="panel"><div className="panel-head"><div><h2>What Boosta can do</h2><p>Registered capabilities, grouped in business language</p></div></div><div className="capability-groups">{Object.entries(grouped).map(([category, activities]) => <div className="capability-group" key={category}><h3>{words(category)}</h3>{activities.map((activity) => <div key={activity.id}><strong>{activity.name}</strong>{activity.description ? <small>{activity.description}</small> : null}</div>)}</div>)}</div></div>
      <div className="panel"><div className="panel-head"><div><h2>Human control</h2><p>Company constitution · version {constitution?.version ?? 'not created'}</p></div><span className={`badge ${constitution?.status === 'ACTIVE' ? 'status-approved' : 'status-awaiting_plan_approval'}`}>{constitution?.status ?? 'MISSING'}</span></div>{constitution ? <><p className="constitution-mission">{constitution.mission}</p><h3 className="list-title">Always requires a human</h3><ul className="plain-list">{constitution.humanOnlyDecisions.map((decision) => <li key={decision}>{decision}</li>)}</ul>{constitution.status === 'ACTIVE' ? <p className="active-notice">Active company rules. AI cannot modify them.</p> : <><p className="draft-warning">These rules are a draft and no company discovery will begin until you approve them.</p><ConstitutionApproval/></>}</> : <Empty>No constitution has been created.</Empty>}</div>
    </section>

    <section className="panel"><div className="panel-head"><div><h2>Locked company record</h2><p>Automatically maintained by Boosta OS from the canonical company baseline</p></div></div><div className="record-grid"><Record label="Company facts" value={company._count.facts} detail="Structured facts with provenance"/><Record label="Sources" value={company.sources.length} detail="Recent evidence sources loaded"/><Record label="Workspaces" value={company._count.projects} detail="Boosta-scoped technical workspaces"/><Record label="Missions" value={company._count.missions} detail="Company-scoped missions"/></div><p className="source-note">Baseline status: {words(company.sourceStatus)}. Missing products, rights, contracts, customers and current financial records remain explicitly unknown until verified.</p></section>
  </OpsPage>;
}

function Fact({ label, value }: { label: string; value: string }) { return <div className="company-fact"><span>{label}</span><strong>{value}</strong></div>; }
function Record({ label, value, detail }: { label: string; value: number; detail: string }) { return <div className="record-card"><strong>{value}</strong><span>{label}</span><small>{detail}</small></div>; }
