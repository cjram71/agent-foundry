'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const activeStatuses = new Set(['planning', 'queued', 'coding', 'testing', 'reviewing']);
const repositoryStatuses = new Set(['awaiting_human_review', 'pull_request_open', 'preview_ready', 'approved_for_merge']);

export default function TaskActions({ taskId, status }: { taskId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!activeStatuses.has(status)) return;
    const timer = setInterval(() => router.refresh(), 2500);
    return () => clearInterval(timer);
  }, [status, router]);


  useEffect(() => {
    if (!repositoryStatuses.has(status)) return; let cancelled = false;
    async function checkRepository() { try { const response = await fetch(`/api/tasks/${taskId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'check_status' }) }); const data = await response.json(); if (cancelled) return; setMessage(response.ok ? data.message : data.error); if (response.ok && data.status !== status) router.refresh(); } catch { if (!cancelled) setMessage('GitHub status check is temporarily unavailable.'); } }
    void checkRepository(); const timer = setInterval(checkRepository, 15000); return () => { cancelled = true; clearInterval(timer); };
  }, [taskId, status, router]);
  async function act(action: string) {
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`/api/tasks/${taskId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
      const data = await response.json();
      setMessage(response.ok ? data.message : data.error);
      if (response.ok) router.refresh();
    } catch { setMessage('The dashboard could not reach the control-plane API.'); }
    finally { setBusy(false); }
  }

  const help = status === 'draft' ? 'Generate a read-only implementation plan. No repository changes will occur.'
    : status === 'planning' ? 'Gemini is producing and validating the plan.'
    : status === 'awaiting_plan_approval' ? 'Review the generated plan before approving repository changes.'
    : status === 'queued' ? 'Approved and waiting for the guarded runner.'
    : status === 'coding' ? 'The runner is editing a private task workspace.'
    : status === 'testing' ? 'Changes are being validated inside the restricted Docker sandbox.'
    : status === 'reviewing' ? 'Validation passed; the safety reviewer is checking the diff.'
    : status === 'awaiting_human_review' ? 'A draft pull request is ready. Review the code and preview before final approval.'
    : status === 'approved_for_merge' ? 'Final approval is recorded. Merge remains a deliberate GitHub action.'
    : status === 'completed' ? 'The pull request was merged and the task checker marked this work completed.'
    : status === 'failed' ? 'The run failed closed. Review the error, then generate a fresh plan.'
    : 'The task history and current state are shown below.';

  return <div className="action-bar"><div><strong>Next action</strong><small>{help}</small></div><div className="action-buttons">
    {(status === 'draft' || status === 'failed') && <button disabled={busy} className="button primary" onClick={() => act('request_plan')}>{status === 'failed' ? 'Start fresh plan' : 'Request plan'}</button>}
    {activeStatuses.has(status) && <span className={`badge status-${status}`}>{status.replaceAll('_', ' ')}…</span>}
    {repositoryStatuses.has(status) && <button disabled={busy} className="button secondary" onClick={() => act('check_status')}>Check status</button>}
    {status === 'awaiting_plan_approval' && <><button disabled={busy} className="button primary" onClick={() => act('approve_plan')}>Approve and run</button><button disabled={busy} className="button danger" onClick={() => act('reject_plan')}>Reject</button></>}
    {status === 'awaiting_human_review' && <><button disabled={busy} className="button primary" onClick={() => act('approve_final')}>Approve final result</button><button disabled={busy} className="button danger" onClick={() => act('reject_final')}>Reject result</button></>}
    {message && <span className="muted">{message}</span>}
  </div></div>;
}