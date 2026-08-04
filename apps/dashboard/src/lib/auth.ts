import { cookies } from 'next/headers';
import { jwtVerify, type JWTPayload } from 'jose';

export type Session = JWTPayload & { userId: string; email: string; role: 'ADMIN' | 'OPERATOR' };

export function getJwtSecret(): Uint8Array {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32) throw new Error('JWT_SECRET must be configured with at least 32 characters');
  return new TextEncoder().encode(value);
}

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get('foundry_session')?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), { algorithms: ['HS256'] });
    if (typeof payload.userId !== 'string' || typeof payload.email !== 'string' || (payload.role !== 'ADMIN' && payload.role !== 'OPERATOR')) return null;
    return payload as Session;
  } catch { return null; }
}

export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  const expected = process.env.APP_URL;
  if (expected) return origin === new URL(expected).origin;
  return origin === new URL(request.url).origin;
}
