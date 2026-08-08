import { NextResponse } from 'next/server';
import { isSameOrigin } from '@/lib/origin';
import { authenticateCredentials, INVALID_CREDENTIALS } from '@/lib/login-flow';
import { SESSION_COOKIE_NAME, sessionCookieOptions } from '@/lib/auth-session';

/**
 * Thin HTTP wrapper around lib/login-flow.ts. All credential, rate-limit,
 * session, and audit behavior lives in the flow module so it is directly
 * testable against a real database; this route only maps results to HTTP
 * and attaches the session cookie.
 */
export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
    const body = await request.json().catch(() => ({}));
    const result = await authenticateCredentials({
      email: body.email,
      password: body.password,
      ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      userAgent: request.headers.get('user-agent')?.slice(0, 255) ?? null,
    });

    if (result.kind === 'rate_limited') {
      return NextResponse.json({ error: 'Too many login attempts' }, { status: 429, headers: { 'Retry-After': String(result.retryAfter) } });
    }
    if (result.kind === 'invalid') {
      return NextResponse.json({ error: INVALID_CREDENTIALS }, { status: 401 });
    }
    const response = NextResponse.json({ success: true });
    response.cookies.set(SESSION_COOKIE_NAME, result.token, sessionCookieOptions(process.env.NODE_ENV === 'production'));
    return response;
  } catch (error) {
    console.error('Login error:', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
