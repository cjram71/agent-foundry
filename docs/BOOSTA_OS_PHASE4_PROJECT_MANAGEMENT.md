# Boosta OS Phase 4 — Project Management and Controlled Production

## Authority boundary

Opportunity approval records permission to draft a project only. It does not approve the Master Project Plan or unlock tasks. A Phase 4 project moves through:

```text
APPROVE opportunity -> DRAFT_PLAN -> PLAN_PENDING_APPROVAL -> APPROVED
                                             |                 |
                                             v                 v
                                      PLAN_REJECTED       governed tasks
```

Submitting a new plan after approval is a material change. The project is paused, authorization is removed, and renewed approval is required.

## PRE-CHECK

- Branch is `boosta-campaign-vertical-slice` and worktree contains only Phase 4 changes.
- `/srv/gizmo/checkpoints/boosta-phase-03-opportunity-loop.json` passes.
- Dashboard health, PostgreSQL, Redis, and queue health pass.
- A fresh backup exists before the production migration.
- Emergency stop remains available.

## EXECUTE

- Add opportunity provenance and governance state to projects.
- Add immutable, hashed Master Project Plan versions.
- Add task owner, department, inputs, dependencies, validation, approval, result, deadline, and blocking fields.
- Add authenticated project-governance API and dashboard.
- Lock task creation, planning, and execution until project-plan approval.
- Keep all external connectors disabled by default.

## VERIFY

```bash
npx prisma validate --schema packages/database/prisma/schema.prisma
npx prisma generate --schema packages/database/prisma/schema.prisma
npm --workspace apps/dashboard test
npm run build
npm run build --workspace=apps/dashboard
node --env-file=.env scripts/verify-boosta-phase4.cjs
curl -fsS http://127.0.0.1:3000/api/health
```

Mandatory evidence:

- unique `sourceOpportunityId` enforces at most one project per opportunity;
- every task owner is non-null and non-empty;
- every Phase 4 project without an approved plan is unauthorized;
- approved projects reference their approved plan version;
- material changes return to `PLAN_PENDING_APPROVAL` and pause execution;
- task API checks governance both before planning and before plan approval;
- no external action occurs during project or plan approval.

## ROLLBACK

1. Stop deployment and restore the previous accepted commit/build.
2. Preserve Phase 4 rows and audit evidence; do not drop tables during ordinary rollback.
3. Set affected Phase 4 projects to unauthorized if application rollback removes governance enforcement.
4. Restore the pre-migration database backup only when explicitly approved and data reconciliation is complete.
5. Re-run the Phase 3 checkpoint, health test, and Phase 3 verification.

## Controlled Tool Gateway

Phase 4 defines no new connector authority. GitHub, publishing, payment, email, advertising, and third-party actions remain behind the existing Tool Gateway, task policy, plan approval, final approval, and emergency-stop controls.
