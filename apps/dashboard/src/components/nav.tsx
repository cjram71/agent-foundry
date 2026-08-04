'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  ['/', 'Overview'],
  ['/projects', 'Projects'],
  ['/tasks', 'Tasks'],
  ['/approvals', 'Approvals'],
  ['/runs', 'Agent Runs'],
];

export default function Nav() {
  const pathname = usePathname();
  return <aside className="sidebar">
    <div className="brand"><span className="brand-mark">AF</span><div><strong>Agent Foundry</strong><small>Control Plane</small></div></div>
    <nav>{links.map(([href,label]) => <Link key={href} href={href} className={pathname === href || (href !== '/' && pathname.startsWith(href)) ? 'active' : ''}>{label}</Link>)}</nav>
    <div className="sidebar-status"><span className="status-dot"/> Gizmo online<small>Private Tailscale network</small></div>
  </aside>;
}
