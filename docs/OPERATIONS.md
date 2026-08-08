# Operations: Health, Emergency Stop, Cancellation, Sweeper, Cost (P14)

Operator-facing controls landed in P14. All deterministic: machine state
everywhere, derived knobs nowhere near model judgment.

## Health — `GET /api/health`

Unauthenticated ops surface (PM2/uptime monitors):

```json
{ "ok": true, "checks": { "db": true, "redis": true },
  "queues": { "plan": { "waiting": 0, "active": 1 }, "execution": { } },
  "emergencyStop": false, "costRateConfigured": false,
  "now": "2026-08-08T…Z" }
```

- `ok` = db (`SELECT 1`) + redis (`PING`) — HTTP 200 else 503.
- Queue counters (waiting/active/delayed/failed) are advisory.
- Nothing sensitive is exposed: no config values, no tokens, no task content.

## Emergency stop — `/api/system`, Tasks page toggle

**What it is:** a distributed pause. Engaging sets the Redis key
`foundry:emergency-stop`; both workers (orchestrator + runner) pause job
fetching within ~15 s (supervisor loop) and any job fetched in the window is
re-parked into the delayed set for 30 s instead of executing
(`deferJobWhileStopped`, which **fails closed**: an unverifiable flag is
treated as engaged).

**What it is not:** not a task state change, not a kill. In-flight jobs always
run to completion. For a hard stop, cancel the task (below). Audited as
`system.emergency_stop` / `system.emergency_resume`, admin+origin guarded,
survives restarts (Redis key), visible on `/api/health`.

## Task cancellation — `cancel_task`

- **Machine-lawful:** `isValidTransition(state, CANCELLED)` is the only
  guard — terminal states and APPROVED have no edge and refuse.
- **Atomic core:** transition to CANCELLED, pending approval rows flip to
  decision `cancelled`, `task_cancelled` event (the P6-reserved driver,
  now active), audit `task.cancelled`.
- **Best-effort aftermath (deliberately outside the atomic change):**
  queued BullMQ jobs with the deterministic ids (`plan-<id>`,
  `execute-<id>`) are removed, and live sandbox containers
  (`foundry-sandbox-<taskSlug>-*`) are `docker rm -f`'d. Races are safe by
  construction: a worker that starts anyway finds CANCELLED and self-skips;
  a container that misses the kill completes into transitions the machine
  now rejects. Naming coupling documented in `lib/cancel-sandbox.ts`.

## Wedge sweeper (runner)

BullMQ cannot recover an `attempts: 1` execution job whose process died
mid-flight (stalled → failed, no state transition — the P7 gap). The runner
sweeps every 10 min: tasks in `RUNNING|VALIDATING|REPAIRING|REVIEWING` with
`updatedAt` older than **`WEDGE_TIMEOUT_MINUTES`** (default 45, clamped
5–360) are recovered to `INFRASTRUCTURE_FAILED` with `task_failed`
(`stage: "sweep"`), the running attempt closed, and audit
`task.wedge_recovered`.

- **Why 45 min is safe:** every stage has a hard timeout — model calls
  (≤ 15 min Ollama worst-case), validation stages (≤ 240 s), sandbox runs
  (≤ 180 s) — so the maximum legitimate no-transition window is ~20 min;
  45 min of silence means the worker is dead, not slow.
- **Race-safe:** `transitionTask`'s conditional UPDATE; a live worker that
  progressed after the query wins, the sweep logs a skip.
- **Never swept:** QUEUED/PLANNING — those jobs are durable BullMQ
  deliveries a restarted worker legitimately resumes.
- **Known gap (documented):** QUEUED-tasks whose job vanished (admin Redis
  flush, deferral hard-failure) sit forever; reconciliation UI is future
  work — re-trigger via request-plan→approve or a change-request resubmit.

## Cost accounting & the spending brake

- **`@foundry/cost`:** `estimateUsd(tokens, rate)`, UTC month window,
  `evaluateSpendGuard` (brake at the ceiling), `parseRatePerMillion`
  (unset/invalid → 0).
- **Accounting:** priced tokens = `AgentRun.tokenUsage` where
  `provider = 'google'` (local Ollama = $0). `Task.estimatedCost` is
  persisted at terminal points (plan generated/failed, execution
  succeeded/failed) and powers the tasks-table cost column.
- **The brake:** at every spend *trigger* — request plan, approve plan (incl.
  manager evaluation), resubmit changes, project authorize (manager
  evaluation) — month-to-date spend ≥ `Project.spendingLimit` blocks with
  409 + audit `cost.spend_blocked`. It is a brake, not a forecast.
- **Config teeth:** `TOKEN_COST_PER_MILLION_USD` carries your contract
  rate. Unset/0 = accounting at $0, brake permissive, and `/api/health`
  reports `costRateConfigured: false` ([MISSING ACCESS]: your negotiated
  provider price — no price is hardcoded). `spendingLimit: 0` disables the
  brake; adjustable anytime via `update_spending_limit`
  (audit `project.spending_limit_updated`).
