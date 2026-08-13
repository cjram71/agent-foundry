'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function StartDiscovery() {
  const router = useRouter(); const [confirming, setConfirming] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function start() { setBusy(true); setError(''); try { const response = await fetch('/api/company/discovery', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirmation: 'START READ-ONLY BOOSTA DISCOVERY' }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Discovery could not start'); router.push(`/missions/${data.missionId}`); router.refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Discovery could not start'); setBusy(false); } }
  if (!confirming) return <button className="button primary" onClick={() => setConfirming(true)}>Start company discovery</button>;
  return <div className="constitution-confirm"><p><strong>Start read-only discovery?</strong> Five independent specialists will research public evidence and the AI CEO will prepare one recommendation. They cannot spend, contact anyone, publish, deploy, sign, acquire rights, or write permanent memory.</p><div className="action-buttons"><button className="button primary" disabled={busy} onClick={start}>{busy ? 'Starting...' : 'Start read-only research'}</button><button className="button secondary" disabled={busy} onClick={() => setConfirming(false)}>Cancel</button></div>{error ? <p className="error-text">{error}</p> : null}</div>;
}
