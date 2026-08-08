# Beta Scenarios A–E & Sign-off (P17)

The merge gate for PR #1: **all five scenarios pass on the production-shaped
VPS before this program may merge to `main`.** Each scenario lists setup,
procedure, and the evidence that proves it. The last table marks what is
already proven by unit/integration/CI tests (`PROVEN`) vs what only the
operator can prove on the VPS (`OPERATOR-RUN`) — the sandbox has no
Postgres, Redis, Docker, Ollama/Gemini, or live GitHub repo, so live
end-to-end execution is deliberately out of scope for automation.

Prereqs for all scenarios — on the VPS:
1. `bash scripts/vps-inspection.sh` reviewed.
2. `docs/MIGRATION-RESCUE.md` Procedure B applied; `npx prisma migrate deploy`
   completes cleanly.
3. `.env` fully configured: `JWT_SECRET` (48+ bytes), DB/Redis passwords,
   `GITHUB_*` App/CLI, `GEMINI_API_KEY`, `AGENT_CATALOG_COMMIT` pinned
   (`docs/ROLE-CATALOG.md`), `TOKEN_COST_PER_MILLION_USD` set (the brake is
   inert while unset — `/api/health` reports it).
4. Services up: `pm2 start` for dashboard/orchestrator/runner; `/api/health`
   returns 200.

---

## Scenario A — happy path, small task end-to-end (OPERATOR-RUN)

**Setup:** create a project (risk ceiling `low`), point it at a test repo,
`request_plan` on "add a README badge and one-line docs note".

**Procedure:** approve plan → approve execution start if prompted → let the
runner work → receive draft PR → `check_status`/`approve final` → merge the
PR on GitHub → call `check_status` again.

**Expected evidence:**
- TaskEvent sequence in order: `task_created, task_queued, planning_started,
  plan_generated, plan_approval_requested, plan_approved, execution_started,
  code_generated, validation_started, validation_passed, review_started,
  review_passed, draft_pr_opened, final_approval_requested, final_approved,
  task_completed` (+ `task_state_changed` rows per transition).
- `PREVIEW_*` states are skipped deliberately (no preview infra); the
  transition log shows `PR_CREATED → AWAITING_APPROVAL` — legal per the
  state table (`docs/GITHUB-IDEMPOTENCY.md`).
- Draft PR on GitHub whose body matches the runner template; branch name in
  the `task/` prefix family; no forced-pushed history.
- One `TaskAttempt` row with commit SHA, validator output summary, zero
  retries; `Task.estimatedCost` > 0 after completion; project month-to-date
  spend reflects it (`lib/cost.ts`).
- No `task.rejected`/`queue.job_exhausted` audits for this correlation id.

**Automation status:** every step's *logic* is unit/CI-proven (state
machine guards 20 tests, transition drivers in runner suite, github client
idempotency tests); the *live wiring* (BullMQ→workers→Gemini→GitHub) is
operator-run only.

## Scenario B — denials: auth, policy, state (PARTLY PROVEN)

**Procedure & expected:**
1. Unauthenticated `POST /api/tasks` → 401, no side effects.
2. Logged-in non-admin creates a task → 403 (admin-only creation is the
   policy). UI hides the control; API returns `{error}` JSON unchanged.
3. Task creation exceeding the project's risk ceiling → deterministic
   REFUSE (policy engine); task never enters the queue; no `task_queued`.
4. `approve_plan` by non-admin → 403; by admin → state-guarded (only from
   the review state); double-approve is refused by the state guard, never a double enqueue.
5. Out-of-order state actions (approve a plan twice, cancel an APPROVED
   task, resume a SECURITY_BLOCKED task) → refused; no state change; audit
   `rejected` rows where applicable.

**Automation status:** PROVEN for the API-level guards (dashboard suite:
authz/origin/role tests; policy suite 13 tests; state-machine 20 tests —
including the no-illegal-edge property). OPERATOR-RUN only to confirm the
rendered UX matches in a browser.

## Scenario C — failure/repair paths (PARTLY PROVEN)

**Procedure:** submit a task that the coder will implement with a type error
(e.g. instruction demands usage of a nonexistent symbol). Watch the events
timeline with `MAX_REPAIR_ATTEMPTS=2`, then re-run with `=0`.

**Expected:**
- `validation_failed` → `REPAIRING` → bounded repair (repairAttempt 1..2
  audits with 4 KB-capped feedback) → either recovered (later
  `validation_passed`) or terminal `CODE_FAILED` + `task_failed`.
- Reviewer-rejection route likewise cycles REVIEWING → REPAIRING ≤ budget;
  exhausted → `FAILED` with stage `review` (never `CODE_FAILED` — the table
  has no REVIEWING→CODE_FAILED edge by design).
- `MAX_REPAIR_ATTEMPTS=0`: first failure is terminal immediately.
- Sandbox machinery faults (bad image name → set `SANDBOX_IMAGE` to a bogus
  tag for one run) classify as `INFRASTRUCTURE_FAILED`, not `CODE_FAILED`.
- CHANGES_REQUESTED loop: request changes with a note →
  `resubmit_changes` → next cycle's coder prompt contains the bounded note
  (`lib/change-request.ts`); note never re-plans.

