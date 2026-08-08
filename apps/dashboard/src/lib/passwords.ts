// Password verification helpers. The login path must take a uniform amount of
// time for "unknown account" and "wrong password" so responses cannot be used
// to enumerate accounts by timing. Comparing against a precomputed dummy hash
// keeps both branches on the same bcrypt code path with the same cost factor.

import bcrypt from 'bcrypt';

// A valid $2b$ bcrypt (cost 12) hash of the string "foundry-timing-dummy".
// Not a credential: it exists only so unknown-account logins perform an
// equally expensive, always-failing comparison.
export const DUMMY_PASSWORD_HASH = '$2b$12$Iz1Tm7DDifPCM5a9YZvRNeovh7TwAMxTKVViQLoV04Dw1CrqNPSBu';

export async function verifyPassword(plain: string, storedHash: string | null | undefined): Promise<boolean> {
  const hash = typeof storedHash === 'string' && storedHash.length > 0 ? storedHash : DUMMY_PASSWORD_HASH;
  const matches = await bcrypt.compare(plain, hash);
  return matches && hash !== DUMMY_PASSWORD_HASH;
}
