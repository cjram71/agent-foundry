# Gizmo OS v2 — VPS Installer

This document is the executable deployment contract for the VPS. It complements `GIZMO_PHASE_GATES.md`.

## Safety law

The VPS is not considered a complete Gizmo OS install merely because containers started. `node scripts/gizmo-verify-complete.js` is the final authority. It fails if any required application runtime remains only a contract/interface or if any required service verification fails.

## Host prerequisite step

Run only this step with sudo:

```bash
sudo bash scripts/gizmo-install-host.sh
sudo install -m 0600 config/gizmo.env.example /etc/gizmo/gizmo.env
sudo chown "$USER":"$USER" /etc/gizmo/gizmo.env
```

Edit `/etc/gizmo/gizmo.env` and replace every placeholder. Container images must be pinned to reviewed immutable versions/digests; `latest` and `main-latest` are rejected.

Codex is installed separately as the non-root operator:

```bash
bash scripts/gizmo-install-codex.sh
```

Authentication is an explicit operator action. Never run Codex as root.

## Phase execution

Run phases one at a time while building/migrating:

```bash
GIZMO_ENV_FILE=/etc/gizmo/gizmo.env bash scripts/gizmo-install.sh 00
GIZMO_ENV_FILE=/etc/gizmo/gizmo.env bash scripts/gizmo-install.sh 01
GIZMO_ENV_FILE=/etc/gizmo/gizmo.env bash scripts/gizmo-install.sh 02
```

Phase 03 changes PostgreSQL by creating a separate n8n database/user. It requires:

```dotenv
GIZMO_ALLOW_DATABASE_CHANGES=true
GIZMO_HUMAN_APPROVED_PHASES=phase-03-n8n-db
```

Only set those after the fresh backup/restore evidence has been reviewed.

Then:

```bash
bash scripts/gizmo-install.sh 03
bash scripts/gizmo-install.sh 04
bash scripts/gizmo-install.sh 05
```

Final completeness is a high-risk release gate and requires the owner to approve `phase-06-complete`.

```dotenv
GIZMO_HUMAN_APPROVED_PHASES=phase-03-n8n-db,phase-06-complete
```

```bash
bash scripts/gizmo-install.sh 06
```

`all` is supported only after all approval flags and runtime implementations are already ready:

```bash
bash scripts/gizmo-install.sh all
```

## What phase 04 deploys

Private loopback services:

- n8n
- LiteLLM
- Prometheus
- Grafana
- Loki
- Tempo
- Grafana Alloy
- node_exporter
- cAdvisor

The existing Agent Foundry PostgreSQL, Redis and PM2 app processes remain in place during v2 migration.

## Workflow template catalog

`gizmo-install-catalogs.sh` clones and detaches the approved catalog at the exact configured commit. The catalog is reference data only and is made read-only after checkout. It is never bulk-imported/activated in n8n.

## pgvector

Production PostgreSQL is not changed by the rehearsal script. First create a current dump, then run:

```bash
bash scripts/gizmo-pgvector-rehearsal.sh /path/to/current-agent-foundry.dump
```

Only after restored-copy tests, application migrations, rollback evidence and human approval may a separate production cutover plan be executed.

## Backups

```bash
bash scripts/gizmo-backup-all.sh
```

If `RESTIC_REPOSITORY` and `RESTIC_PASSWORD` are configured, the generated backup set is also sent to Restic off-host storage.

## Rollback

### Auxiliary containers

```bash
docker compose --env-file /etc/gizmo/gizmo.env -f infra/compose/gizmo-services.yml down
```

Persistent volumes are deliberately not deleted by `down`. Reverting a service release means checking out the previous accepted Git commit, restoring the prior pinned image values, and bringing the stack up again.

### n8n database

Do not drop the database during ordinary rollback. Stop n8n and preserve the database for forensic/recovery work. Destructive cleanup requires a separate approved task.

### Agent Foundry core

Use the existing backup/restore and PM2 runbooks. The Gizmo installer must not overwrite them.

### pgvector

The rehearsal is disposable and self-cleans. Production cutover must retain the previous PostgreSQL volume until acceptance has passed.

## Runtime readiness markers

The complete-build verifier intentionally requires certified marker files for application subsystems that are not yet fully wired into production. A coder may create a marker such as:

```text
packages/mission/.gizmo-runtime-ready
```

only in the same reviewed change that provides:

1. actual runtime implementation,
2. durable migrations where needed,
3. tests/evals,
4. Operator/API integration as applicable,
5. backup/rollback impact,
6. passing CI,
7. phase checkpoint evidence.

Creating a marker to bypass implementation is a policy violation.

## Release Definition of Done

A VPS matches the GitHub Gizmo build only when all of the following pass:

```bash
npm ci
npx prisma generate --schema packages/database/prisma/schema.prisma
npm run build
npm run build --workspace=apps/dashboard
npm test --workspace=apps/orchestrator
npm test --workspace=apps/runner
npm test --workspace=packages/github
bash scripts/gizmo-verify-services.sh
node scripts/gizmo-verify-complete.js
node scripts/gizmo-checkpoint-gate.js /srv/gizmo/checkpoints/phase-06-complete.json
```

No coder may report "complete" before that state exists.
