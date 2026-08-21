import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';
import { getSession, isAdmin, isSameOrigin, type Session } from '@/lib/auth';

export async function requireDashboardAdmin() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!isAdmin(session)) redirect('/login?error=forbidden');
  return session;
}

export type ApiAdminAuth = { session: Session; error?: undefined } | { session?: undefined; error: NextResponse };

/**
 * The route-handler counterpart to requireDashboardAdmin(): 401 if
 * unauthenticated, 403 if not ADMIN, 403 on a cross-origin request when one
 * is supplied (state-changing methods only — omit `request` for GET).
 * Previously copy-pasted verbatim into every admin-gated API route.
 */
export async function requireApiAdmin(request?: Request): Promise<ApiAdminAuth> {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!isAdmin(session)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  if (request && !isSameOrigin(request)) return { error: NextResponse.json({ error: 'Invalid origin' }, { status: 403 }) };
  return { session };
}
