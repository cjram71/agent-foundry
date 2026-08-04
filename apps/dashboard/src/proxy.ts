import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

export async function proxy(request: NextRequest) {
  const token = request.cookies.get('foundry_session')?.value;
  const isAuthPage = request.nextUrl.pathname.startsWith('/login');
  const isApiAuth = request.nextUrl.pathname.startsWith('/api/auth');

  if (isApiAuth) return NextResponse.next();

  if (!token) {
    if (!isAuthPage) return NextResponse.redirect(new URL('/login', request.url));
    return NextResponse.next();
  }

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    await jwtVerify(token, secret);
    if (isAuthPage) return NextResponse.redirect(new URL('/', request.url));
    return NextResponse.next();
  } catch {
    // Removed unused 'error' variable to satisfy strict ESLint rules
    if (!isAuthPage) return NextResponse.redirect(new URL('/login', request.url));
    return NextResponse.next();
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
