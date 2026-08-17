// Integration suite: the spec §8 authentication requirements exercised
// against a REAL PostgreSQL (never a stub). Runs only when TEST_DATABASE_URL
// points at a migrated scratch database, e.g.:
//
//   TEST_DATABASE_URL=postgresql://foundry:foundry@127.0.0.1:5432/foundry_test \
//     npx prisma migrate deploy --schema packages/database/prisma/schema.prisma && \
//     (cd apps/dashboard && DATABASE_URL=$TEST_DATABASE_URL npm test)
//
// In CI this is wired by docs/ci-migrate-scratch.job.yml. Without the variable
// every case reports `skip` so unit runs stay hermetic.

import test from 'node:test';
import assert from 'node:assert/strict';

const TEST_DB = process.env.TEST_DATABASE_URL;
const configuredDatabase = process.env.DATABASE_URL;
if (TEST_DB && configuredDatabase) {
  const testUrl = new URL(TEST_DB);
  const configuredUrl = new URL(configuredDatabase);
  if (testUrl.hostname === configuredUrl.hostname && testUrl.port === configuredUrl.port && testUrl.pathname === configuredUrl.pathname) {
    throw new Error('TEST_DATABASE_URL must not point to the configured application database');
  }
}
process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-test-jwt-secret-with-64-characters-padding-y';
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

const hasDb = { skip: !TEST_DB };

async function loadModules() {
  const { default: prisma } = await import('../../../lib/prisma.ts');
  const { authenticateCredentials, INVALID_CREDENTIALS } = await import('../../../lib/login-flow.ts');
  const { findActiveSession, revokeSession } = await import('../../../lib/session-store.ts');
  const { verifySessionToken } = await import('../../../lib/auth-session.ts');
  const bcrypt = (await import('bcrypt')).default;
  return { prisma, authenticateCredentials, INVALID_CREDENTIALS, findActiveSession, revokeSession, verifySessionToken, bcrypt };
}

const runId = Math.random().toString(36).slice(2, 10);
const email = `admin-${runId}@example.test`;
const password = `S3cure!pass-${runId}`;

type Ctx = Awaited<ReturnType<typeof loadModules>>;

async function provision(ctx: Ctx) {
  const passwordHash = await ctx.bcrypt.hash(password, 12);
  const user = await ctx.prisma.user.create({ data: { email, passwordHash, role: 'ADMIN' } });
  return user;
}

async function cleanup(ctx: Ctx, userId: string) {
  await ctx.prisma.auditEvent.deleteMany({ where: { target: { in: [email, userId] } } });
  await ctx.prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  await ctx.prisma.$disconnect();
}

// Spec §8.1 — a valid administrator can log in (server-side session created,
// token verifies, audit written).
test('integration §8.1: valid administrator login creates a verifiable session', hasDb, async () => {
  const ctx = await loadModules();
  const user = await provision(ctx);
  try {
    const result = await ctx.authenticateCredentials({ email, password, ip: '10.0.0.1', userAgent: 'itest' });
    assert.equal(result.kind, 'ok');
    if (result.kind !== 'ok') return;
    const claims = await ctx.verifySessionToken(result.token);
    assert.ok(claims && claims.userId === user.id && claims.sid === result.sessionId);
    assert.ok(await ctx.findActiveSession(result.sessionId));
    const audit = await ctx.prisma.auditEvent.findFirst({ where: { action: 'auth.login_success', target: user.id } });
    assert.ok(audit, 'auth.login_success audit recorded');
  } finally {
    await cleanup(ctx, user.id);
  }
});

