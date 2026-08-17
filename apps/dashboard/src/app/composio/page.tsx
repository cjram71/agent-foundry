import { redirect } from 'next/navigation';
import { getSession, isAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function ComposioPage() {
  const session = await getSession();
  if (!isAdmin(session)) redirect('/login?error=forbidden');
  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">INTEGRATIONS</p>
          <h1>Composio connections</h1>
          <p>Connect approved external services in Composio. Connections remain subject to Gizmo identity, permission, approval, rate, and audit controls.</p>
        </div>
      </header>
      <section className="panel">
        <h2>Rahmings workspace</h2>
        <p>Open Composio’s connection manager to authorize an app connection for this workspace.</p>
        <a className="button primary" href="https://dashboard.composio.dev/rahmings_workspace/~/connect" target="_blank" rel="noreferrer">Open Composio connections</a>
        <p className="muted">Authorizing a connection does not automatically grant an agent permission to use it.</p>
      </section>
    </div>
  );
}
