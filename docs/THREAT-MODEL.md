# Threat Model & SECURITY_BLOCKED (P16)

P16 consolidates the hardening from P3–P15 into one document and wires the
last state machine driver: **SECURITY_BLOCKED**, reserved exclusively for
*deterministic* violations of the file-write boundary.

Trust anchor: the single host. Everything below assumes the host OS, its
package sources, and the operator are not compromised.

## Assets

| Asset | Where | Impact if compromised |
|---|---|---|
| GitHub credentials (`gh` auth / App key file) | host user, `GITHUB_PRIVATE_KEY_PATH` | push to authorized repos, open/close PRs |
| `GEMINI_API_KEY` (+ Ollama fallback) | `.env` | provider spend, model access |
| `JWT_SECRET` | `.env` | forge any web session |
| `POSTGRES_PASSWORD` / `DATABASE_URL` | `.env`, localhost | task ledger, sessions, approvals, events |
| `REDIS_PASSWORD` | `.env` | job queues, emergency-stop flag |
| Postgres logical backups | `backups/` (0600) | full DB content; `INCLUDE_ENV=1` adds `.env` |
| Workspace clones | `FOUNDRY_REPO_ROOT` | full source of every authorized repo |
| Agent catalog clone | `AGENT_CATALOG_PATH` | role/plan content if swapped under the clone |
| Host itself | docker + PM2 | terminal (out of scope once owned) |

## Actors

- **Operator/admin** — trusted. Runs commands, applies migrations, owns `.env`.
- **Authenticated non-admin users** — role-gated; viewer by default (P4/P6).
- **Unauthenticated callers** — login endpoint, origin/session checks only (P4).
- **Task authors** — policy restricts task creation to admins (P6); a hostile
  instruction therefore implies a compromised or careless admin session.
- **Repository content** — the primary untrusted input. Arbitrary repos are
  cloned and their file bytes flow into planner/coder prompts. Treat every
  byte as potentially crafted to steer the models (prompt injection).
- **Dependency ecosystem** — packages installed during validation execute
  code (P10 containers it).
- **Model outputs** — Gemini responses are untrusted *structured data*, never
  executed directly; a model can be manipulated by injected repo content.
- **Out-of-band GitHub actors** — anyone with write access to the target repo
  can merge, close, or push around Foundry's draft PRs.
- **Local docker users** — root-equivalent on the host by design (out of
  scope, documented in RUNNER-ISOLATION.md).

## Injection surfaces → deterministic mitigations

| Surface | Flows into | Mitigation (phase) |
|---|---|---|
| Task title / instruction | planner prompt, coder prompt, PR body | admin-only creation (P6); planner/coder have no tool use and emit JSON only (P3, P9) |
| Repo file contents → coder context | coder prompt | allowlisted extensions + blocked names in `repositoryContext`; per-file (50 KB) and total (400 KB) caps; `foundry/`, `devops/`, `tests/`, `*.test/__tests__` excluded from context (P3, P16) |
| Planner JSON → plan record | manager, approval UI | schema + size bounds; pinned catalog verified by sha (P6, P9) |
| **Coder JSON → `applyChanges`** | workspace files, then commit/PR | **P16 bounds below — violations quarantine** |
| Repair feedback (validation tails, review text, human notes) | repair prompts | byte-bounded in prompt builders (P11, P12) |
| Reviewer lenses output | parse verdicts | boolean-only parse; verdicts can only route REPAIRING/FAILED — never a shortcut, never SECURITY_BLOCKED (P12) |
| Catalog content | agent roles in plans | pinned commit verified on every planning job, fails closed (P9) |
| Dependency install scripts → container | executed code | scripts stripped; install window has network, every other stage runs `--network none`; non-root uid, resource caps, no host mounts, tmpfs `/tmp` with `noexec` (P10) |
| `gh` / git output parsing | PR adoption, status | strict URL shape validation, repo-anchored regex (P13) |
| Web requests | session/role gates | single JWT secret, role checks, same-origin mutation guard, CSRF surface documented (P4) |
| Queue payloads | workers | idempotency keys from task/attempt ids; attempts are first-class rows (P7) |

## SECURITY_BLOCKED — semantics

The final driver of the P5 state machine. **Terminal. Quarantine.**

Driven **only** by deterministic violations raised while applying coder
output (`SecurityViolationError` in `apps/runner/src/coder.ts`):

1. **Protected file targeted** — `.env`, `.env.*`, `.npmrc`, `.netrc`,
   `id_rsa`/`id_ed25519`, `*.pem`/`*.key`/`*.p12`, anything under `.git/`.
2. **Invalid path** — traversal (`..`), absolute, NUL/CR/CF control bytes.
3. **Disallowed file class** — extension outside the allowlist (only
   `Dockerfile`/`Procfile` are name-based exceptions). This includes
   `Makefile`/shell/binary payloads even though they aren't "secret".
