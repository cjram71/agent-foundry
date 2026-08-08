# Authentication, sessions, and account recovery (Phase P4)

## Model in one paragraph

The perimeter guard (`src/proxy.ts`, runs on every request) does the fast,
edge-safe check: is there a `foundry_session` cookie and does its JWT verify
(HS256, 8h lifetime)? The authoritative check is `getSession()`
(`src/lib/auth.ts`, node runtime) consulted by every route handler and
governing every protected API action: the JWT must verify **and** a live row
must exist in the `Session` table — not revoked, not expired, and owned by the
same user as the token. Logout and any administrative revocation flip one
database flag (`revokedAt`) and the session dies system-wide on the next
authoritative check.

```
request ──► proxy.ts (cookie present? JWT valid? routing decision)
              │ allow
              ▼
       route handler / server component
              └─► getSession(): JWT verify ──► Session row live? ──► role check (ADMIN for mutations)
```

Failure behavior is closed everywhere: missing secret, invalid token, missing
row, expired row, revoked row, or store outage all resolve to "no session".

## Cookie policy

| Attribute | Value | Why |
|---|---|---|
| Name | `foundry_session` | stable identifier |
| HttpOnly | true | no JS access — blunts XSS token theft |
| Secure | production only | plain-HTTP local development keeps working without weakening prod |
| SameSite | Lax | CS basis for same-origin JSON mutations, paired with `isSameOrigin` |
| Path | / | required for all app routes |
| Max-Age | 28,800 s (8 h) | matches JWT `exp`; no silent renewal |

Tokens/cookies never appear in URLs or logs. `session-store` caps stored
IP/user-agent lengths; audit metadata carries no credentials.

## Login flow (`src/lib/login-flow.ts`)

- Input shape validation (length bounds) → per `(x-forwarded-for, email)`
  rate limit (5 attempts / 15 min, `Retry-After`, audited
  `auth.login_rate_limited`) → single `bcrypt.compare` at cost 12 on **every**
  path (unknown accounts compare against a constant dummy hash, so messages
  and timing are uniform — no account enumeration) → success clears the
  limiter, writes a `Session` row, issues the JWT, audits `auth.login_success`.
- Failures audit `auth.login_failed` with reason `invalid_credentials` for
  both unknown-account and wrong-password cases.
- Route handler (`api/auth/login/route.ts`) is a thin HTTP/cookie wrapper so
  the entire flow is integration-testable against a real database.
- Trust boundary note: the limiter keys on `x-forwarded-for`; only deploy
  behind Tailscale or a proxy you control that sets/strips the header
  (documented deployment requirement), otherwise keys are spoofable.

## Roles

- `ADMIN` — full control (all mutations; API handlers enforce via session role).
- `OPERATOR` — authenticated viewing of dashboard pages only; every mutation
  API still requires ADMIN. Provisioning an operator is a deliberate SQL
  action (no self-service, no privilege-escalation path through the UI).

## Logout — `POST /api/auth/logout`

Idempotent: always clears the cookie and answers `{success:true}`. With a
valid session it revokes the row (`revokedAt`) and audits `auth.logout`.
Revocation is immediate; in-flight requests after revocation fail their next
authoritative check. `GET` is not supported (state-changing GETs stay off
this surface).

## Configuration requirements (enforced at boot)

`src/instrumentation.ts` calls `assertEnvValid()` per node process: startup
aborts listing the offending variable **names only** (never values).
Required: `JWT_SECRET` ≥ 32 chars (48 recommended; placeholders rejected),
`DATABASE_URL` (postgres, no placeholders), production `REDIS_PASSWORD`.
`APP_URL` malformed = error; unset = warning (same-origin falls back to the
request origin). `ADMIN_JWT_SECRET` was removed in P3 — never consumed by
code; one signing secret keeps rotation simple.

## Account bootstrap and recovery

Run as the service user on the server (never over the network):

```bash
set -a; . ./.env; set +a
node packages/database/create-admin.js          # create the first ADMIN
node packages/database/create-admin.js reset    # lost-password recovery
```

- Password entry is hidden; minimum length 12; only the email is echoed.
- Recovery (`reset`) requires shell access to the server and the database
  credentials — it is deliberately not a web flow, so account recovery cannot
  be attacked remotely. Both paths re-hash with bcrypt cost 12.
- Locking out a hijacked account's sessions without deleting evidence:
  `UPDATE "Session" SET "revokedAt" = now() WHERE "userId" = '<id>' AND "
  revokedAt" IS NULL;` — then reset the password.
- Changing a role (e.g., promoting an operator) is a SQL action by the owner:
  `UPDATE "User" SET "role"='ADMIN' WHERE email='…';` — audited "User" table
  state, never exposed as an API.

## Known limitations (accepted for beta; tracked)

1. The rate limiter is in-memory: counters reset on dashboard restart and are
   per-process (fine for the single-process PM2 dashboard; revisit if scaled).
2. The perimeter guard cannot see revocations; static-asset matcher output is
   the JWT's word for up to its 8h life. All mutations and all data APIs go
   through the authoritative check, so this is safe by construction today;
   revisit if any sensitive page stops being force-dynamic.
3. Sessions have fixed expiry, no sliding renewal, and no per-device listing
   UI yet (table structure supports it; dashboard iteration planned).
4. `x-forwarded-for` trust depends on the trusted-proxy deployment (above).

## Test matrix (spec §8 → implementation)

| # | Required test | Where | Status |
|---|---|---|---|
| 1 | valid admin logs in | `auth.integration.test.ts §8.1` (real PG) | CI-gated, runs with `TEST_DATABASE_URL` |
| 2 | wrong password rejected | unit `passwords` + integration `§8.2` | ✅ unit green locally / CI-gated |
| 3 | unknown account rejected w/o enumeration | unit `passwords` (uniform result + dummy-guard) + integration `§8.3` | ✅ unit green / CI-gated |
| 4 | unauthenticated page access blocked | unit `request-guard` matrix | ✅ green locally |
| 5 | unauthenticated API blocked | unit `request-guard` (401 JSON for `/api/*`) | ✅ green locally |
| 6 | expired session rejected | unit `auth-session` (expired JWT) + integration `§8.6` | ✅ unit green / CI-gated |
| 7 | logout invalidates | integration `§8.7` (revoke + idempotency) | CI-gated |
| 8 | repeated failures rate-limited | unit `rate-limit` (5) + integration `§8.8` | ✅ unit green / CI-gated |
| 9 | cookie security attributes | unit `auth-session` cookie policy | ✅ green locally |
| 10 | errors leak no sensitive info | unit `env` (throw excludes values) + integration `§8.10` | ✅ unit green / CI-gated |

"CI-gated" = wired by `docs/ci-migrate-scratch.job.yml` once the owner applies
it (the P3/P4 automation token cannot push workflow changes). Unit suites run
with every `npm test` (33 assertions currently) and stay hermetic.

## Deployment note

P4 adds migration `20260808120000_user_sessions` (additive `Session` table +
indexes + CASCADE FK). After the P3 rescue procedure, a plain
`npx prisma migrate deploy --schema packages/database/prisma/schema.prisma`
applies it. Existing logged-in users simply log in again — there are no
production sessions to preserve during beta.
