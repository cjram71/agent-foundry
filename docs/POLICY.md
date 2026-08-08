# Project Policy Engine

Status: active since P6 slice 2. Deterministic decision code:
`packages/policy` (`@foundry/policy`). Storage: versioned `ProjectPolicy`
table (migration `20260808170000_project_policies`). Dashboard loader:
`apps/dashboard/src/lib/policy.ts`.

Policy and risk decisions are made by code, never by AI. AI work products
are *subject to* the policy; they cannot influence it (the classifier reads
task text as data and emits only rule ids — never source text — to logs).

## Risk taxonomy

| Level | Meaning | Admission |
|---|---|---|
| `low` | routine, reversible | admitted by every ceiling |
| `medium` | normal feature work (default) | admitted by `medium`/`high` ceilings |
| `high` | touches production, auth, payments, infra, data migration, external comms, or admin-declared high | admitted only by `high` ceiling (the default) |
| `prohibited` | matches prohibited-work rules | **never scheduled — no policy can allow it** |

Effective risk = `max(admin-declared, detected)`; `prohibited` overrides
everything. Rules only escalate; an administrator's declaration is the
floor and is never diluted by text analysis.

### Prohibited rules (block creation/advancement outright)

`prohibited.credential-theft`, `prohibited.auto-merge-bypass`,
`prohibited.destructive-data`, `prohibited.mass-messaging`,
`prohibited.cryptomining`, `prohibited.malware`,
`prohibited.auth-weakening`, `prohibited.branch-protection`.

Patterns are deliberately tight and operational (imperative + target), not
topical keywords: "build a spam filter" must not fire the mass-messaging
rule. FP-prone rules carry a **negation guard** — a match immediately
preceded by "never / do not / must not / cannot / without ever" is ignored.
This is a deterministic heuristic, not NLP: residual false positives block
visibly with rule ids and are fixed by rewording the task.

### High-risk rules (escalate; permitted by default policy)

`high.production-change`, `high.auth-security-surface`,
`high.payments-billing`, `high.infrastructure`, `high.data-migration`,
`high.external-comms`, `high.dependency-floor`.

## ProjectPolicy versioning

- Every policy change creates a NEW version row (`@@unique(projectId, version)`);
  exactly one `active` row per project (enforced transactionally in the
  bump write — deactivate current, activate new, same tx). A partial unique
  index was rejected deliberately: Prisma cannot express it and it would be
  permanent `migrate diff` drift.
- `version 1` is created (a) by the migration backfill for every
  pre-existing project (`createdBy = 'system-migration'`), and (b)
  atomically inside `POST /api/projects` for every new project.
- Defaults reproduce pre-P6 behavior exactly: `maxTaskRisk='high'`,
  `requirePlanApproval=true`, `requireMergeApproval=true`.
- Change the ceiling via `PATCH /api/projects` `{id, action:'update_policy', maxTaskRisk}`
  (admin + origin checked; audits `project.policy_updated` with the new
  version). No-op when the requested ceiling is already active.
  Concurrent bumps lose on the unique `(projectId, version)` index — retry.
- `requirePlanApproval`/`requireMergeApproval` are schema-ready and
  code-mandatory today; `false` is reserved for a future explicitly-approved
  autonomous mode, not yet available via any endpoint.

## Enforcement points

| Gate | Behavior on block | Notes |
|---|---|---|
| `POST /api/tasks` (creation) | `422` + reasons; task is NOT created; audit `policy.task_blocked` | full classifier (human-authored text) |
| plan approval (`PATCH /api/tasks/[id]`) | `409` + reasons; approval tx not opened; audit `policy.task_blocked` | re-classifies (policy may have tightened since creation); system-authored manager evaluations are exempt from text screening (ceiling still enforced on declared risk) |

Rejection paths are never policy-gated. `loadActivePolicy` **fails closed**:
an unreadable policy fails the request rather than silently applying a
weaker ceiling. Projects without policy rows (only possible outside
backfill/creation hooks) fall back to `DEFAULT_POLICY`.

## Compatibility

With default v1 policies every pre-P6 task that was creatable/advanceable
remains so; existing authorized projects got v1 rows from the migration, so
no operator action is required on deploy beyond `prisma migrate deploy`.

## Roadmap hooks

- Cost/spending limits (`Project.spendingLimit`, `Task.estimatedCost`) —
  not enforced yet; scheduled with P14 cost control.
- Security-block ingestion (`SECURITY_BLOCKED` state) — P10 validation
  engine will feed policy violations discovered during builds.
- Project-level allowed-agents/paths allowlists — reserved shape; lands
  with the Manager (P6 slice 3) or P9 role catalog as needed.

## Tests

- Unit (13 in `packages/policy`): taxonomy ordering; catalog shape (ids
  only, no text echo); floor/escalation semantics; every prohibited rule
  fires and overrides; negation-guard probes incl. the real manager
  evaluation instruction; topical-defense false-positive guard; default
  policy admits pre-P6 flows; prohibited never admitted; ceiling reasons;
  declared-risk coercion of the legacy TEXT column.
- PGlite (7 checks): 5-migration chain; parity block (columns, defaults,
  unique+lookup indexes, 8 CASCADE FKs); backfill correctness and
  attribution; single-active version bump with history preserved; unique
  violation; cascade; P5/P6-s1 regressions.
