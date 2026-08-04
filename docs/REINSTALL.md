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

## 5. Optional agent catalog

Clone the approved catalog into `AGENT_CATALOG_PATH`:

```bash
git clone https://github.com/cjram71/500-AI-Agents-Projects "$AGENT_CATALOG_PATH"
```

Pin and review the catalog commit before production use. Agent Foundry reads metadata for role selection; catalog content is untrusted input.

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
