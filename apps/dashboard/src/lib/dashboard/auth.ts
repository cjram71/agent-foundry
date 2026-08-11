import { redirect } from 'next/navigation';
import { getSession, isAdmin } from '@/lib/auth';

export async function requireDashboardAdmin() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!isAdmin(session)) redirect('/login?error=forbidden');
  return session;
}