4. **Workspace escape** — resolved target lands outside the real
   workspace root (defense in depth behind rule 2).
5. **Symlink overwrite** — refusing to write through a planted link.

Routing: the runner catch maps `SecurityViolationError` to
`terminalState=SECURITY_BLOCKED`, `failureStage=coder_output`,
`failureKind=security`; the task gets a `task_failed` event plus a
`task.terminated` audit row with `kind: 'security'`. All three legal edges
(RUNNING/VALIDATING/REPAIRING/REVIEWING → SECURITY_BLOCKED) exist in the
transition table; the transition runs inside the same guarded path as every
other termination.

**Why no model verdict ever drives this state.** Model judgments are
probabilistic: a false "malicious" verdict would hard-block honest work with
no recovery path, and a false "safe" verdict proves nothing. Reviewer lens
rejections therefore route REPAIRING → FAILED (stage `review`) — the normal
failure path. The security boundary is *reachability of protected resources*,
which is checkable byte-for-byte — intent is not. This is the same design
rule as the rest of the system: deterministic code owns permissions, states,
and gates; models do bounded work only.

**Quarantine & operator recovery.** SECURITY_BLOCKED is terminal by state
law: the executor retry path refuses it (not active), cancel is a no-op, no
UI resumes it. The violating output, the violation message, and the audit
trail remain in the task record for inspection; the workspace clone is left
on disk untouched for operator forensics. Recovery is manual and
deliberate: understand what the model attempted (hostile repo content? a
crafted instruction?), then delete the task and resubmit once the cause is
addressed. A beta "unquarantine" path was considered and rejected — a
quarantine that can be casually cleared is not a quarantine.

**Honest sloppiness is not a security event.** Malformed JSON, bad shapes,
exceeded size/count budgets, duplicate paths, and empty diffs throw plain
`Error` and take the ordinary FAILED/REPAIRING path (possibly costing one
repair cycle). Only reachability violations brand the task. If a *repair*
attempt later produces a violation — e.g. injected content convinces the
coder to touch `.env` — it quarantines deterministically at that moment.

## Residual risks (accepted, tracked)

- **Docker = host root.** Container hardening (P8/P10) limits payloads, but
  anyone/something controlling the daemon owns the host. Host SSH hygiene is
  operator scope.
- **Base image by tag, not digest.** `SANDBOX_IMAGE` pulls a mutable tag;
  supply-chain residual. Recommend digest pinning when stability matters.
- **Install window has outbound network.** Scripts are stripped but package
  code still runs in-container during install; host mounts and host env are
  never passed, so blast radius is the container. Accepted.
- **Prompt injection exists.** Mitigation is that injected bias surfaces only
  as *code output*, which the P16 deterministic gates and human/CI review of
  the draft PR bound. The reviewer lens is a probabilistic second pass, not a
  guarantee.
- **Reviewer/provider outage** routes tasks to FAILED/repair — never auto-pass.
- **gh credentials are write-capable** on authorized repos; lateral use is
  bounded by `allowedRepositories`, argv-only execution (no shell), and the
  `task/` branch prefix rule (P13).
- **Out-of-band merges/security review**: Foundry never merges PRs; branch
  protection on the target repos is operator-configured and out of band.
- **`INCLUDE_ENV=1` backups contain `.env`** — gated opt-in, documented.
- **Unset `TOKEN_COST_PER_MILLION_USD` makes the spend brake permissive** —
  surfaced on `/api/health` until configured (P14).
- **PR litter** from retries is possible; branch-adoption (P13) prevents
  duplicate opens, not duplicate branches.

## Phase → mitigation index

| Phase | Deterministic control |
|---|---|
| P3 | baseline schema; single JWT_SECRET model; DB rescued/verified |
| P4 | sessions, role gate, same-origin mutations, login throttle |
| P5 | 21-state machine; guarded atomic transitions are the only state law |
| P6 | task event ledger; policy engine (creation/approval rules); manager API |
| P7 | idempotent enqueue, first-class attempts, failure handlers, retries |
| P8 | non-root sandbox user, image auto-pull, workspace hygiene |
| P9 | pinned-catalog verification (fails closed), plan/agent schema bounds |
| P10 | in-container dependency install, network isolation, stage hard bounds |
| P11 | bounded repair loop (budget env, clamped), infra-vs-code terminal split |
| P12 | split review lenses; human request-changes loop, bounded note injection |
| P13 | PR/branch adoption idempotency; success path obeys state law (PR_CREATED → AWAITING_APPROVAL) |
| P14 | health surface, emergency stop (fail-closed), cancellation, wedge sweeper, cost brake |
| P15 | logical backups, restore drills, retention, integrity gates |
| P16 | threat model; SECURITY_BLOCKED wired to deterministic violations |
