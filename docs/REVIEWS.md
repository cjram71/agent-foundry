# Split Reviews & the Human Change Loop (P12)

Two review splits landed in P12: the automated reviewer now judges with **two
independent lenses**, and the final human gate can **request changes** instead
of only approve/reject.

## Automated split reviews (`apps/runner/src/reviewer.ts`)

After the reserved validation command passes inside the sandbox, the diff is
judged by **two independent model calls** run concurrently:

| Lens | Judges | Explicitly does NOT judge |
| --- | --- | --- |
| **Safety** (pre-P12 prompt, unchanged) | secrets, destructive operations, merges, disabled controls | plan fidelity |
| **Plan fidelity** (new) | implements the approved plan + instruction; no scope creep; acceptance criteria addressed | style/security |

- **Both** must APPROVE. Verdicts are parsed by the deterministic
  `parseReviewVerdict` (`^APPROVED`/`^REJECTED` only; prose, empties, and
  negated verdicts are never approvals).
- Failed review events now carry `failedLenses: ["safety" | "planFidelity" |
  "validation"]`, and the combined feedback document
  (`Safety review: … / Plan-fidelity review: …`, bounded 3.9 KB) feeds the PR
  body, the human gate, and the P11 repair prompt — a repair triggered by a
  fidelity miss tells the coder *what* drifted, not just "rejected".
- Cost note: one extra model call per review (two lenses, run with
  `Promise.all` on the same provider instance). Provider outage behavior is
  unchanged (throws into the existing failure path) — smarter degradation is
  P14 territory.

## Human change-request loop (CHANGES_REQUESTED driver)

The state `CHANGES_REQUESTED` has existed in the transition table since P5;
P12 gives it its driver:

```
AWAITING_APPROVAL --request_changes(note)--> CHANGES_REQUESTED
CHANGES_REQUESTED --resubmit_changes--> QUEUED --(runner, note-injected)-->
  … fresh branch + draft PR … --> AWAITING_APPROVAL   (merge gate re-opens)
CHANGES_REQUESTED --reject_final--> REJECTED          (table-legal abandon)
```

- **State-guarded, not status-guarded.** CHANGES_REQUESTED maps to the same
  legacy string as the merge gate (`awaiting_human_review`), so every P12
  guard uses `task.state`. The pre-existing approve/reject-final guard was
  tightened for the same reason — approval from CHANGES_REQUESTED would have
  hit the transition table's wall as a 500.
- **The note is mandatory and bounded** (`parseChangeRequestNote`, ≤ 2,000
  chars): a change request without content would send the coder in blind.
- **Recorded, not rewritten:** the merge approval row flips to decision
  `changes_requested` with the note. The vocabulary for `Approval.decision`
  is now `pending/approved/rejected/changes_requested` (free-form string —
  no migration needed). A rejection from CHANGES_REQUESTED leaves that row
  intact as history; the ledger records the final outcome via
  `final_rejected` + audit.
- **Resubmission is enqueue-first:** the execution job is created, then the
  QUEUED transition commits. If the state update fails after enqueue, the
  runner's QUEUED guard cleanly skips the job and the task stays
  CHANGES_REQUESTED for another try — the reverse order could orphan a
  QUEUED task with no job.
- **Runner injection:** on re-execution the coder prompt gains the newest
  change note (bounded 4 KB, `humanFeedback` in `buildCoderPrompt`). The
  approved plan is unchanged, so re-execution answers the request *under the
  same plan authority* rather than restarting planning. A fresh branch + new
  draft PR is produced per attempt (branch names are timestamped); the old
  draft PR is superseded, not edited — idempotent PR reuse/close-out is P13
  scope.

## Dashboard

- Merge gate offers three actions: **Approve final result**,
  **Request changes** (inline note form, submit disabled while empty),
  **Reject result**.
- CHANGES_REQUESTED shows **Resubmit for re-execution** + **Reject result**,
  with help text explaining the loop; the gate-specific UI keys off
  `task.state` (passed as a new prop), not the ambiguous legacy label.

## Verification

- 3 reviewer unit tests (verdict parsing table incl. CJK feedback, negation,
  combined-feedback bound), 3 change-note parser tests, dashboard suite 47
  (3 new), runner suite 22 (3 new), dashboard `tsc` + root `tsc -b` green.
