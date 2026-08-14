'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const decisions = [
  ['APPROVE', 'Approve'],
  ['REJECT', 'Reject'],
  ['RESEARCH_MORE', 'Research more'],
  ['NO_ACTION', 'No action'],
] as const;

export function OpportunityDecisionControls({ id }: { id: string }) {
  const router = useRouter();
  const [rationale, setRationale] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function decide(decision: string) {
    if (rationale.trim().length < 10) {
      setError('Add a rationale of at least 10 characters.');
      return;
    }
    setPending(decision);
    setError('');
    try {
      const response = await fetch('/api/opportunities', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, action: 'decide', decision, rationale }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Decision failed');
      setRationale('');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Decision failed');
    } finally {
      setPending(null);
    }
  }

  return <div className="page-stack" style={{ gap: '.6rem', marginTop: '.8rem' }}>
    <label>
      <span className="eyebrow">HUMAN RATIONALE</span>
      <textarea value={rationale} onChange={(event) => setRationale(event.target.value)} rows={3} maxLength={2000} placeholder="Explain the decision, evidence, and assumptions." disabled={pending !== null} />
    </label>
    <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
      {decisions.map(([value, label]) => <button className={value === 'APPROVE' ? 'button' : 'button secondary'} type="button" key={value} disabled={pending !== null} onClick={() => decide(value)}>{pending === value ? 'Recording…' : label}</button>)}
    </div>
    {error ? <p role="alert">{error}</p> : null}
    <p>Records the owner decision only. It does not create a project, spend money, deploy, or contact anyone.</p>
  </div>;
}
