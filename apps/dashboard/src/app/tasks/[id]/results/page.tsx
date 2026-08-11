import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

function label(value: string) {
  return value.replaceAll('_', ' ');
}

function payloadSummary(payload: unknown) {
  if (!payload || typeof payload !== 'object') return null;
  const value = payload as Record<string, unknown>;
  const useful = ['reason', 'stage', 'error', 'files', 'commands', 'repairCycle', 'branchName', 'commit', 'pullRequestUrl'];
  const entries = useful.filter((key) => value[key] !== undefined).map((key) => `${label(key)}: ${typeof value[key] === 'string' ? value[key] : JSON.stringify(value[key])}`);
  return entries.length ? entries.join(' · ') : null;
}

export default async function TaskResults({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const { id } = await params;
  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      project: true,
      attempts: { orderBy: { attemptNumber: 'desc' } },
      agentRuns: { orderBy: { createdAt: 'desc' } },
      approvals: { orderBy: { requestedAt: 'desc' } },
      events: { orderBy: { createdAt: 'desc' } },
      stateTransitions: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!task) notFound();

  const latestAttempt = task.attempts[0];
  const coder = task.agentRuns.find((run) => run.role === 'coder' && run.status === 'success');
  const validationPassed = task.events.some((event) => event.type === 'validation_passed');
  const reviewPassed = task.events.some((event) => event.type === 'review_passed');

  return <div className="page-stack">
    <header className="page-header">
      <div>
        <Link className="back" href={`/tasks/${task.id}`}>← Task plan</Link>
        <p className="eyebrow">DELIVERY RECORD</p>
        <h1>Results &amp; run log</h1>
        <p>{task.title} · {task.project.name}</p>
      </div>
      <span className={`badge large status-${task.status}`}>{label(task.status)}</span>
    </header>

    <section className="metric-grid">
      <div className="metric green"><span>Latest attempt</span><strong>{latestAttempt ? `#${latestAttempt.attemptNumber}` : '—'}</strong><small>{latestAttempt?.status || 'Not started'}</small></div>
      <div className="metric blue"><span>Validation</span><strong>{validationPassed ? 'Passed' : '—'}</strong><small>Restricted sandbox</small></div>
      <div className="metric purple"><span>Review</span><strong>{reviewPassed ? 'Passed' : '—'}</strong><small>Safety and plan fidelity</small></div>
      <div className="metric amber"><span>Tokens</span><strong>{task.tokenUsage.toLocaleString()}</strong><small>{task.agentRuns.length} agent runs</small></div>
    </section>

    <section className="grid-two detail-grid">
      <div className="page-stack">
        <div className="panel">
          <div className="panel-head"><h2>Delivered result</h2><span>{latestAttempt?.status || task.status}</span></div>
          <p className="instruction">{latestAttempt?.outcomeSummary || coder?.outputSummary || 'No completed result has been recorded yet.'}</p>
          <div className="action-buttons">
            {task.pullRequestUrl && <a className="button primary" href={task.pullRequestUrl} target="_blank" rel="noreferrer">Open pull request</a>}
            {task.previewUrl && <a className="button secondary" href={task.previewUrl} target="_blank" rel="noreferrer">Open preview</a>}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><h2>Execution attempts</h2><span>{task.attempts.length}</span></div>
          {task.attempts.map((attempt) => <div className="timeline-row" key={attempt.id}>
            <span className="timeline-dot" />
            <div><strong>Attempt #{attempt.attemptNumber} · {attempt.status}</strong><small>{new Date(attempt.startedAt).toLocaleString()} {attempt.endedAt ? `→ ${new Date(attempt.endedAt).toLocaleString()}` : '→ running'}</small>{attempt.outcomeSummary && <p>{attempt.outcomeSummary}</p>}{attempt.commitSha && <small>Commit: {attempt.commitSha} · Branch: {attempt.branchName}</small>}</div>
          </div>)}
          {!task.attempts.length && <div className="empty">No execution attempts yet.</div>}
        </div>

        <div className="panel">
          <div className="panel-head"><h2>Run event log</h2><span>{task.events.length}</span></div>
          {task.events.map((event) => <div className="timeline-row" key={event.id}>
            <span className="timeline-dot audit" />
            <div><strong>{label(event.type)}</strong><small>{new Date(event.createdAt).toLocaleString()} · {event.actorType}: {event.actor}</small>{payloadSummary(event.payload) && <p>{payloadSummary(event.payload)}</p>}</div>
          </div>)}
          {!task.events.length && <div className="empty">No run events yet.</div>}
        </div>
      </div>

      <aside className="page-stack">
        <div className="panel facts">
          <h2>Result details</h2>
          <dl>
            <dt>State</dt><dd>{label(task.state)}</dd>
            <dt>Status</dt><dd>{label(task.status)}</dd>
            <dt>Branch</dt><dd>{task.branchName || 'Not created'}</dd>
            <dt>Started</dt><dd>{task.startedAt ? new Date(task.startedAt).toLocaleString() : 'Not started'}</dd>
            <dt>Completed</dt><dd>{task.completedAt ? new Date(task.completedAt).toLocaleString() : 'Awaiting merge/completion'}</dd>
          </dl>
        </div>

        <div className="panel">
          <div className="panel-head"><h2>Agent outputs</h2><span>{task.agentRuns.length}</span></div>
          {task.agentRuns.map((run) => <details className="result-details" key={run.id}>
            <summary>{run.role} · {run.status}</summary>
            <small>{run.provider} / {run.model} · {run.tokenUsage.toLocaleString()} tokens</small>
            {run.outputSummary && <pre className="code-block">{run.outputSummary}</pre>}
            {run.errorInfo && <p className="error-text">{run.errorInfo}</p>}
          </details>)}
        </div>

        <div className="panel">
          <div className="panel-head"><h2>State transitions</h2><span>{task.stateTransitions.length}</span></div>
          {task.stateTransitions.map((transition) => <div className="timeline-row" key={transition.id}><span className="timeline-dot" /><div><strong>{label(transition.fromState)} → {label(transition.toState)}</strong><small>{new Date(transition.createdAt).toLocaleString()} · {transition.actor}</small>{transition.reason && <p>{transition.reason}</p>}</div></div>)}
        </div>
      </aside>
    </section>
  </div>;
}
