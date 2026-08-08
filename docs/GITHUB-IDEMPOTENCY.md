# GitHub Idempotency & the PR_CREATED Driver (P13)

## The bug this phase fixed

Since P5, the runner's success path committed a single transition
`REVIEWING → AWAITING_APPROVAL`. **That edge never existed in the transition
table** (`REVIEWING: [PR_CREATED, REPAIRING, SECURITY_BLOCKED, FAILED,
CANCELLED]`). `transitionTask` rejected it, rolling back the entire success
transaction — agent-run completion, attempt record, merge approval row,
events — *after* the draft PR was already open on GitHub. Every execution
that reached this point therefore ended in FAILED with an orphaned draft PR.

Mechanism [VERIFIED by inspection]: table contents vs. the call site
(`apps/runner/src/index.ts` prior to P13) vs. `transitionTask`'s validation.
Production impact [INFERENCE from the mechanism]: every real execution would
hit it; nothing in CI exercises a full execution (needs DB + Docker + Gemini
+ GitHub credentials simultaneously).

Every other runtime transition was audited against the table during this
phase (orchestrator planner paths, runner repair loop, dashboard gates
incl. rollback arms) — all legal.

## The lawful success path

```
REVIEWING → PR_CREATED        (draft PR opened; draft_pr_opened event)
PR_CREATED → AWAITING_APPROVAL (merge gate opens; approval row +
                                final_approval_requested)
```

Both transitions commit inside the existing single success transaction with
the optimistic-concurrency guard (`expectCurrentAttemptId`).

**PREVIEW states are deliberately skipped for now.** `PREVIEW_PENDING /
PREVIEW_READY` and the reserved `preview_ready` event require a preview/
provisioning target that the self-hosted beta does not have (no Vercel, no
per-task deployment infra). The table allows `PR_CREATED →
AWAITING_APPROVAL` directly; when preview infrastructure lands, its driver
plugs into `PR_CREATED → PREVIEW_PENDING → PREVIEW_READY → AWAITING_APPROVAL`
without any table change.

## Idempotent PR creation

A crash between `gh pr create` and the DB commit used to make any replay
fail on "a pull request for branch … already exists".
`GitHubClient.createDraftPullRequest` is now **idempotent by branch**: on
that specific error it finds the open PR for the task branch
(`findOpenPullRequest`) and adopts its URL. Any other error propagates;
found URLs must belong to the authorized repository (regex-escaped match).

With P11/P12 replays and the machine-lawful path, GitHub side effects are
convergent: a repeated delivery either skips (QUEUED guard) or resumes and
adopts the existing PR instead of dying on it.

## External-merge completion guard

The dashboard's `check_status` used to mark a task COMPLETED whenever
GitHub said "merged", from **any** task state — resurrecting terminally
FAILED/REJECTED tasks via out-of-band merges. It now asks the machine:
`isValidTransition(current.state, 'COMPLETED')`. Merges observed from states
without a completion edge are reported honestly ("Pull request is merged")
without changing the task.

## Boundaries still open (documented, not hidden)

- **Superseded draft PRs** (P12 change-resubmit creates a fresh timestamped
  branch + PR; the old one stays open as a draft). Reconciliation/closure of
  superseded drafts is deliberate-automation and lives with P14+ operations;
  nothing merges automatically regardless.
- **Branch litter** from repeated attempts: accepted in beta; cleanup policy
  belongs to the same operational batch.
- Preview provisioning: needs infra that does not exist in the beta.

## Verification

- 6 github-client unit tests (create success, replay adopts existing PR,
  fallback on missing PR only for the specific error, unrelated errors never
  fall back, foreign-URL rejection, parser semantics incl. regex-escaped
  repo names). `tsc -b` green at root; dashboard typecheck green.
- Table-legality re-audit of all runtime transitions: documented above.
