// Server-side session store (Prisma). A JWT alone is a claim; the Session
// row is the authority that makes logout, revocation, and audit possible.
// Validation failures here must never throw into request handlers — a store
// outage fails closed (treated as "no session"), and the operator sees it in
// server logs.

import prisma from '@/lib/prisma';
import { SESSION_TTL_SECONDS } from '@/lib/auth-session';

export type SessionRecord = { id: string; userId: string; expiresAt: Date };

export async function createSessionRecord(input: { userId: string; ip: string | null; userAgent: string | null }): Promise<{ id: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  const record = await prisma.session.create({
    data: {
      userId: input.userId,
      expiresAt,
      ip: input.ip?.slice(0, 64) ?? null,
      userAgent: input.userAgent?.slice(0, 255) ?? null,
    },
    select: { id: true, expiresAt: true },
  });
  return record;
}

/**
 * Returns the session row only while it is usable: present, not revoked, not
 * expired. lastSeenAt is touched at most once per minute to keep read-heavy
 * API paths from becoming write-heavy.
 */
export async function findActiveSession(id: string): Promise<SessionRecord | null> {
  try {
    const record = await prisma.session.findUnique({
      where: { id },
      select: { id: true, userId: true, expiresAt: true, revokedAt: true, lastSeenAt: true },
    });
    if (!record || record.revokedAt || record.expiresAt.getTime() <= Date.now()) return null;
    if (Date.now() - record.lastSeenAt.getTime() > 60_000) {
      await prisma.session.updateMany({ where: { id, revokedAt: null }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
    }
    return { id: record.id, userId: record.userId, expiresAt: record.expiresAt };
  } catch (error) {
    console.error('[session-store] lookup failed:', error instanceof Error ? error.message : 'unknown');
    return null;
  }
}

export async function revokeSession(id: string): Promise<boolean> {
  try {
    const result = await prisma.session.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } });
    return result.count > 0;
  } catch (error) {
    console.error('[session-store] revoke failed:', error instanceof Error ? error.message : 'unknown');
    return false;
  }
}

/** Housekeeping helper for operators; intentionally not wired to a cron yet. */
export async function deleteExpiredSessions(): Promise<number> {
  const result = await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return result.count;
}
