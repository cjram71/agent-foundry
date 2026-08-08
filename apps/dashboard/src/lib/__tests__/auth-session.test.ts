import test from 'node:test';
import assert from 'node:assert/strict';
import { SignJWT } from 'jose';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'unit-test-jwt-secret-value-with-64-characters-padding-x';

const {
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  sessionCookieOptions,
  sessionExpiryDate,
  issueSessionToken,
  verifySessionToken,
} = await import('../auth-session.ts');
const { getJwtSecret } = await import('../secrets.ts');

const CLAIMS = { userId: 'user-1', email: 'admin@example.test', role: 'ADMIN' as const, sid: 'session-1' };

test('auth-session: issued token round-trips and preserves claims', async () => {
  const token = await issueSessionToken(CLAIMS);
  const claims = await verifySessionToken(token);
  assert.ok(claims);
  assert.equal(claims.userId, CLAIMS.userId);
  assert.equal(claims.email, CLAIMS.email);
  assert.equal(claims.role, 'ADMIN');
  assert.equal(claims.sid, CLAIMS.sid);
  assert.ok(typeof claims.exp === 'number' && claims.exp > Date.now() / 1000);
});

test('auth-session: tampered token is rejected', async () => {
  const token = await issueSessionToken(CLAIMS);
  const tampered = token.slice(0, -2) + 'xx';
  assert.equal(await verifySessionToken(tampered), null);
});

test('auth-session: token signed with a different secret is rejected', async () => {
  const foreign = await new SignJWT({ userId: 'user-1', email: CLAIMS.email, role: 'ADMIN', sid: 'x' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('10m')
    .sign(new TextEncoder().encode('a-completely-different-secret-key-that-is-long'));
  assert.equal(await verifySessionToken(foreign), null);
});

test('auth-session: expired token is rejected', async () => {
  const expired = await new SignJWT({ userId: 'user-1', email: CLAIMS.email, role: 'ADMIN', sid: 'x' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(Math.floor(Date.now() / 1000) - 9 * 3600)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
    .sign(getJwtSecret());
  assert.equal(await verifySessionToken(expired), null);
});

test('auth-session: malformed claims are rejected', async () => {
  const noSid = await new SignJWT({ userId: 'user-1', email: CLAIMS.email, role: 'ADMIN' })
    .setProtectedHeader({ alg: 'HS256' }).setExpirationTime('10m').sign(getJwtSecret());
  assert.equal(await verifySessionToken(noSid), null);
  const badRole = await new SignJWT({ userId: 'u', email: 'e@x.y', role: 'SUPERROOT', sid: 's' })
    .setProtectedHeader({ alg: 'HS256' }).setExpirationTime('10m').sign(getJwtSecret());
  assert.equal(await verifySessionToken(badRole), null);
});

test('auth-session: cookie policy (spec §8) — name, HttpOnly, SameSite, path, TTL, environment-aware Secure', () => {
  assert.equal(SESSION_COOKIE_NAME, 'foundry_session');
  const prod = sessionCookieOptions(true);
  assert.deepEqual(
    { httpOnly: prod.httpOnly, sameSite: prod.sameSite, path: prod.path, secure: prod.secure },
    { httpOnly: true, sameSite: 'lax', path: '/', secure: true },
  );
  const dev = sessionCookieOptions(false);
  assert.equal(dev.secure, false, 'local development over plain HTTP keeps working');
  assert.equal(prod.maxAge, SESSION_TTL_SECONDS);
  assert.equal(SESSION_TTL_SECONDS, 8 * 3600, 'session lifetime stays at the documented 8 hours');
});

test('auth-session: expiry date math matches the TTL policy', () => {
  const from = 1_700_000_000_000;
  assert.equal(sessionExpiryDate(from).getTime(), from + SESSION_TTL_SECONDS * 1000);
});
