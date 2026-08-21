import { requireDashboardAdmin } from "@/lib/dashboard/auth";
import prisma from "@/lib/prisma";

const money = (minor: bigint | null | undefined) => minor == null ? "--" : `${(Number(minor) / 100).toLocaleString("sv-SE")} SEK`;
export default async function BoostaWorkspacePage() {
  await requireDashboardAdmin();
  const w = await prisma.boostaWorkspace.findUnique({where:{id:"BSTA-WORKSPACE-001"},include:{
    brainVersions:{orderBy:{version:"desc"},take:1}, books:{include:{author:true,submissions:true}}, roles:true,
    approvals:{orderBy:{requestedAt:"desc"},take:30}, subscribers:true, experiments:{orderBy:{createdAt:"desc"}},
    offers:{orderBy:{createdAt:"desc"}}, weeklyReviews:{orderBy:{weekStart:"desc"},take:8}, revenueAttributions:true
  }});
  if (!w) return <main className="page"><h1>Boosta workspace not seeded</h1></main>;
  const pending=w.approvals.filter(a=>a.decision==="PENDING"), net=w.revenueAttributions.reduce((n,e)=>n+Number(e.netMinor),0), confirmed=w.revenueAttributions.filter(e=>e.paymentStatus==="CONFIRMED").reduce((n,e)=>n+Number(e.netMinor),0);
  return <main className="page">
    <div className="page-header"><div><p className="eyebrow">BOOSTA FORLAG / REVENUE OPERATING SYSTEM</p><h1>{w.name}</h1><p>{w.brainSummary}</p></div><span className="badge success">Human-controlled</span></div>
    <section className="metric-grid">
      <article className="metric-card"><span>Books</span><strong>{w.books.length}</strong><small>Metadata tracked</small></article>
      <article className="metric-card"><span>Pending approvals</span><strong>{pending.length}</strong><small>Founder decision required</small></article>
      <article className="metric-card"><span>Consent subscribers</span><strong>{w.subscribers.filter(s=>s.consentStatus==="GRANTED"&&!s.unsubscribedAt).length}</strong><small>Permission-based only</small></article>
      <article className="metric-card"><span>Net revenue</span><strong>{(net/100).toLocaleString("sv-SE")} SEK</strong><small>Confirmed: {(confirmed/100).toLocaleString("sv-SE")} SEK</small></article>
    </section>
    <div className="dashboard-grid">
      <section className="panel"><div className="panel-heading"><h2>Company Brain</h2><span>v{w.brainVersions[0]?.version??0}</span></div><p>{String((w.brainVersions[0]?.content as {objective?:string}|undefined)?.objective??"Draft brain version")}</p><p className="muted">Source: {w.brainVersions[0]?.source??"needs verification"}</p></section>
      <section className="panel"><div className="panel-heading"><h2>Books and distribution</h2><span>{w.books.reduce((n,b)=>n+b.submissions.length,0)} submissions</span></div>{w.books.map(b=><div className="list-row" key={b.id}><div><strong>{b.title}</strong><small>{b.author?.name} - {money(b.priceMinor)}</small></div><span className="badge">{b.metadataStatus}</span></div>)}</section>
    </div>
    <div className="dashboard-grid">
      <section className="panel"><div className="panel-heading"><h2>Approvals and workflow</h2><span>{pending.length} pending</span></div>{pending.slice(0,8).map(a=><div className="list-row" key={a.id}><div><strong>{a.approvalType}</strong><small>Task {a.taskId??"artifact-linked"} - {a.requestedBy}</small></div><span className="badge warning">PENDING</span></div>)}</section>
      <section className="panel"><div className="panel-heading"><h2>Agent roles</h2><span>{w.roles.length} templates</span></div>{w.roles.map(r=><div className="list-row" key={r.id}><div><strong>{r.name}</strong><small>{r.role}</small></div><span className="badge">Approval gate</span></div>)}</section>
    </div>
    <div className="dashboard-grid">
      <section className="panel"><div className="panel-heading"><h2>Offers and experiments</h2><span>Draft only</span></div>{w.offers.map(o=><div className="list-row" key={o.id}><div><strong>{o.name}</strong><small>{o.offerType} - {money(o.priceMinor)}</small></div><span className="badge">{o.status}</span></div>)}{w.experiments.map(e=><div className="list-row" key={e.id}><div><strong>{e.name}</strong><small>{e.channel} - {e.audience}</small></div><span className="badge warning">{e.status}</span></div>)}</section>
      <section className="panel"><div className="panel-heading"><h2>Weekly money review</h2><span>Evidence first</span></div>{w.weeklyReviews.map(r=><div className="list-row" key={r.id}><div><strong>{r.weekStart.toISOString().slice(0,10)}</strong><small>{r.sales} sales - {money(r.revenueMinor)} - {r.emailSignups} signups</small></div><span className="badge">{r.status}</span></div>)}</section>
    </div>
    <section className="panel"><h2>Safety boundary</h2><p>Agents may research, draft, analyze and prepare. Publishing, spending, commercial email, discounts, outreach, refunds, secrets and production deployment remain founder-approved actions.</p></section>
  </main>;
}