// Pure session-token core: cookie policy, TTL policy, and JWT issue/verify.
// No database access and no node-only imports, so this module is usable from
// proxy/middleware, route handlers, and unit tests alike.

import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { getJwtSecret } from './secrets';

export const SESSION_COOKIE_NAME = 'foundry_session';
export const SESSION_TTL_MINUTES = 8 * 60;
export const SESSION_TTL_SECONDS = SESSION_TTL_MINUTES * 60;

export type SessionRole = 'ADMIN' | 'OPERATOR';
export type SessionClaims = { userId: string; email: string; role: SessionRole; sid: string } & JWTPayload;

export function sessionCookieOptions(production: boolean) {
  return {
    httpOnly: true,
    secure: production,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  };
}

export function sessionExpiryDate(fromMs = Date.now()): Date {
  return new Date(fromMs + SESSION_TTL_SECONDS * 1000);
}

export async function issueSessionToken(claims: { userId: string; email: string; role: SessionRole; sid: string }): Promise<string> {
  return new SignJWT({ userId: claims.userId, email: claims.email, role: claims.role, sid: claims.sid })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_MINUTES}m`)
    .sign(getJwtSecret());
}

export async function verifySessionToken(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), { algorithms: ['HS256'] });
    if (typeof payload.userId !== 'string' || typeof payload.email !== 'string'
      || typeof payload.sid !== 'string'
      || (payload.role !== 'ADMIN' && payload.role !== 'OPERATOR')) return null;
    return payload as SessionClaims;
  } catch {
    return null;
  }
}
