import Link from 'next/link';
import type { ReactNode } from 'react';

export function OpsPage({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: ReactNode }) {
  return <div className="page-stack"><header className="page-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div></header>{children}</div>;
}

export function DataPanel({ title, children }: { title: string; children: ReactNode }) {
  return <section className="panel"><div className="section-heading"><h2>{title}</h2></div>{children}</section>;
}

export function Empty({ children = 'No authoritative records are available.' }: { children?: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function EntityLink({ href, title, detail }: { href: string; title: string; detail?: string }) {
  return <Link href={href} className="approval-row"><div><h3>{title}</h3>{detail ? <p>{detail}</p> : null}</div><span>Open →</span></Link>;
}

export function Value({ value, unknown = 'Unknown' }: { value: ReactNode; unknown?: string }) {
  return <>{value === null || value === undefined || value === '' ? unknown : value}</>;
}

export function safeDate(value: Date | string | null | undefined) {
  return value ? new Date(value).toLocaleString() : 'Unknown';
}
