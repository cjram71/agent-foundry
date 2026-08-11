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
 *  - /login and /api/auth/* are always reachable so a stale, revoked
 *    database session cannot create a /login <-> / redirect loop,
 *  - unauthenticated page/API requests are redirected to /login (pages) or
 *    answered 401 (APIs, so first-party fetch receives JSON instead of HTML),
 *  - everything else with a valid JWT is allowed; authoritative session
 *    revocation remains enforced by getSession() in the Node layer.
 */
export function decideRequest(pathname: string, authenticated: boolean): GuardVerdict {
  if (isAuthPage(pathname) || isPublicApi(pathname)) return { action: 'allow' };
  const isApi = pathname.startsWith('/api/');
  if (!authenticated) {
    if (isApi) return { action: 'reject', status: 401 };
    return { action: 'redirect', location: '/login' };
  }
  return { action: 'allow' };
}
