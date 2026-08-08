// Edge-safe secret accessors. This module must stay free of node-only
// imports (it is used by proxy/middleware) and must never log values.

let cached: Uint8Array | null = null;

export function getJwtSecret(): Uint8Array {
  const value = process.env.JWT_SECRET;
  if (typeof value !== 'string' || value.length < 32) {
    throw new Error('JWT_SECRET must be configured with at least 32 characters');
  }
  if (!cached) cached = new TextEncoder().encode(value);
  return cached;
}
