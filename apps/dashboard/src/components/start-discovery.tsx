'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function StartDiscovery() {
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      try {
        const response = await fetch('/api/company/discovery', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ confirmation: 'START READ-ONLY BOOSTA DISCOVERY' }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Discovery could not start');
        router.replace(`/missions/${data.missionId}`);
        router.refresh();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Discovery could not start');
      }
    })();
  }, [router]);

  return <div className="constitution-confirm" role="status">
    <p><strong>Company discovery starts automatically once.</strong> Boosta OS is preparing the bounded, read-only specialist research mission.</p>
    {error ? <p className="error-text">Automatic discovery could not start: {error}. Reload this page to retry safely.</p> : <p>Starting discovery…</p>}
  </div>;
}
