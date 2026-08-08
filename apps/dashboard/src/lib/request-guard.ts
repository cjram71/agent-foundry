// Pure access-guard decision logic used by proxy.ts. Extracted as a pure
// function so the full decision matrix is unit-testable without a server.

export type GuardVerdict =
  | { action: 'allow' }
  | { action: 'redirect'; location: '/login' | '/' }
  | { action: 'reject'; status: 401 };

export function isAuthPage(pathname: string): boolean {
  return pathname.startsWith('/login');
}

export function isAuthApi(pathname: string): boolean {
  return pathname.startsWith('/api/auth');
}

export function isPublicApi(pathname: string): boolean {
  return isAuthApi(pathname) || pathname === '/api/health';
}

/**
 * Decision matrix enforced by proxy.ts for every matched request:
 *  - /api/auth/* is always reachable (login must be callable unauthenticated),
 *  - unauthenticated page/API requests are redirected to /login (pages) or
 *    answered 401 (APIs, so first-party fetch receives JSON instead of HTML),
 *  - authenticated users hitting /login are sent to /,
 *  - everything else is allowed.
 */
export function decideRequest(pathname: string, authenticated: boolean): GuardVerdict {
  if (isPublicApi(pathname)) return { action: 'allow' };
  const isApi = pathname.startsWith('/api/');
  if (!authenticated) {
    if (isAuthPage(pathname)) return { action: 'allow' };
    if (isApi) return { action: 'reject', status: 401 };
    return { action: 'redirect', location: '/login' };
  }
  if (isAuthPage(pathname)) return { action: 'redirect', location: '/' };
  return { action: 'allow' };
}
