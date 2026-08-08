'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/** P14 emergency stop control (docs/OPERATIONS.md): pauses both workers
 *  from fetching new jobs; in-flight work always completes. */
export default function EmergencyStop() {
  const router = useRouter();
  const [engaged, setEngaged] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch('/api/system');
        const data = await response.json();
        if (!cancelled) setEngaged(Boolean(data.emergencyStop));
      } catch { if (!cancelled) setEngaged(null); }
    }
    void load();
    const timer = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  async function toggle() {
    const action = engaged ? 'emergency_resume' : 'emergency_stop';
    if (!engaged && !window.confirm('Pause ALL agent work? Workers stop fetching new jobs; in-flight jobs complete.')) return;
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/system', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
      const data = await response.json();
      if (response.ok) setEngaged(Boolean(data.emergencyStop));
      setMessage(response.ok ? data.message : data.error);
      router.refresh();
    } catch { setMessage('The dashboard could not reach the control-plane API.'); }
    finally { setBusy(false); }
  }

  if (engaged === null) return null;
  return <div className={`emergency-stop${engaged ? ' engaged' : ''}`}>
    <div><strong>{engaged ? 'Emergency stop is ENGAGED' : 'Emergency stop'}</strong>
      <small>{engaged ? 'All agent workers are paused. In-flight jobs finish; cancel tasks individually for a hard stop.' : 'Pause all agent workers from starting new work.'}</small>
      {message && <small className="muted">{message}</small>}
    </div>
    <button disabled={busy} className={`button ${engaged ? 'primary' : 'danger'}`} onClick={() => void toggle()}>{engaged ? 'Resume work' : 'Stop all work'}</button>
  </div>;
}
