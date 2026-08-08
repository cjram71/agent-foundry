import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import { verifyPassword, DUMMY_PASSWORD_HASH } from '../passwords.ts';

test('passwords: correct password verifies against a bcrypt hash', async () => {
  const hash = await bcrypt.hash('correct-horse-battery', 12);
  assert.equal(await verifyPassword('correct-horse-battery', hash), true);
});

test('passwords: wrong password is rejected', async () => {
  const hash = await bcrypt.hash('correct-horse-battery', 12);
  assert.equal(await verifyPassword('wrong-password', hash), false);
});

test('passwords: unknown account (null hash) is rejected through the dummy-hash path', async () => {
  assert.equal(await verifyPassword('anything-at-all', null), false);
  assert.equal(await verifyPassword('anything-at-all', undefined), false);
});

test('passwords: unknown account and wrong password produce the identical observable result', async () => {
  const hash = await bcrypt.hash('correct-horse-battery', 12);
  const wrongPassword = await verifyPassword('nope', hash);
  const unknownAccount = await verifyPassword('nope', null);
  assert.equal(wrongPassword, false);
  assert.equal(unknownAccount, false);
});

test('passwords: knowing the dummy plaintext grants nothing (guard is structural)', async () => {
  // The dummy hash exists only to burn equal bcrypt time; a match against it
  // must never authenticate.
  const dummyPlaintextMatches = await bcrypt.compare('foundry-timing-dummy', DUMMY_PASSWORD_HASH);
  assert.equal(dummyPlaintextMatches, true, 'fixture sanity: dummy hash is a valid bcrypt hash');
  assert.equal(await verifyPassword('foundry-timing-dummy', null), false);
});

test('passwords: real account hash always takes precedence over the dummy', async () => {
  const hash = await bcrypt.hash('s3cure-admin-pass', 12);
  assert.equal(await verifyPassword('s3cure-admin-pass', hash), true);
  assert.equal(await verifyPassword('foundry-timing-dummy', hash), false);
});
