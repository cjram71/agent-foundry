# Task Events

Status: active since P6 slice 1. Catalog and emitter live in
`packages/state-machine` (`src/events.ts`); storage is the append-only
`TaskEvent` table (migration `20260808160000_task_events`).

The task workflow keeps three kinds of records, each with one job:

| Record | Job | Authority |
|---|---|---|
| `Task.state` | where the task is now | authoritative current position (state machine) |
| `TaskStateTransition` | how it moved | authoritative, immutable move log |
| `TaskEvent` | what happened, for consumers | domain projection: activity feeds, metrics, future notifications/UI |
| `AuditEvent` | who did what, security/ops trail | unchanged by this system |

No consumer may drive decisions off `TaskEvent` alone — the state machine
remains the gatekeeper; events are the read-side projection.

## Catalog (24 types)

| Type | Emitted when | Emitter (today) |
|---|---|---|
| `task_created` | task row created | `POST /api/tasks`; project authorization (manager evaluation) |
| `task_queued` | execution job accepted by the queue | plan-approval enqueue path |
| `planning_started` | planning worker picked the job up | orchestrator |
| `plan_generated` | plan produced and validated | orchestrator (tx with the plan) |
| `plan_approval_requested` | plan gate opened | orchestrator (same tx) |
| `plan_approved` / `plan_rejected` | human decided the plan gate | dashboard plan approve/reject |
| `execution_started` | an execution attempt began (attempt row created) | runner (tx with attempt) |
| `code_generated` | coder changes applied to the workspace | runner (best-effort) |
| `validation_started` / `validation_passed` / `validation_failed` | sandbox validation lifecycle | runner (best-effort; failure emitted at the failing command) |
| `review_started` / `review_passed` / `review_failed` | safety-review lifecycle | runner (best-effort) |
| `draft_pr_opened` | draft PR exists | runner (tx with PR URL) |
| `preview_ready` | deployment preview ready | **reserved — P13** |
| `final_approval_requested` | merge gate opened | runner (same tx as the PR) |
| `final_approved` / `final_rejected` | human decided the merge gate | dashboard final approve/reject |
| `task_completed` | task finished (PR merged by human, or evaluation completed) | merge checker, evaluation approval |
| `task_failed` | planning/execution failed | orchestrator + runner (tx with failure records) |
| `task_cancelled` | task cancelled | **reserved — P14 emergency stop** |
| `task_state_changed` | every accepted state-machine transition | automatic inside `transitionTask()` (same write) |

Rows carry `actor`, `actorType` (`human|worker|system`), optional
`attemptId` / `correlationId` (queue job id), an optional JSONB `payload`,
and a server timestamp. Indexes: `taskId`, `type`, `correlationId`,
`createdAt`. FK semantics mirror the transition log: task delete cascades,
attempt delete sets `attemptId` NULL (history survives).

## Emission rules

1. **Atomic** — `emitTaskEvent(db, …)` throws on failure; use it inside the
   interactive transaction whose write the event describes. An event cannot
   exist without its fact, nor a fact without its event.
2. **Best-effort** — `tryEmitTaskEvent(db, …)` never throws; used for
   standalone mid-procedure stage events in the runner (code/validation/
   review lifecycle), where losing a log line must not fail the work.
3. **Automatic** — every accepted `transitionTask()` move also writes a
   `task_state_changed` event (payload `{from, to, reason}`) in the same
   conditional write. No state change without an event.
4. Emissions attach only to points that already performed a write (an audit
   row, a transition, an approval). No new decision points were introduced.

## Duplicates and retries

Queue redelivery can re-emit stage events (e.g. a retried job logs
`planning_started` twice). Consumers must treat the log as at-least-once and
deduplicate on `(type, correlationId)` or `(type, attemptId)`. Full queue
idempotency is P7 scope.

## Tests

- Unit (20 total in the state-machine suite): exact 24-type catalog and
  order, snake_case names, emitter field mapping and defaults, throwing vs
  best-effort variants, auto-emission on every accepted transition, no
  event on rejection.
- PGlite (7 checks): full four-migration chain; all 24 labels valid at the
  enum level; invented types rejected by the database; payload round-trip;
  cascade + SET NULL FK semantics; P3/P5 regressions intact.
