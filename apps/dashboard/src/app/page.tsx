import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { loadLiveTodayDashboard } from '@/lib/dashboard/live';
import CommandBar from '@/components/command-center-topbar';
import LiveRefresh from '@/components/live-refresh';

export const dynamic = 'force-dynamic';

const label = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
const number = (value: number | null) => value === null ? 'Not available' : new Intl.NumberFormat('en-US').format(value);
const money = (value: number | null) => value === null ? 'Not configured' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);
const duration = (seconds: number | null) => seconds === null ? 'Unknown' : seconds < 60 ? `${seconds}s` : seconds < 3600 ? `${Math.floor(seconds / 60)}m` : `${Math.floor(seconds / 3600)}h`;

export default async function ExecutiveHome() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'ADMIN') return <div className="panel large-empty">You do not have access to the executive office.</div>;

  const data = await loadLiveTodayDashboard();
  const counts = data.counts.value;
  const cost = data.cost.value;
  const attention = data.attention.value ?? [];
  const operatingNormally = data.status === 'operational' && data.emergencyStop.value === false;

  return <div className="page-stack executive-home">
    <LiveRefresh/><CommandBar/>
    <header className="executive-welcome"><div><p className="eyebrow">BOOSTA EXECUTIVE OFFICE</p><h1>Good morning</h1><p>Here is what needs your attention and what the company is doing.</p></div><div className={`company-mode ${operatingNormally ? 'mode-ready' : 'mode-attention'}`}><span/>{operatingNormally ? 'Operations ready' : 'Check system status'}</div></header>

    <section className="executive-question panel"><div><span className="question-icon">?</span><div><h2>What needs my attention?</h2><p>{attention.length === 0 ? 'Nothing requires a decision right now.' : `${attention.length} item${attention.length === 1 ? '' : 's'} need your decision or review.`}</p></div></div><Link href="/approvals" className="button primary">Open decisions</Link></section>

    <section className="executive-metrics">
      <ExecutiveMetric label="Decisions waiting" value={number(counts?.pendingApprovals ?? null)} detail={`${number(counts?.redApprovals ?? null)} high priority`} tone="amber"/>
      <ExecutiveMetric label="Company missions" value={number(counts?.activeMissions ?? null)} detail="Approved work in progress" tone="blue"/>
      <ExecutiveMetric label="Work in progress" value={number(counts?.activeTasks ?? null)} detail={`${number(counts?.failedTasks ?? null)} need recovery`} tone="purple"/>
      <ExecutiveMetric label="AI cost today" value={cost?.rateConfigured ? money(cost.spendTodayUsd) : 'Rates not set'} detail={cost?.rateConfigured ? `${number(cost.tokensToday)} priced tokens` : 'Set rates before financial reporting'} tone="green"/>
    </section>

    <section className="grid-two executive-grid">
      <div className="panel"><div className="panel-head"><div><h2>Decisions and exceptions</h2><p>Only items that need a human</p></div><Link href="/approvals">View all</Link></div><div className="attention-list">{attention.slice(0, 6).map((item) => <Link href={item.href} className={`attention-item severity-${item.severity}`} key={item.id}><span className="attention-severity">{item.severity}</span><div><strong>{item.title}</strong><p>{item.reason}</p><small>{duration(item.ageSeconds)} old · {item.ownerAction}</small></div><span>Review →</span></Link>)}{attention.length === 0 ? <FriendlyEmpty title="You are caught up" text="The AI workforce will continue only within its approved limits."/> : null}</div></div>
      <div className="panel next-panel"><div className="panel-head"><div><h2>Suggested next steps</h2><p>A simple starting point for Boosta</p></div></div><ol className="next-steps"><li><span>1</span><div><strong>Review the company profile</strong><p>Confirm the imported facts and registered capabilities.</p><Link href="/businesses">Open company →</Link></div></li><li><span>2</span><div><strong>Approve the constitution</strong><p>Decide the limits the AI workforce must obey.</p><Link href="/businesses">Review controls →</Link></div></li><li><span>3</span><div><strong>Run company discovery</strong><p>Inventory products, rights, contracts, channels and missing information.</p><Link href="/missions">Open missions →</Link></div></li></ol></div>
    </section>

    <section className="panel"><div className="panel-head"><div><h2>Work underway</h2><p>Approved company missions and their next action</p></div><Link href="/missions">All missions</Link></div><div className="mission-cards">{data.missions.value?.slice(0, 4).map((mission) => <Link className="mission-card" href={`/missions/${mission.id}`} key={mission.id}><div className="mission-card-head"><div><span className="mono">{mission.id.slice(0, 8)}</span><h3>{mission.goal}</h3><small>{mission.project || 'Company mission'}</small></div><span className="badge">{label(mission.status)}</span></div><div className="progress"><span style={{ width: `${mission.progress.total ? mission.progress.completed / mission.progress.total * 100 : 0}%` }}/></div><p className="next-action"><b>Next:</b> {mission.nextAction}</p></Link>)}{data.missions.value?.length === 0 ? <FriendlyEmpty title="No active missions" text="Work starts only after a mission and its required approvals exist."/> : null}</div></section>

    <section className="system-summary"><span><b>System:</b> {label(data.status)}</span><span><b>Emergency stop:</b> {data.emergencyStop.value ? 'Active' : data.emergencyStop.value === false ? 'Ready' : 'Unknown'}</span><Link href="/platform/system-health">Technical details →</Link></section>
  </div>;
}

function ExecutiveMetric({ label: metricLabel, value, detail, tone }: { label: string; value: string; detail: string; tone: string }) { return <div className={`metric executive-metric ${tone}`}><span>{metricLabel}</span><strong>{value}</strong><small>{detail}</small></div>; }
function FriendlyEmpty({ title, text }: { title: string; text: string }) { return <div className="friendly-empty"><span>✓</span><div><strong>{title}</strong><p>{text}</p></div></div>; }
