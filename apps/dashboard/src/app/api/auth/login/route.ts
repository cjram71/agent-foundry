import { NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import { SignJWT } from 'jose';
import prisma from '@/lib/prisma';
import { getJwtSecret, isSameOrigin } from '@/lib/auth';
import { checkRateLimit, clearRateLimit } from '@/lib/rate-limit';

export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
    const body = await request.json();
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!email || email.length > 254 || !password || password.length > 256) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });

    const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    const key = `${forwarded || 'unknown'}:${email}`;
    const rate = checkRateLimit(key);
    if (!rate.allowed) return NextResponse.json({ error: 'Too many login attempts' }, { status: 429, headers: { 'Retry-After': String(rate.retryAfter) } });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    clearRateLimit(key);

    const token = await new SignJWT({ userId: user.id, email: user.email, role: user.role })
      .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('8h').sign(getJwtSecret());
    const response = NextResponse.json({ success: true });
    response.cookies.set('foundry_session', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 8 });
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return response;
  } catch (error) {
    console.error('Login error:', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
