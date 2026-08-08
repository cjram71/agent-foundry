// Next.js instrumentation hook: validated once per server process at startup.
// The dashboard refuses to boot with missing/weak configuration rather than
// failing later at first request. Validation output never prints values.

export function register(): void {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Dynamic import keeps this module edge/browser-safe at bundle time.
    void import('@/lib/env').then(({ assertEnvValid }) => assertEnvValid());
  }
}
