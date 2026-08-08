// Same-origin policy for state-changing requests. Request bodies on our
// mutations are JSON sent by first-party fetch; combined with SameSite=Lax
// cookies this rejects cross-site form/fetch attempts. Requests without an
// Origin header (same-origin navigations, curl, same-tab fetch) are allowed.

export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  const expected = process.env.APP_URL;
  if (expected) return origin === new URL(expected).origin;
  return origin === new URL(request.url).origin;
}
