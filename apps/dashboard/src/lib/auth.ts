import { cookies } from 'next/headers';
import { SESSION_COOKIE_NAME, verifySessionToken, type SessionRole } from '@/lib/auth-session';
import { findActiveSession } from '@/lib/session-store';

export { SESSION_COOKIE_NAME, SESSION_TTL_MINUTES, SESSION_TTL_SECONDS, sessionCookieOptions, sessionExpiryDate, issueSessionToken, verifySessionToken } from '@/lib/auth-session';
export { getJwtSecret } from '@/lib/secrets';
export { isSameOrigin } from '@/lib/origin';

export type Session = { userId: string; email: string; role: SessionRole; sid: string };

/**
 * Authoritative session resolution for route handlers and server components.
 * Runs in the node runtime only (uses next/headers + Prisma).
 *
 * Two-layer model:
 *  1. The JWT proves integrity and lifetime (signed, 8h exp).
 *  2. The Session row proves the session has not been revoked (logout,
 *     admin action) and has not expired server-side.
 * A request is authenticated only if both layers agree, and the row must
 * belong to the same user as the token.
 */
export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const claims = await verifySessionToken(token);
  if (!claims) return null;
  const record = await findActiveSession(claims.sid);
  if (!record || record.userId !== claims.userId) return null;
  return { userId: claims.userId, email: claims.email, role: claims.role, sid: claims.sid };
}

export function isAdmin(session: Session | null): session is Session {
  return session?.role === 'ADMIN';
}
