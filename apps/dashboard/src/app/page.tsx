import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { loadLiveTodayDashboard } from '@/lib/dashboard/live';
import CommandBar from '@/components/command-center-topbar';
import LiveRefresh from '@/components/live-refresh';
import ConstitutionApproval from '@/components/constitution-approval';
import { loadBoostaCompany } from '@/lib/company';

export const dynamic = 'force-dynamic';

const label = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
const number = (value: number | null) => value === null ? 'Not available' : new Intl.NumberFormat('en-US').format(value);
const money = (value: number | null) => value === null ? 'Not configured' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);
const duration = (seconds: number | null) => seconds === null ? 'Unknown' : seconds < 60 ? `${seconds}s` : seconds < 3600 ? `${Math.floor(seconds / 60)}m` : `${Math.floor(seconds / 3600)}h`;

export default async function ExecutiveHome() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'ADMIN') return <div className="panel large-empty">You do not have access to the executive office.</div>;

  const [data, company] = await Promise.all([loadLiveTodayDashboard(), loadBoostaCompany()]);
  const counts = data.counts.value;
  const cost = data.cost.value;
  const attention = data.attention.value ?? [];
  const operatingNormally = data.status === 'operational' && data.emergencyStop.value === false;
  const constitution = company?.constitutions[0];
  const setupStage = !company ? 'COMPANY_RECORD' : constitution?.status !== 'ACTIVE' ? 'CONSTITUTION' : company._count.missions === 0 ? 'DISCOVERY' : 'OPERATING';

  return <div className="page-stack executive-home">
    <LiveRefresh/><CommandBar/>
    <header className="executive-welcome"><div><p className="eyebrow">BOOSTA EXECUTIVE OFFICE</p><h1>Good morning</h1><p>Here is what needs your attention and what the company is doing.</p></div><div className={`company-mode ${operatingNormally ? 'mode-ready' : 'mode-attention'}`}><span/>{operatingNormally ? 'Operations ready' : 'Check system status'}</div></header>

    <section className="company-journey panel">
      <div className="journey-head"><div><p className="eyebrow">YOUR NEXT STEP</p><h2>{setupStage === 'COMPANY_RECORD' ? 'Complete the company record' : setupStage === 'CONSTITUTION' ? 'Approve how AI may operate' : setupStage === 'DISCOVERY' ? 'Prepare company discovery' : 'Operate and improve Boosta'}</h2><p>{setupStage === 'COMPANY_RECORD' ? 'Boosta needs a verified company record before work can be governed.' : setupStage === 'CONSTITUTION' ? 'Review the company rules. Nothing autonomous starts when you approve them; approval only establishes the boundaries.' : setupStage === 'DISCOVERY' ? 'The rules are active. The next build will connect the read-only discovery mission to Foundry tasks so it can inventory products, rights, contracts, customers and channels without external actions.' : 'Review decisions, monitor approved work and measure business results.'}</p></div><span className="stage-label">{setupStage === 'OPERATING' ? 'Operating' : `Setup ${setupStage === 'COMPANY_RECORD' ? '1' : setupStage === 'CONSTITUTION' ? '2' : '3'} of 3`}</span></div>
      <div className="journey-progress"><span className={company ? 'complete' : 'current'}>1 <b>Company verified</b></span><i/><span className={constitution?.status === 'ACTIVE' ? 'complete' : setupStage === 'CONSTITUTION' ? 'current' : ''}>2 <b>Rules approved</b></span><i/><span className={company?._count.missions ? 'complete' : setupStage === 'DISCOVERY' ? 'current' : ''}>3 <b>Discovery prepared</b></span></div>
      <div className="journey-action">{setupStage === 'COMPANY_RECORD' ? <Link className="button primary" href="/businesses">Open company settings</Link> : setupStage === 'CONSTITUTION' ? <><ConstitutionApproval/><Link className="button secondary" href="/businesses">Read all rules</Link></> : setupStage === 'DISCOVERY' ? <><span className="honest-status">Discovery execution is not connected yet. No AI work is running.</span><Link className="button secondary" href="/businesses">Review company information</Link></> : <Link className="button primary" href="/approvals">Review company decisions</Link>}</div>
    </section>

    <section className="executive-question panel"><div><span className="question-icon">?</span><div><h2>What needs my attention?</h2><p>{attention.length === 0 ? 'Nothing requires a decision right now.' : `${attention.length} item${attention.length === 1 ? '' : 's'} need your decision or review.`}</p></div></div><Link href="/approvals" className="button primary">Open decisions</Link></section>

    <section className="executive-metrics">
      <ExecutiveMetric label="Decisions waiting" value={number(counts?.pendingApprovals ?? null)} detail={`${number(counts?.redApprovals ?? null)} high priority`} tone="amber"/>
      <ExecutiveMetric label="Company missions" value={number(counts?.activeMissions ?? null)} detail="Approved work in progress" tone="blue"/>
      <ExecutiveMetric label="Work in progress" value={number(counts?.activeTasks ?? null)} detail={`${number(counts?.failedTasks ?? null)} need recovery`} tone="purple"/>
      <ExecutiveMetric label="AI cost today" value={cost?.rateConfigured ? money(cost.spendTodayUsd) : 'Rates not set'} detail={cost?.rateConfigured ? `${number(cost.tokensToday)} priced tokens` : 'Set rates before financial reporting'} tone="green"/>
    </section>

    <section className="grid-two executive-grid">
      <div className="panel"><div className="panel-head"><div><h2>Decisions and exceptions</h2><p>Only items that need a human</p></div><Link href="/approvals">View all</Link></div><div className="attention-list">{attention.slice(0, 6).map((item) => <Link href={item.href} className={`attention-item severity-${item.severity}`} key={item.id}><span className="attention-severity">{item.severity}</span><div><strong>{item.title}</strong><p>{item.reason}</p><small>{duration(item.ageSeconds)} old · {item.ownerAction}</small></div><span>Review →</span></Link>)}{attention.length === 0 ? <FriendlyEmpty title="You are caught up" text="The AI workforce will continue only within its approved limits."/> : null}</div></div>
      <div className="panel next-panel"><div className="panel-head"><div><h2>How Boosta OS works</h2><p>No technical knowledge required</p></div></div><ol className="next-steps"><li><span>1</span><div><strong>You make important decisions</strong><p>Contracts, spending, publishing, rights and strategy stay with you.</p></div></li><li><span>2</span><div><strong>The AI prepares the work</strong><p>It researches, analyzes and recommends within approved limits.</p></div></li><li><span>3</span><div><strong>Boosta OS verifies and remembers</strong><p>Results, evidence, costs and lessons remain visible to you.</p></div></li></ol></div>
    </section>

    <section className="panel"><div className="panel-head"><div><h2>Work underway</h2><p>Approved company missions and their next action</p></div><Link href="/missions">All missions</Link></div><div className="mission-cards">{data.missions.value?.slice(0, 4).map((mission) => <Link className="mission-card" href={`/missions/${mission.id}`} key={mission.id}><div className="mission-card-head"><div><span className="mono">{mission.id.slice(0, 8)}</span><h3>{mission.goal}</h3><small>{mission.project || 'Company mission'}</small></div><span className="badge">{label(mission.status)}</span></div><div className="progress"><span style={{ width: `${mission.progress.total ? mission.progress.completed / mission.progress.total * 100 : 0}%` }}/></div><p className="next-action"><b>Next:</b> {mission.nextAction}</p></Link>)}{data.missions.value?.length === 0 ? <FriendlyEmpty title="No active missions" text="Work starts only after a mission and its required approvals exist."/> : null}</div></section>

    <section className="system-summary"><span><b>System:</b> {label(data.status)}</span><span><b>Emergency stop:</b> {data.emergencyStop.value ? 'Active' : data.emergencyStop.value === false ? 'Ready' : 'Unknown'}</span><Link href="/platform/system-health">Technical details →</Link></section>
  </div>;
}

function ExecutiveMetric({ label: metricLabel, value, detail, tone }: { label: string; value: string; detail: string; tone: string }) { return <div className={`metric executive-metric ${tone}`}><span>{metricLabel}</span><strong>{value}</strong><small>{detail}</small></div>; }
function FriendlyEmpty({ title, text }: { title: string; text: string }) { return <div className="friendly-empty"><span>✓</span><div><strong>{title}</strong><p>{text}</p></div></div>; }
