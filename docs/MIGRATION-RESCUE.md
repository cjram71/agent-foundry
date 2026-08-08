# Migration rescue (Phase P3)

## Problem (Phase 1 audit, verified by source inspection)

The retired migration history could not produce a database that works with the
application code:

| Aspect | Retired `20260803074008_init` | `schema.prisma` (what the client expects) |
|---|---|---|
| Project repo column | `githubRepository` | `githubRepo` |
| AgentRun error column | `errorInformation` | `errorInfo` |
| AgentRun timestamps | extra `updatedAt TIMESTAMP(3) NOT NULL` (no default) | not mapped — inserts would fail |
| AgentRun promptHash | nullable | required |
| User role | `TEXT DEFAULT 'ADMIN'` | `"Role"` enum, `DEFAULT 'OPERATOR'` |
| Task riskLevel | `DEFAULT 'low'` | `DEFAULT 'medium'` |
| FK delete behavior (Task, AgentRun, Approval) | `ON DELETE RESTRICT` | `onDelete: Cascade` |
| Prompt hash | nullable | required |

Additionally, retired `20260804103000_project_public_links` filtered its
backfill `UPDATE` on `"githubRepo"` — a column retired migration 1 never created
— so **a fresh `prisma migrate deploy` could never succeed**, and any database
built from that history cannot serve a client generated from `schema.prisma`.
It also embedded live Vercel project/team identifiers, which do not belong in a
migration.

## Decision

**Squash to a single baseline migration** that reproduces `schema.prisma`
exactly (`20260808080000_baseline_init`), plus an idempotent, data-preserving
reconciliation script for any pre-existing database
(`scripts/reconcile-prisma-drift.sql`).

Alternatives considered and rejected:

- *Add a third corrective migration alone*: does not fix fresh deploys, because
  the broken migration 2 runs first and fails.
- *Edit the applied migrations in place*: breaks checksum verification on any
  environment where they were already applied (`migrate deploy` refuses
  modified applied migrations). Only safe if no live database ever applied
  them — which cannot be verified from the repository.

The retired SQL remains recoverable in git history at commit `660c705` for
audit purposes. No application data is touched by this repository change;
database work happens only on the VPS under operator control, after a backup.

## Verification

Permanent gate (pending owner application): `docs/ci-migrate-scratch.job.yml`
contains the `migrate-scratch` CI job — apply baseline to scratch
PostgreSQL 16 → `migrate diff --exit-code` must be empty →
`scripts/verify-schema-parity.sql` assertions → reconciliation SQL applied
twice. It is staged as a document because the automation token used for the
P3 push lacks GitHub's `workflows` permission; the owner needs to merge it
into `.github/workflows/ci.yml` once.

Until then, the equivalent evidence is produced locally (real PostgreSQL
engine): baseline migration applies cleanly, the parity assertion block in
`scripts/verify-schema-parity.sql` passes, and
`scripts/reconcile-prisma-drift.sql` is valid and idempotent when applied
twice. Results are attached to the Phase P3 report.

## Procedure A — fresh VPS install

Nothing special: `prisma migrate deploy` now works from scratch.

## Procedure B — existing VPS database (operator-run, with backup)

Prerequisites: read-only inspection evidence. Run
`bash scripts/vps-inspection.sh` and review section 11 (which migration rows
exist, which drifted columns exist).

```bash
# 1. Back up (required; capture the archive outside the repository)
docker exec foundry_postgres pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB" \
  > "$HOME/agent-foundry-pre-p3-$(date -u +%Y%m%dT%H%M%SZ).dump"

# 2. Archive the old migration ledger rows (audit trail)
docker exec -i foundry_postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  "COPY (SELECT * FROM _prisma_migrations) TO STDOUT WITH CSV HEADER" \
  >> "$HOME/agent-foundry-pre-p3-migrations.csv" 2>/dev/null || true

# 3. Reconcile physical drift (idempotent; safe on both drifted and healthy DBs)
docker exec -i foundry_postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -v ON_ERROR_STOP=1 -f - < scripts/reconcile-prisma-drift.sql

# 4. Remove the retired ledger rows, then baseline-mark the squashed migration
docker exec -i foundry_postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  "DELETE FROM _prisma_migrations WHERE migration_name IN
   ('20260803074008_init','20260804103000_project_public_links');"
set -a; . ./.env; set +a
npx prisma migrate resolve --schema packages/database/prisma/schema.prisma \
  --applied 20260808080000_baseline_init

# 5. Verify (empty output = database now matches schema.prisma exactly)
npx prisma migrate diff --from-url "$DATABASE_URL" \
  --to-schema-datamodel packages/database/prisma/schema.prisma

# 6. Sanity check the application path
npx prisma migrate status --schema packages/database/prisma/schema.prisma
```

If step 5 shows residual differences, stop, capture the output, and restore the
backup before retrying. Rollback is: stop services, drop and recreate the
database, `pg_restore` the archive from step 1, and check out the previous
commit's migrations if the ledger must be rebuilt manually.

## Notes

- `scripts/reconcile-prisma-drift.sql` intentionally retains the legacy
  `AgentRun.updatedAt` column if present (relaxed to nullable + default). The
  Prisma client simply does not read it; no historical data is destroyed.
- The optional production-URL backfill from the retired second migration is
  preserved only as a commented block in the reconciliation script. Prefer
  setting it through the dashboard ("Edit public link") — a deliberate,
  audited action.
- Future schema changes follow normal `prisma migrate dev` flow from the P4
  phase onward; never edit this baseline after it has been applied anywhere.
