'use client';
import { FormEvent, useState } from 'react';
type Document = { id: string; title: string };
export function KnowledgeControls({ documents, approvedDocuments }: { documents: Document[]; approvedDocuments: Document[] }) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>, url: string, method: 'POST' | 'PATCH', action?: string) { event.preventDefault(); setBusy(true); setMessage(''); const form = new FormData(event.currentTarget); const response = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...(action ? { action } : {}), ...Object.fromEntries(form) }) }); const data = await response.json(); setBusy(false); if (!response.ok) { setMessage(data.error ?? 'Request failed'); return; } setMessage('Saved. Reloading…'); window.location.reload(); }
  return <section className="grid-two">
    <form className="panel form" onSubmit={(event) => submit(event, '/api/knowledge/documents', 'POST')}>
      <div className="panel-head"><div><h2>Register document</h2><p>Human-supplied only. Nothing is fetched automatically.</p></div></div>
      <label>Namespace<select name="namespace" defaultValue="crm"><option value="crm">CRM</option><option value="operations">Operations</option><option value="intelligence">Intelligence</option></select></label>
      <label>Title<input name="title" required maxLength={300} /></label>
      <label>Source<input name="sourceUri" required maxLength={2000} placeholder="Where this text came from" /></label>
      <label>Document text<textarea name="content" required maxLength={200_000} rows={6} placeholder="Paste the approved source text" /></label>
      <button className="button primary" disabled={busy}>Register document</button>
    </form>
    <form className="panel form" onSubmit={(event) => submit(event, '/api/knowledge/documents', 'PATCH', 'approve')}>
      <div className="panel-head"><div><h2>Approve for extraction</h2><p>Only approved documents can be extracted. No extraction runs automatically.</p></div></div>
      <label>Pending document<select name="id" defaultValue="">{!documents.length ? <option value="">No documents pending approval</option> : null}{documents.map((document) => <option value={document.id} key={document.id}>{document.title}</option>)}</select></label>
      <button className="button secondary" disabled={busy || !documents.length}>Approve document</button>
    </form>
    <form className="panel form" onSubmit={(event) => submit(event, '/api/knowledge/extractions', 'POST')}>
      <div className="panel-head"><div><h2>Run extraction</h2><p>Proposes facts only. Nothing is promoted until a human reviews it.</p></div></div>
      <label>Approved document<select name="documentId" defaultValue="">{!approvedDocuments.length ? <option value="">No documents approved yet</option> : null}{approvedDocuments.map((document) => <option value={document.id} key={document.id}>{document.title}</option>)}</select></label>
      <button className="button secondary" disabled={busy || !approvedDocuments.length}>Run extraction</button>
    </form>
    {message ? <p className="notice">{message}</p> : null}
  </section>;
}
