// Credential authentication flow, server-side and framework-light: everything
// the login route needs except cookie handling (which stays in the route).
// Kept free of next/headers so it is directly exercisable by integration
// tests with a real database.

import prisma from '@/lib/prisma';
import { verifyPassword } from '@/lib/passwords';
import { issueSessionToken } from '@/lib/auth-session';
import { createSessionRecord } from '@/lib/session-store';
import { checkRateLimit, clearRateLimit } from '@/lib/rate-limit';

export const INVALID_CREDENTIALS = 'Invalid credentials';

export type LoginResult =
  | { kind: 'invalid'; error: typeof INVALID_CREDENTIALS }
  | { kind: 'rate_limited'; retryAfter: number }
  | { kind: 'ok'; sessionId: string; token: string };

/**
 * Authenticates email+password, enforcing:
 *  - input-shape validation,
 *  - per (ip, email) rate limiting with an audited 429 path,
 *  - uniform response and uniform bcrypt cost for unknown accounts and wrong
 *    passwords (INVALID_CREDENTIALS for both; no enumeration by message or
 *    by timing),
 *  - server-side session record for every issued token,
 *  - audit events for success and failure.
 */
export async function authenticateCredentials(input: {
  email: unknown;
  password: unknown;
  ip: string | null;
  userAgent: string | null;
}): Promise<LoginResult> {
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const password = typeof input.password === 'string' ? input.password : '';
  if (!email || email.length > 254 || !password || password.length > 256) {
    return { kind: 'invalid', error: INVALID_CREDENTIALS };
  }

  const key = `${input.ip || 'unknown'}:${email}`;
  const rate = checkRateLimit(key);
  if (!rate.allowed) {
    await prisma.auditEvent.create({
      data: { actor: 'anonymous', action: 'auth.login_rate_limited', target: email, result: 'blocked', metadata: { ip: input.ip } },
    });
    return { kind: 'rate_limited', retryAfter: rate.retryAfter };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const ok = await verifyPassword(password, user?.passwordHash);
  if (!user || !ok) {
    await prisma.auditEvent.create({
      data: { actor: 'anonymous', action: 'auth.login_failed', target: email, result: 'failed', metadata: { ip: input.ip, reason: 'invalid_credentials' } },
    });
    return { kind: 'invalid', error: INVALID_CREDENTIALS };
  }
  clearRateLimit(key);

  const record = await createSessionRecord({ userId: user.id, ip: input.ip, userAgent: input.userAgent });
  const token = await issueSessionToken({ userId: user.id, email: user.email, role: user.role, sid: record.id });
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await prisma.auditEvent.create({
    data: { actor: user.id, action: 'auth.login_success', target: user.id, result: 'success', metadata: { ip: input.ip, sessionId: record.id } },
  });
  return { kind: 'ok', sessionId: record.id, token };
}
