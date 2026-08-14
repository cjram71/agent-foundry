'use client';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

export function CampaignRequest() {
  const router = useRouter();
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('');
    const form = new FormData(event.currentTarget);
    const body = { title: form.get('title'), objective: form.get('objective'), audience: form.get('audience'), offer: form.get('offer'), destinations: form.getAll('destinations'), targetLanguages: form.getAll('targetLanguages'), constraints: String(form.get('constraints') || '').split('\n').map(value => value.trim()).filter(Boolean) };
    try {
      const response = await fetch('/api/editorial', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Campaign request failed');
      event.currentTarget.reset(); setMessage(`Campaign mission created: ${data.missionId}`); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Campaign request failed'); }
    finally { setBusy(false); }
  }
  return <section className="panel"><h2>Request campaign</h2><p>The Chief of Staff creates a governed Mission and sends it to the Marketing agent. Nothing is published without your approval.</p><form className="form-stack" onSubmit={submit}><label>Campaign title<input name="title" required maxLength={140}/></label><label>Objective<textarea name="objective" required maxLength={2000}/></label><label>Audience<textarea name="audience" required maxLength={1000}/></label><label>Offer<textarea name="offer" required maxLength={1000}/></label><fieldset><legend>Destinations</legend>{['website','linkedin','instagram','facebook'].map(value=><label key={value}><input type="checkbox" name="destinations" value={value} defaultChecked={value==='website'}/> {value}</label>)}</fieldset><fieldset><legend>Languages</legend>{['sv','en'].map(value=><label key={value}><input type="checkbox" name="targetLanguages" value={value} defaultChecked/> {value}</label>)}</fieldset><label>Constraints, one per line<textarea name="constraints" maxLength={3000}/></label><button className="button primary" disabled={busy}>{busy?'Creating…':'Create campaign mission'}</button>{message?<small>{message}</small>:null}</form></section>;
}
