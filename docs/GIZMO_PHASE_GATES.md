# Gizmo Phase Gates / Checkpoint System

## Purpose

Every Gizmo VPS build phase is a controlled transaction. A builder (Codex, Claude, Gemini, or another approved coding agent) may not start the next phase until the current phase has produced a machine-verifiable PASS checkpoint.

Core law:

> No phase may start unless the previous phase has a valid PASS checkpoint.

## Required phase lifecycle

```text
PRE-CHECK
   -> CHANGE / INSTALL
   -> VERIFY
   -> REVIEW
   -> CHECKPOINT
      -> PASS: record evidence, unlock next phase
      -> FAIL: stop, diagnose, bounded repair, re-verify
      -> still FAIL: rollback to last known good checkpoint
```

## Required checkpoint evidence

Every phase records:

- phase id and name
- start/end timestamps
- Git commit SHA
- VPS host identifier
- builder identity/tool
- scope of changes
- pre-check results
- verification checks and outputs
- tests executed and results
- service health status
- security checks
- network exposure check
- backup/restore readiness where relevant
- rollback command/procedure
- artifacts/log references
- human approval state when required
- final result: PASS or FAIL

Secrets, raw tokens, private keys, passwords, recovery codes and unnecessarily sensitive customer data must never be written to checkpoint files.

## Gate states

- `PENDING` — phase not started
- `RUNNING` — phase in progress
- `VERIFYING` — changes complete, checks running
- `PASS` — all mandatory checks satisfied
- `FAIL` — one or more mandatory checks failed
- `ROLLED_BACK` — phase failed and last known good state restored
- `BLOCKED` — cannot proceed because prerequisite/approval is missing

Only `PASS` unlocks the next phase.

## Builder behavior on failure

If a mandatory check fails:

1. Stop progression immediately.
2. Record the failure and relevant non-secret logs.
3. Attempt only bounded repairs inside the current phase scope.
4. Re-run the complete mandatory verification set after repair.
5. If still failing, execute the documented rollback.
6. Verify the rollback restored the previous checkpoint state.
7. Mark the phase `ROLLED_BACK` or `BLOCKED`.
8. Do not begin the next phase.

A builder must never weaken a security rule, delete a failing test, falsify a checkpoint, or mark a failed check as optional merely to continue.

## Human approval gates

Human approval is required before checkpoint PASS can unlock the next phase for high-consequence changes, including:

- destructive or major database migration
- firewall or SSH changes that could affect recovery access
- credential/secret architecture changes
- public network exposure
- production deployment
- irreversible data deletion
- material purchasing or billing changes
- changes that weaken security policy

## Checkpoint storage

Runtime checkpoint records should be written outside the source repository, for example:

```text
/srv/gizmo/checkpoints/
  phase-00-audit.json
  phase-01-security.json
  phase-02-missions.json
  phase-03-model-layer.json
  phase-04-tool-gateway.json
  phase-05-memory.json
  phase-06-knowledge.json
  phase-07-skills.json
  phase-08-workflows.json
  phase-09-evals.json
  phase-10-observability.json
  phase-11-business-foundry.json
  phase-12-backup-dr.json
```

Source-controlled schemas/examples live under `checkpoints/` in this repository. Runtime evidence may be referenced from audit events or artifacts, but secrets must be excluded.

## Phase requirements

Each implementation phase must define four explicit sections before execution:

### PRE-CHECK
What must already be true before mutation begins.

### EXECUTE
Exactly what this phase is permitted to change.

### VERIFY
Machine-verifiable success checks. These are mandatory unless explicitly marked advisory before execution.

### ROLLBACK
How to restore the last known good state if verification fails.

## Example: n8n Workflow Factory phase

PRE-CHECK:
- prior phase checkpoint is PASS
- fresh core DB backup exists
- n8n DB/user credentials available without exposing values
- required ports are free
- Docker healthy

EXECUTE:
- deploy pinned n8n image
- provision isolated n8n database/user
- bind editor privately
- configure encryption key

VERIFY:
- container health PASS
- n8n DB health PASS
- editor is not publicly exposed
- test workflow executes successfully
- credentials are not present in Git/logs
- security audit passes mandatory rules
- backup/restore test succeeds
- existing Gizmo/Agent Foundry health still passes

ROLLBACK:
- stop/remove new n8n service
- restore n8n DB if created and rollback requires it
- restore previous compose/config version
- re-run prior Gizmo health suite

Only after all mandatory VERIFY items pass may the phase checkpoint be marked PASS.
