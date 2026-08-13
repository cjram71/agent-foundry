import Link from 'next/link';
import { requireDashboardAdmin } from '@/lib/dashboard/auth';
import { addressLine, loadBoostaCompany } from '@/lib/company';
import { Empty, OpsPage } from '@/components/ops-shell';

export const dynamic = 'force-dynamic';

const money = (minor: bigint | null) => minor === null
  ? 'Not verified'
  : new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(Number(minor) / 100);

const words = (value: string) => value.replaceAll('_', ' ').toLowerCase().replace(/^\w/, (letter) => letter.toUpperCase());

export default async function CompanyPage() {
  await requireDashboardAdmin();
  const company = await loadBoostaCompany();

  if (!company) return <OpsPage eyebrow="COMPANY" title="Company profile" description="The verified business context used by the AI workforce."><section className="panel"><Empty>Apply the Boosta company migration to load the company profile.</Empty></section></OpsPage>;

  const constitution = company.constitutions[0];
  const grouped = company.activities.reduce<Record<string, typeof company.activities>>((result, activity) => {
    (result[activity.category] ??= []).push(activity);
    return result;
  }, {});

  return <OpsPage eyebrow="BOOSTA FÖRLAG AB" title="Your company" description="Verified facts, business capabilities and the rules that keep AI work under human control.">
    <section className="company-hero panel">
      <div><span className="company-status">{company.status}</span><h2>{company.legalName}</h2><p>{company.description}</p></div>
      <div className="company-actions"><Link className="button primary" href="/missions">Start company discovery</Link><Link className="button secondary" href="/approvals">Review decisions</Link></div>
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
      <div className="panel"><div className="panel-head"><div><h2>Human control</h2><p>Draft constitution · version {constitution?.version ?? 'not created'}</p></div><span className={`badge ${constitution?.status === 'ACTIVE' ? 'status-approved' : 'status-awaiting_plan_approval'}`}>{constitution?.status ?? 'MISSING'}</span></div>{constitution ? <><p className="constitution-mission">{constitution.mission}</p><h3 className="list-title">Always requires a human</h3><ul className="plain-list">{constitution.humanOnlyDecisions.map((decision) => <li key={decision}>{decision}</li>)}</ul><p className="draft-warning">The constitution is a draft. AI cannot activate or modify it.</p></> : <Empty>No constitution has been created.</Empty>}</div>
    </section>

    <section className="panel"><div className="panel-head"><div><h2>Company record</h2><p>What the operating system can currently prove</p></div></div><div className="record-grid"><Record label="Company facts" value={company._count.facts} detail="Structured facts with provenance"/><Record label="Sources" value={company.sources.length} detail="Recent evidence sources loaded"/><Record label="Projects" value={company._count.projects} detail="Company-scoped projects"/><Record label="Missions" value={company._count.missions} detail="Company-scoped missions"/></div><p className="source-note">Baseline status: {words(company.sourceStatus)}. Missing products, rights, contracts, customers and current financial records remain explicitly unknown until verified.</p></section>
  </OpsPage>;
}

function Fact({ label, value }: { label: string; value: string }) { return <div className="company-fact"><span>{label}</span><strong>{value}</strong></div>; }
function Record({ label, value, detail }: { label: string; value: number; detail: string }) { return <div className="record-card"><strong>{value}</strong><span>{label}</span><small>{detail}</small></div>; }
