import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { isSameOrigin } from '@/lib/origin';
import { SESSION_COOKIE_NAME, sessionCookieOptions, verifySessionToken } from '@/lib/auth-session';
import { revokeSession } from '@/lib/session-store';

/**
 * Logout is idempotent and CS-tolerant: with an invalid/missing session it
 * still clears the cookie and answers 200. When a valid session exists it is
 * revoked server-side immediately and audited.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });

  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const claims = token ? await verifySessionToken(token) : null;
  if (claims) {
    const revoked = await revokeSession(claims.sid);
    if (revoked) {
      await prisma.auditEvent.create({
        data: { actor: claims.userId, action: 'auth.logout', target: claims.userId, result: 'success', metadata: { sessionId: claims.sid } },
      });
    }
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE_NAME, '', { ...sessionCookieOptions(process.env.NODE_ENV === 'production'), maxAge: 0 });
  return response;
}