// Spec §8.2 + §8.3 + §8.10 — wrong password and unknown account are
// indistinguishable and leak nothing; both are audited the same way.
test('integration §8.2/§8.3/§8.10: invalid logins are rejected uniformly without enumeration', hasDb, async () => {
  const ctx = await loadModules();
  const user = await provision(ctx);
  try {
    const wrongPassword = await ctx.authenticateCredentials({ email, password: 'definitely-wrong-1', ip: '10.0.0.2', userAgent: 'itest' });
    const unknownAccount = await ctx.authenticateCredentials({ email: `ghost-${runId}@example.test`, password: 'definitely-wrong-1', ip: '10.0.0.2', userAgent: 'itest' });
    assert.deepEqual(wrongPassword, { kind: 'invalid', error: ctx.INVALID_CREDENTIALS });
    assert.deepEqual(unknownAccount, { kind: 'invalid', error: ctx.INVALID_CREDENTIALS });
    for (const target of [email, `ghost-${runId}@example.test`]) {
      const audit = await ctx.prisma.auditEvent.findFirst({ where: { action: 'auth.login_failed', target } });
      assert.ok(audit, `failed attempt against ${target} is audited`);
      await ctx.prisma.auditEvent.deleteMany({ where: { target } });
    }
  } finally {
    await cleanup(ctx, user.id);
  }
});

// Spec §8.6/§8.7 — logout revokes the session server-side; expiry is enforced.
test('integration §8.6/§8.7: logout revokes immediately; expired sessions are dead', hasDb, async () => {
  const ctx = await loadModules();
  const user = await provision(ctx);
  try {
    const result = await ctx.authenticateCredentials({ email, password, ip: null, userAgent: null });
    assert.equal(result.kind, 'ok');
    if (result.kind !== 'ok') return;
    assert.equal(await ctx.revokeSession(result.sessionId), true, 'first logout revokes');
    assert.equal(await ctx.revokeSession(result.sessionId), false, 'second revoke is a no-op (idempotent logout)');
    assert.equal(await ctx.findActiveSession(result.sessionId), null, 'revoked session no longer authenticates');

    const expired = await ctx.prisma.session.create({
      data: { userId: user.id, expiresAt: new Date(Date.now() - 1000) },
    });
    assert.equal(await ctx.findActiveSession(expired.id), null, 'expired session no longer authenticates');
  } finally {
    await cleanup(ctx, user.id);
  }
});

// Spec §8.8 — repeated failures are rate-limited, and the block is audited.
test('integration §8.8: repeated failed logins are rate-limited with an audit trail', hasDb, async () => {
  const ctx = await loadModules();
  const user = await provision(ctx);
  try {
    let last: Awaited<ReturnType<typeof ctx.authenticateCredentials>> | null = null;
    for (let i = 0; i < 6; i++) {
      last = await ctx.authenticateCredentials({ email, password: `wrong-${i}`, ip: '10.9.9.9', userAgent: 'itest' });
    }
    assert.ok(last);
    assert.equal(last.kind, 'rate_limited');
    if (last.kind === 'rate_limited') assert.ok(last.retryAfter >= 1);
    const audit = await ctx.prisma.auditEvent.findFirst({ where: { action: 'auth.login_rate_limited', target: email } });
    assert.ok(audit, 'rate-limit event is audited');
  } finally {
    await ctx.prisma.auditEvent.deleteMany({ where: { target: email } });
    await ctx.prisma.user.delete({ where: { id: user.id } });
    await ctx.prisma.$disconnect();
  }
});

// Data-model guarantee under the same suite: deleting a user cascades to that
// user's sessions (P4 migration FK semantics).
test('integration: session rows are removed when the owning user is deleted', hasDb, async () => {
  const ctx = await loadModules();
  const user = await provision(ctx);
  try {
    const result = await ctx.authenticateCredentials({ email, password, ip: null, userAgent: null });
    assert.equal(result.kind, 'ok');
    if (result.kind !== 'ok') return;
    await ctx.prisma.auditEvent.deleteMany({ where: { target: { in: [email, user.id] } } });
    await ctx.prisma.user.delete({ where: { id: user.id } });
    const orphans = await ctx.prisma.session.count({ where: { userId: user.id } });
    assert.equal(orphans, 0, 'no orphaned sessions remain');
  } finally {
    await ctx.prisma.$disconnect();
  }
});
