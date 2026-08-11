'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const activeStatuses = new Set(['planning', 'queued', 'coding', 'testing', 'reviewing']);
const repositoryStatuses = new Set(['awaiting_human_review', 'pull_request_open', 'preview_ready', 'approved_for_merge']);
// Mirror of the transition table's CANCELLED edges (the server enforces the
// authoritative check; this only decides whether the button renders).
const cancellableStates = new Set(['DRAFT', 'QUEUED', 'PLANNING', 'RUNNING', 'VALIDATING', 'REPAIRING', 'REVIEWING', 'PR_CREATED', 'PREVIEW_PENDING', 'PREVIEW_READY', 'AWAITING_APPROVAL', 'CHANGES_REQUESTED', 'HUMAN_INPUT_REQUIRED', 'INFRASTRUCTURE_FAILED', 'CODE_FAILED', 'FAILED']);

export default function TaskActions({ taskId, status, state }: { taskId: string; status: string; state?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  // P12: the merge gate can request changes instead of approve/reject;
  // CHANGES_REQUESTED shares the legacy status string, so gate-specific UI
  // keys off the state machine state, not the legacy label.
  const [changeFormOpen, setChangeFormOpen] = useState(false);
  const [changeNote, setChangeNote] = useState('');
  const atMergeGate = state === 'AWAITING_APPROVAL' && status === 'awaiting_human_review';
  const changesRequested = state === 'CHANGES_REQUESTED';

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
  async function act(action: string, comments?: string) {
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`/api/tasks/${taskId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(comments !== undefined ? { action, comments } : { action }) });
      const data = await response.json();
      setMessage(response.ok ? data.message : data.error);
      if (response.ok) { setChangeFormOpen(false); setChangeNote(''); router.refresh(); }
    } catch { setMessage('The dashboard could not reach the control-plane API.'); }
    finally { setBusy(false); }
  }

  const help = changesRequested ? 'Changes were requested at the final gate. Resubmit to re-run the guarded runner with that feedback, or reject the result.'
    : status === 'draft' ? 'Generate a read-only implementation plan. No repository changes will occur.'
    : status === 'planning' ? 'Gemini is producing and validating the plan.'
    : status === 'awaiting_plan_approval' ? 'Review the generated plan before approving repository changes.'
    : status === 'queued' ? 'Approved and waiting for the guarded runner.'
    : status === 'coding' ? 'The runner is editing a private task workspace.'
    : status === 'testing' ? 'Changes are being validated inside the restricted Docker sandbox.'
    : status === 'reviewing' ? 'Validation passed; the split reviewers are checking the diff.'
    : atMergeGate ? 'A draft pull request is ready. Approve, reject, or request specific changes with a note.'
    : status === 'approved_for_merge' ? 'Final approval is recorded. Merge remains a deliberate GitHub action.'
    : status === 'completed' ? 'The pull request was merged and the task checker marked this work completed.'
    : status === 'failed' ? 'The run failed closed. Review the error, then generate a fresh plan.'
    : 'The task history and current state are shown below.';

  return <div className="action-bar"><div><strong>Next action</strong><small>{help}</small></div><div className="action-buttons">
    <a className="button secondary" href={`/tasks/${taskId}/results`}>Results &amp; run log</a>
    {(status === 'draft' || status === 'failed') && <button disabled={busy} className="button primary" onClick={() => act('request_plan')}>{status === 'failed' ? 'Start fresh plan' : 'Request plan'}</button>}
    {activeStatuses.has(status) && <span className={`badge status-${status}`}>{status.replaceAll('_', ' ')}…</span>}
    {repositoryStatuses.has(status) && <button disabled={busy} className="button secondary" onClick={() => act('check_status')}>Check status</button>}
    {status === 'awaiting_plan_approval' && <><button disabled={busy} className="button primary" onClick={() => act('approve_plan')}>Approve and run</button><button disabled={busy} className="button danger" onClick={() => act('reject_plan')}>Reject</button></>}
    {atMergeGate && <>
      <button disabled={busy} className="button primary" onClick={() => act('approve_final')}>Approve final result</button>
      <button disabled={busy} className="button secondary" onClick={() => setChangeFormOpen((open) => !open)}>Request changes</button>
      <button disabled={busy} className="button danger" onClick={() => act('reject_final')}>Reject result</button>
    </>}
    {changesRequested && <>
      <button disabled={busy} className="button primary" onClick={() => act('resubmit_changes')}>Resubmit for re-execution</button>
      <button disabled={busy} className="button danger" onClick={() => act('reject_final')}>Reject result</button>
    </>}
    {state && cancellableStates.has(state) && <button disabled={busy} className="button secondary" onClick={() => { if (window.confirm('Cancel this task? Queued jobs are removed and live sandboxes are stopped.')) void act('cancel_task'); }}>Cancel task</button>}
    {message && <span className="muted">{message}</span>}
  </div>
  {changeFormOpen && atMergeGate && <div className="change-request-form">
    <label htmlFor="change-note"><strong>What must change?</strong></label>
    <textarea id="change-note" rows={4} maxLength={2000} value={changeNote} onChange={(event) => setChangeNote(event.target.value)} placeholder="Describe the required changes. The guarded runner receives this note with the approved plan." />
    <div className="action-buttons">
      <button disabled={busy || !changeNote.trim()} className="button primary" onClick={() => act('request_changes', changeNote)}>Record change request</button>
      <button disabled={busy} className="button secondary" onClick={() => { setChangeFormOpen(false); setChangeNote(''); }}>Cancel</button>
    </div>
  </div>}
  </div>;
}
