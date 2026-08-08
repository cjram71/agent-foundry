import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { getJwtSecret } from '@/lib/secrets';
import { SESSION_COOKIE_NAME, sessionCookieOptions } from '@/lib/auth-session';
import { decideRequest } from '@/lib/request-guard';

/**
 * Perimeter guard (runs on every matched request). Performs the fast,
 * edge-safe checks only: presence and JWT validity of the session cookie.
 * Revocation is enforced one layer deeper by getSession() in route handlers
 * and server components, which consult the Session table.
 */
export async function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  let authenticated = false;
  if (token) {
    try {
      await jwtVerify(token, getJwtSecret(), { algorithms: ['HS256'] });
      authenticated = true;
    } catch {
      authenticated = false;
    }
  }

  const verdict = decideRequest(request.nextUrl.pathname, authenticated);
  if (verdict.action === 'redirect') {
    return NextResponse.redirect(new URL(verdict.location, request.url));
  }
  if (verdict.action === 'reject') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: verdict.status });
  }
  if (token && !authenticated) {
    // A cookie was presented but failed verification: do not let a stale or
    // tampered cookie linger.
    const response = NextResponse.next();
    response.cookies.set(SESSION_COOKIE_NAME, '', { ...sessionCookieOptions(process.env.NODE_ENV === 'production'), maxAge: 0 });
    return response;
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
