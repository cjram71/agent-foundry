# Queue Reliability

Status: active since P7. Producer policy lives in
`apps/dashboard/src/lib/queue-policy.ts` (pure data/functions, unit-tested
without Redis) and `lib/queue.ts` (BullMQ wiring). Consumer guards live in
the two workers.

## Contract

| Queue | Job id | attempts | backoff | on complete | on fail |
|---|---|---|---|---|---|
| `foundry-tasks` (plan) | `plan-<taskId>` | 3 | exponential, 30 s base | removed immediately | kept (forensics) |
| `foundry-execution` (execute) | `execute-<taskId>` | 1 | — (no retries by design) | removed immediately | kept (forensics) |

Job ids are deterministic per task+action — never timestamped. BullMQ
deduplicates ids atomically server-side: two racing enqueues collapse to
one job. The producer wrapper (`enqueueWithDedupe`) adds the finished-job
case: a `completed`/`failed` job holding the id is removed and re-added
(legitimate retry after a human rollback), a live job is returned as-is
with `deduplicated: true` for the audit trail.

## Retry semantics — deliberately asymmetric

**Plan jobs retry (3 attempts).** Planner failures are usually transient
(provider rate limits, Ollama warmup, single malformed JSON). The
orchestrator defers the `FAILED` state transition and the `task_failed`
event until the **final** attempt, so intermediate attempts leave the task
in `PLANNING` and the retried job passes the entry guard and genuinely
re-plans. Each attempt records its own failed `AgentRun` row; audits carry
`attempt` and `willRetry`.

**Execute jobs do not blind-retry (1 attempt).** Execution has external
side effects — cloned workspaces, branches, pushes, draft PRs, real AI
spend. A silent re-run is the wrong default; recovery is the human-gated
flow (re-request/re-approve) and, later, the P11 repair loop. One failure =
one exhausted job = `FAILED` state (final on first failure), with full
attempt/agent-run/event/audit records.

## Duplicate-delivery tolerance (consumers)

Both workers check the formal task state at pickup, before any AI call:

| Pickup state | Behavior |
|---|---|
| plan: `PLANNING` / execute: `QUEUED` | proceed |
| anything else | **clean skip** (job completes; audit `queue.duplicate_plan_skipped` / `queue.duplicate_execution_skipped` with the observed state) |

Consequences: a redelivered job can never redo AI work or touch the task.
This closed a real hazard introduced at P5: a duplicate execution delivery
mid-run would previously have created a second attempt and pushed the
healthy task to `FAILED` from the catch path.

Permanent errors (unknown action, task missing, project deauthorised,
missing planner output pre-execution) throw BullMQ `UnrecoverableError` —
no pointless retries.

Concurrent pickup of the same logical work converges through P5
primitives: the second writer loses the conditional state transition or
the attempt `(taskId, attemptNumber)` unique race; its error becomes a
failed job whose single retry then hits the entry guard and skips cleanly.

## Dead-letter surface

A job with no retries left is *dead*. Both workers write exactly one
`queue.job_exhausted` audit event (job id, queue, attempts, truncated
error) from the `failed` handler when `attemptsMade >= attempts`. Failed
jobs remain in Redis for inspection (`removeOnFail: false`); bulk cleanup
is P14 maintenance scope. Task-level failure facts remain authoritative in
Postgres: `FAILED` state, `TaskAttempt`, `AgentRun`, `task_failed` event.

`UnrecoverableError` failures also exhaust immediately (no retries) and get
the same marker.

## Known gaps (explicitly later)

- ~~**Wedged `RUNNING` tasks**~~ — **closed in P14** (docs/OPERATIONS.md):
  the runner sweeps active execution states silent past
  `WEDGE_TIMEOUT_MINUTES` (default 45) into `INFRASTRUCTURE_FAILED`.
  Remaining sub-gap: QUEUED tasks whose job vanished externally (Redis
  flush) sit until an operator re-triggers an enqueue path.
- ~~**Cost-level idempotency**~~ — **closed in P14**: token accounting is
  per-attempt by design (observable via `AgentRun`), and the month-to-date
  project spending brake enforces at every spend trigger
  (docs/OPERATIONS.md).
- Stage events (`planning_started` etc.) are at-least-once; consumers
  dedupe on `(type, correlationId)` per docs/EVENTS.md.

## Tests

- Dashboard (6, in `queue-policy.test.ts`): add/reuse/replace decision for
  every known and unknown BullMQ state; deterministic ids without
  timestamps; plan vs execute option presets (attempts, backoff type,
  retention).
- Worker guards and retry semantics are tsc-verified and documented above;
  they need Redis to exercise end-to-end, which no test environment in
  this project has (CI included) — noted honestly in the P7 report.