**Automation status:** PROVEN — repair.ts pure unit tests (parse/classify/
prompt-cap), validation stage tests, reviewer parse tests, P11/P12 driver
logic in runner/orchestrator suites; the docker-gated sandbox tests run in
CI. OPERATOR-RUN for the live Gemini round-trips.

## Scenario D — operations in anger (OPERATOR-RUN)

1. **Emergency stop:** POST `/api/system {action:'emergency_stop'}` →
   `/api/health` shows `emergencyStop:true`; enqueue a task → no worker
   picks it up (deferJobWhileStopped parks it 30 s); resume → job proceeds;
   audit rows `system.emergency_stop`/`system.emergency_resume`. Kill Redis
   during stop → behavior fails closed (nothing new executes).
2. **Cancel running task:** UI/API `cancel_task` mid-execution → `CANCELLED`
   + `task_cancelled` event; pending approvals flipped to `cancelled`;
   plan/execution jobs removed; `foundry-sandbox-*` containers for the slug
   `docker rm -f`'d; a late worker finishing the job self-skips without
   resurrecting the task.
3. **Wedge sweeper:** start execution, `kill -9` the runner process → task
   stuck in RUNNING. After `WEDGE_TIMEOUT_MINUTES` the sweeper moves it to
   `INFRASTRUCTURE_FAILED` (sweep-attributed `task_failed`, attempt closed,
   audited); restart runner → no duplicate execution attempt.
4. **Cost brake:** set the project `spendingLimit` below current month spend
   → `request_plan`/`approve_plan`/`resubmit_changes` refused with
   `cost.spend_blocked` audit; raising the limit re-opens.

## Scenario E — disaster recovery (OPERATOR-RUN)

1. `bash scripts/backup.sh` → dump + `SHA256SUMS` in the backup dir;
   `pg_restore --list` gate passed at creation; log redacts passwords.
2. `bash scripts/restore.sh --verify` → scratch DB restores cleanly
   (destructive-type confirm required for real DBs).
3. Negative drills: corrupt one byte of a dump → `--verify` refuses;
   wrong confirmation phrase → aborts; `INCLUDE_ENV=1` only when opted in.
4. Reinstall drill (optional but recommended): fresh VM, `REINSTALL.md`
   checklist, restore latest backup, `/api/health` 200, one task from
   Scenario A re-run end-to-end.

## Sign-off checklist for PR #1 merge

- [ ] A: happy-path evidence pack attached (event log export, PR link)
- [ ] B: denials spot-checked in UI + API
- [ ] C: at least one live repair cycle AND one live terminal failure seen
- [ ] D: all four ops drills passed with audit rows captured
- [ ] E: backup + restore --verify passed on the VPS
- [ ] `bash scripts/vps-inspection.sh` output reviewed
- [ ] All rows below read PROVEN or OPERATOR-PASSED

## Verification matrix (as of P17 head)

| Area | Unit/integration | CI (`0b2e8f3` run 31258294151) | Live VPS |
|---|---|---|---|
| State machine & transitions (P5) | PROVEN (20) | ✅ | Pending |
| Auth/sessions/CSRF-origin (P4) | PROVEN (38) | ✅ | Pending |
| Policy engine (P6s2) | PROVEN (13) | ✅ | Pending |
| Manager plan parse (P6s3) | PROVEN (10) | ✅ | Pending |
| TaskEvent ledger (P6s1) | PROVEN | ✅ | Pending |
| Queue enqueue/failure handlers (P7) | PROVEN (6) | ✅ | Pending |
| Sandbox isolation (P8) | PROVEN; docker-gated pair | ✅ runs unskipped w/ daemon | Pending |
| Catalog pin enforcement (P9) | PROVEN (16) | ✅ | Pending |
| Validation 2-stage rule (P10) | PROVEN (9 + docker-gated) | ✅ | Pending |
| Repair loop drivers (P11) | PROVEN (6+3) | ✅ | Pending |
| Split reviews / change loop (P12) | PROVEN (3+3) | ✅ | Pending |
| GitHub idempotency (P13) | PROVEN (6) | ✅ | **critical live check (P13 bug class)** |
| Ops: stop/cancel/sweeper/cost (P14) | PROVEN (4+6) | ✅ | Pending |
| Backups/restore (P15) | bash -n clean; logic reviewed | ✅ build-only | **restore drill pending** |
| Threat model / SECURITY_BLOCKED (P16) | PROVEN (9) | ✅ | Pending |

"PROVEN (n)" = n unit/integration tests, plus CI typecheck with the real
Prisma client. Live-column items marked **critical** are the ones the beta
must not skip.

## Known residues carried into beta

- Docker daemon access is host-root-equivalent (accepted; RUNNER-ISOLATION).
- Sandbox base image pinned by tag, not digest.
- Install stage has outbound network; everything else is `--network none`.
- PREVIEW states unused until preview infra exists.
- `TOKEN_COST_PER_MILLION_USD` unset ⇒ brake permissive (health-reported).
- INCLUDE_ENV backups contain `.env` (opt-in, documented).
- CI workflow hardening (matrix migrations etc.) lives in
  `docs/ci-migrate-scratch.job.yml` pending owner `workflows`-scope apply.
