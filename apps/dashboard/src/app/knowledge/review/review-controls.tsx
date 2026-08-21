'use client';
import { useState } from 'react';

async function patchReview(body: Record<string, unknown>) {
  const response = await fetch('/api/knowledge/review', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Request failed');
  return data;
}

export function ReviewControls(props: { approveAction?: string; rejectAction?: string; id?: string; confirmUnmatchedId?: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [linkTo, setLinkTo] = useState('');

  async function run(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setMessage('');
    try {
      await patchReview({ action, id: props.id ?? props.confirmUnmatchedId, ...extra });
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Request failed');
      setBusy(false);
    }
  }

  if (props.confirmUnmatchedId) {
    return <span>
      <input placeholder="Entity id to link" value={linkTo} onChange={(event) => setLinkTo(event.target.value)} className="mono" />
      <button className="button secondary" disabled={busy || !linkTo} onClick={() => run('link_alias', { entityId: linkTo })}>Link</button>
      <button className="button secondary" disabled={busy} onClick={() => run('confirm_unmatched')}>Confirm unmatched</button>
      {message ? <small className="notice">{message}</small> : null}
    </span>;
  }

  return <span>
    <button className="button primary" disabled={busy} onClick={() => run(props.approveAction!)}>Approve</button>
    <button className="button secondary" disabled={busy} onClick={() => run(props.rejectAction!)}>Reject</button>
    {message ? <small className="notice">{message}</small> : null}
  </span>;
}
