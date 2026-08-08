# Deterministic Manager

Status: active since P6 slice 3. Package: `packages/manager`
(`@foundry/manager`, depends on `@foundry/policy`). Storage: none — the
module is pure functions; its output is persisted as ordinary DRAFT tasks.

The AI Project Manager **proposes**; this module **disposes**. The
evaluation plan (stored planner output, untrusted data) is parsed
defensively, every admitted step is assembled by a fixed template, risk
classified by the policy engine, and admitted only inside the project's
active policy ceiling. Nothing here can plan, queue, or execute — the
output is draft task descriptors.

## Pipeline

```
orchestrator plan (JSON in AgentRun.outputSummary, untrusted)
  → parseManagerPlan()        bounded, sanitized descriptors; malformed
                              items dropped+counted, never repaired
  → buildTaskDrafts()         fixed instruction template + policy screen
  → dashboard approval path   persists DRAFT tasks + task_created events
                              + manager.drafts_created audit
```

Invariants:

- **Caps everywhere**: ≤12 steps, ≤160-char titles (≥3), bounded
  descriptions/criteria, control characters stripped, duplicate titles
  dropped (`MANAGER_LIMITS`).
- **Fixed template** (`buildTaskDrafts`): each draft instruction cites the
  evaluation task id, the step, its validation note, and the evaluation's
  acceptance criteria; content is data inside a template, never
  instructions to the system.
- **Policy screened**: identical rule set to `POST /api/tasks` — prohibited
  steps are excluded (rule ids recorded, step never created); steps above
  the project's active ceiling are excluded with reasons.
- **Drafts only**: created tasks are `DRAFT` (state-machine default) with
  the **computed effective risk stored** as `riskLevel`. Every draft still
  requires the normal human flow: request plan → plan approval → execution.
- **Honest risk**: drafts carry no human declaration, so the declared floor
  is `low`; escalation is done by the deterministic detectors (a blanket
  higher floor would make `low`-ceiling projects unable to receive any
  manager drafts) and the approval gate re-classifies independently.
- **Best-effort final step**: draft creation runs in its own transaction
  AFTER the evaluation-completion transaction commits; a failure audits
  `manager.drafts_created` with `result='failed'` and does not affect the
  completed evaluation.

## Trigger

Exactly one: approving a plan-gate decision for an
`AI Project Manager Evaluation` task (`approve_plan` with `evaluationOnly`).
After the evaluation moves to `COMPLETED`, the latest successful planner
run is parsed and drafts are created. Rejection creates nothing. A second
approval is impossible (state machine: `COMPLETED` is terminal).

## Auditing

`manager.drafts_created` on the project, with counts (`created`, `skipped`,
`droppedAtParse`), `parseFailed`, and `skippedRules` (rule ids only — step
titles/AI text are never copied into audits). Each created draft gets its
own `task_created` TaskEvent with `source: 'manager_evaluation'`.

## Why not parse in the orchestrator?

The orchestrator already validates the plan shape for its own purposes
(`validatePlan`). The manager module is the *consumer-side* validation:
defense in depth so no consumer ever trusts a producer's claim about AI
output. The two validations are independent by design.

## Tests (10)

Parse: valid round-trip and re-sequencing; non-plan documents → null;
malformed/over-limit items dropped+counted; caps on steps and criteria;
control-character sanitization.
Drafts: fixed template fields; noise-free steps stay `low`; high-risk
content escalates deterministically; prohibited steps excluded with rule
ids; tightened ceilings filter identically to task creation; unusable
output → empty plan, no error.
