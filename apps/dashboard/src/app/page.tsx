import Link from 'next/link';
import prisma from '@/lib/prisma';

const active = ['planning','coding','testing','reviewing','queued'] as const;
export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const [projects, tasks, pending, runs, recent] = await Promise.all([
    prisma.project.count({ where: { authorisedStatus: true } }),
    prisma.task.count(),
    prisma.task.count({ where: { status: { in: ['awaiting_plan_approval','awaiting_human_review'] } } }),
    prisma.agentRun.count({ where: { status: { in: ['queued','running'] } } }),
    prisma.task.findMany({ take: 6, orderBy: { createdAt: 'desc' }, include: { project: true } }),
  ]);
  const working = await prisma.task.count({ where: { status: { in: [...active] } } });
  return <div className="page-stack">
    <header className="page-header"><div><p className="eyebrow">CONTROL PLANE</p><h1>Good morning, Administrator</h1><p>Monitor projects, approve plans, and keep every agent run accountable.</p></div><Link className="button primary" href="/tasks/new">+ New task</Link></header>
    <section className="metric-grid">
      <Metric label="Authorised projects" value={projects} tone="blue" href="/projects" />
      <Metric label="All tasks" value={tasks} tone="purple" href="/tasks" />
      <Metric label="Active work" value={working} tone="green" href="/tasks?status=active" />
      <Metric label="Awaiting approval" value={pending} tone="amber" href="/approvals" />
    </section>
    <section className="grid-two">
      <div className="panel"><div className="panel-head"><div><h2>Recent tasks</h2><p>Latest work across authorised repositories</p></div><Link href="/tasks">View all</Link></div>
        <div className="list">{recent.map(task => <Link className="list-row" href={`/tasks/${task.id}`} key={task.id}><div><strong>{task.title}</strong><small>{task.project.name}</small></div><Status value={task.status}/></Link>)}{!recent.length && <Empty text="No tasks yet."/>}</div>
      </div>
      <div className="panel"><div className="panel-head"><div><h2>System status</h2><p>Core control-plane services</p></div><span className="healthy">Healthy</span></div>
        <div className="health-list"><Health name="Dashboard" detail="Next.js · port 3000"/><Health name="Orchestrator" detail="Read-only planning worker"/><Health name="Runner" detail="Guarded coding, validation, review, and draft PRs"/><Health name="Database" detail="PostgreSQL · private localhost"/><Health name="Queue" detail="Redis · private localhost"/><Health name="Agent activity" detail={`${runs} active run${runs === 1 ? '' : 's'}`}/></div>
      </div>
    </section>
  </div>;
}

function Metric({label,value,tone,href}:{label:string;value:number;tone:string;href:string}) { return <Link href={href} className={`metric ${tone}`}><span>{label}</span><strong>{value}</strong><small>Open details →</small></Link>; }
function Status({value}:{value:string}) { return <span className={`badge status-${value}`}>{value.replaceAll('_',' ')}</span>; }
function Health({name,detail}:{name:string;detail:string}) { return <div className="health-row"><span className="status-dot"/><div><strong>{name}</strong><small>{detail}</small></div><span>Operational</span></div>; }
function Empty({text}:{text:string}) { return <div className="empty">{text}</div>; }
