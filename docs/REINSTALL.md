# Reinstall or migrate Agent Foundry

## 1. Prepare the VPS

Use Ubuntu 24.04 LTS. Create a non-root administrator, install security updates, Docker Engine with Compose v2, Node.js 20.9 or newer, npm, Git, GitHub CLI, OpenSSL, and optionally Tailscale and Ollama.

Keep PostgreSQL, Redis, the dashboard, and Ollama bound to localhost or a private interface. Use UFW with inbound traffic denied by default.

## 2. Clone safely

Clone this private repository as the service user. Do not copy the old `.env`, GitHub token, private key, database volume, or Ollama models into Git.

## 3. Configure secrets

Copy `.env.example` to `.env`, set mode `600`, and generate new secrets. Set a valid `DATABASE_URL` matching the PostgreSQL values. Add Gemini or other provider credentials only on the server after installation.

Authenticate GitHub CLI using the least privileges and repository scope needed by the projects Agent Foundry manages.

## 4. Install

Run `bash scripts/install-ubuntu.sh`. It starts PostgreSQL and Redis, installs locked dependencies, generates Prisma Client, deploys migrations, builds every workspace, and runs runner tests.

## 5. Agent catalog (required for planning)

`scripts/install-ubuntu.sh` clones the approved catalog into `AGENT_CATALOG_PATH`
and checks out `AGENT_CATALOG_COMMIT` when set (refusing to overwrite a
non-catalog directory). No manual step is needed for a fresh install.

Pin enforcement is active since P9: the orchestrator verifies the checkout is a
real git commit object (`rev-parse --verify HEAD^{commit}`) and, when
`AGENT_CATALOG_COMMIT` is set, that it equals the pin — failing closed on any
mismatch. An empty pin is unpinned development mode; every plan records
`catalogPinned: false`. Production must pin. See `docs/ROLE-CATALOG.md` for the
trust model, entry schema, and the pin-advancement runbook.

## 6. Optional Ollama

Install Ollama from its official distribution, bind it to `127.0.0.1:11434`, download the selected model separately, and set `OLLAMA_URL` and `OLLAMA_MODEL`. Model binaries are never stored in this repository.

## 7. Administrator and services

Load `.env`, run `node packages/database/create-admin.js`, then start `ecosystem.config.cjs` with PM2. Configure PM2 startup for the service user and save the process list.

## 8. Access

Prefer Tailscale. Alternatively, place a TLS reverse proxy in front of the dashboard and restrict access. Set `APP_URL` to the exact origin used by administrators.

## 9. Migration data

For a true migration, back up PostgreSQL with `pg_dump` and restore it on the new server through a protected channel. Copy only required project workspaces if necessary. Never commit database dumps, logs, credentials, private keys, or generated repositories.

## 10. Acceptance checks

- `docker compose ps` shows PostgreSQL and Redis healthy/running.
- `npm run build` succeeds.
- `npm run test --workspace=apps/runner` succeeds.
- `pm2 status` shows dashboard, orchestrator, and runner online.
- port 3000 is private or protected by TLS/authentication.
- port 11434 is localhost-only when Ollama is used.
- a test project can be registered, authorized, planned, approved, and opened as a draft pull request.

## 8. Backups (P15)

Schedule daily backups and run a restore drill once after installation:

```bash
( crontab -l 2>/dev/null; echo '17 3 * * * /home/cory/agent-foundry/scripts/backup.sh >> /var/log/foundry-backup.log 2>&1' ) | crontab -
bash scripts/backup.sh && bash scripts/restore.sh --verify "$(ls -td /srv/agent-foundry/backups/*/ | head -1)"
```

See docs/BACKUPS.md for scope, retention, off-host guidance, and the restore procedure.
