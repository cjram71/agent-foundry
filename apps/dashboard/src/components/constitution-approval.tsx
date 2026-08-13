'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function ConstitutionApproval() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function approve() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/company/constitution', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirmation: 'APPROVE BOOSTA CONSTITUTION' }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Approval failed');
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Approval failed');
    } finally {
      setBusy(false);
    }
  }

  if (!confirming) return <button className="button primary" onClick={() => setConfirming(true)}>Review and approve constitution</button>;
  return <div className="constitution-confirm"><p><strong>Confirm company rules?</strong> This activates version 1. AI still cannot sign contracts, spend externally, acquire rights, change these rules, or publish products without human approval.</p><div className="action-buttons"><button className="button primary" disabled={busy} onClick={approve}>{busy ? 'Approving…' : 'Approve version 1'}</button><button className="button secondary" disabled={busy} onClick={() => setConfirming(false)}>Cancel</button></div>{error ? <p className="error-text">{error}</p> : null}</div>;
}

