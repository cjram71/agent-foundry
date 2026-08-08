# Failure & Repair (P11)

How a failing validation or review becomes a bounded repair loop instead of an
immediate dead task. Owner: `apps/runner/src/index.ts` (loop), pure pieces in
`apps/runner/src/repair.ts`, routing signals in `sandbox.ts`/`validation.ts`.

## The loop

```
RUNNING → VALIDATING → (fail, budget left) → REPAIRING → VALIDATING → …
                    ↘ (fail, budget exhausted) → CODE_FAILED
VALIDATING → REVIEWING → (rejected, budget left) → REPAIRING → VALIDATING → …
                      ↘ (rejected, budget exhausted) → FAILED (stage "review")
any stage → sandbox machinery fault → INFRASTRUCTURE_FAILED
```

- **Budget:** `MAX_REPAIR_ATTEMPTS` env (default **2**, clamped 0–3 by
  `parseRepairBudget`; `0` disables repair — every first failure is terminal).
  The budget is a termination and cost control enforced by the worker,
  deterministically — never by the model, and never open-ended.
- **REPAIRING is real:** every repair entry/exit is a state-machine transition
  (auto-`task_state_changed`), with `metadata { stage, repairCycle,
  repairBudget }`, plus a `task.repair_attempted` audit row per cycle.
- **Feedback-bounded re-coding:** the repair prompt is the cycle-0 prompt
  (identical constraints verbatim) plus stage, cycle `N/M`, previous summary,
  and the last 4 KB of failure output (`buildRepairPrompt`). The coder's
  reply passes the same `validateCoderResult` bounds (1–20 files, 500 KB,
  protected-path rules); changes apply additively — the final commit uses the
  **union** of all changed paths across cycles (a cycle-1 file untouched in
  cycle 2 still ships).

## What is repairable and what is not

The routing signal is deterministic, not a regex over error text:

- **Payload failure** (test failed, lint error, reviewer rejection): the code
  is wrong → repairable, within budget. Sandbox results mark these
  `infraFailure: false`.
- **Infrastructure failure** (image pull failed, daemon gone, spawn error):
  no code change can fix that → **never repaired**. `SandboxController`
  classifies machine-layer exceptions (and only those) as
  `infraFailure: true`, threaded through the pipeline's stage result to the
  catch path, which routes to `INFRASTRUCTURE_FAILED`. Admission rejections
  (path gate, command allowlist) are policy outcomes and are explicitly never
  infra — the distinction is regression-tested.
- **Review-stage infra blur:** the reviewer's own sandbox run reports failure
  as text, so a mid-review docker outage first looks like a review rejection
  and enters repair. The next repair cycle re-runs *validation first* — if
  docker is truly down, that stage classifies `infraFailure` and the task
  lands in `INFRASTRUCTURE_FAILED`; if docker recovered, the repair simply
  proceeds. Converging behavior, no special-casing needed.

## Terminal states (transition-table-lawful)

| Condition | State | `task_failed` payload |
| --- | --- | --- |
| Validation fails, budget exhausted | `CODE_FAILED` (VALIDATING → CODE_FAILED ✓) | `stage: "validation:<stage>", kind: "code", repairCycles` |
| Validation/review hit sandbox faults | `INFRASTRUCTURE_FAILED` (VALIDATING → ✓) | `stage: "validation:<stage>", kind: "infrastructure"` |
| Review rejects, budget exhausted | `FAILED` | `stage: "review", kind: "code", repairCycles` |
| Anything else (unchanged pre-P11 paths) | `FAILED` | `stage: workspace/setup` heuristic |

The table has **no REVIEWING → CODE_FAILED edge by design**, so exhausted
review rejections land in FAILED with precise `stage: "review"` attribution
rather than weakening the machine.

## Observability

- Events per cycle: `validation_started`/`validation_failed`/`validation_passed`,
  `review_started`/`review_failed`/`review_passed`, all with `repairCycle`;
  `code_generated` per coder invocation with `repairCycle`;
  `validation_passed` additionally reports `repairCyclesCompleted`.
- Attempt row `outcomeSummary` begins with `repair cycles completed: N`.
- `task_failed` gains `kind` (`code`/`infrastructure`/`unknown`) and
  `repairCycles`.
- Token accounting stays exact: every `VALIDATING` entry transition carries
  that cycle's tokens; the coder `AgentRun` row accumulates
  `tokenUsage: { increment }` per cycle and holds the latest summary (cycle
  history lives in the audit rows).

## What P11 deliberately does not do

- **No BullMQ retry of execution** — P7's `attempts: 1 by design` stands. The
  repair loop runs inside the single delivery; retries of side-effectful work
  remain an explicit human/system decision.
- **No auto-requeue from INFRASTRUCTURE_FAILED** — the table allows
  INFRASTRUCTURE_FAILED → QUEUED, but automatic re-enqueue of execution is a
  P14 operational decision, not something the failing worker should grant
  itself.
- **REPAIRING → HUMAN_INPUT_REQUIRED** exists in the table but no driver uses
  it yet (candidate: repeated identical failure signatures → ask a human for
  steering instead of spending the last budget cycle).

## Verification

- 6 new repair unit tests (budget parsing incl. disable/ceiling/invalid,
  prompt contract preservation, feedback tail-capping, review vs validation
  wording, error capping), 3 new pipeline/sandbox tests (infraFailure
  threading, honest-failure exclusion, admission-vs-infra), full runner suite
  17 pass + 2 docker-gated skips locally. Root `tsc --build` green.
