# Agent Foundry

Agent Foundry is a self-hosted control plane that reads GitHub repositories, plans work with specialist AI agents, writes and validates code in isolated containers, reviews the result, and opens a draft pull request for human approval. It never merges automatically.

## Deployed architecture

- **Dashboard:** Next.js administration UI on `127.0.0.1:3000`
- **Orchestrator:** profiles repositories, selects catalog agents, and creates approval-gated plans
- **Runner:** generates atomic edits, validates offline, reviews, and opens draft PRs
- **PostgreSQL:** projects, tasks, approvals, attempts, events, and audit history
- **Redis/BullMQ:** planning and execution queues
- **Gemini:** primary AI provider
- **Ollama:** private VPS fallback using `deepseek-coder-v2:16b-lite-instruct-q4_K_M`

Credentials, model files, databases, backups, logs, and task workspaces are not stored in Git.

## Workflow

1. An administrator registers and authorizes a GitHub repository.
2. Agent Foundry reads a bounded inventory and detects the stack before planning.
3. The orchestrator selects agents from the pinned catalog and creates a plan.
4. A human approves the plan.
5. The runner clones the repository and generates bounded exact find/replace edits.
6. Every edit is validated before any file is written, keeping multi-file changes atomic.
7. Validation runs in Docker. Node projects use allowlisted package scripts; static sites use built-in HTML, local-asset, and JavaScript syntax checks without dependency installation.
8. Safety and plan-fidelity reviewers must approve.
9. Agent Foundry pushes a task branch and opens a draft pull request.
10. A human reviews and merges on GitHub.

Writable repositories use direct task branches. Read-only repositories use a verified fork owned by the authenticated GitHub account.

## Security boundaries

- No automatic merges
- Human repository-authorization and plan-approval gates
- Allowlisted repositories and validated branches
- Bounded model and repository context
- Exact atomic edits instead of unrestricted rewrites
- Restricted Docker validation with offline validation stages
- Secret and credential paths blocked from generated changes
- Agent catalog commit verified on every planning job
- `.env` parsed as data and never evaluated as shell code
- Dashboard bound to loopback

Expose the dashboard only through a secured reverse proxy, SSH tunnel, or private Tailscale connection.

## Requirements

- Ubuntu 24.04 LTS
- Node.js 22 or newer
- npm, Git, and authenticated GitHub CLI
- Docker Engine with Compose v2
- PM2
- Optional Tailscale
- Optional Ollama bound to `127.0.0.1:11434`

Size CPU, memory, and storage appropriately when running the deployed 16B quantized Ollama model.

## Install

```bash
git clone https://github.com/cjram71/agent-foundry.git
cd agent-foundry
cp .env.example .env
chmod 600 .env
```

Fill in unique PostgreSQL, Redis, and JWT secrets, plus `GEMINI_API_KEY`. Set `APP_URL` to the exact browser origin, including scheme, host, and port.

```bash
gh auth login
gh auth status
bash scripts/install-ubuntu.sh
```

Create the first administrator without sourcing `.env` as shell code:

```bash
source scripts/load-env.sh
foundry_load_env .env
node packages/database/create-admin.js
```

Start the services:

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 status
```

## AI providers

```dotenv
GEMINI_API_KEY=replace_with_your_key
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=deepseek-coder-v2:16b-lite-instruct-q4_K_M
```

Install the fallback model separately:

```bash
OLLAMA_HOST=127.0.0.1:11434 ollama serve
ollama pull deepseek-coder-v2:16b-lite-instruct-q4_K_M
```

Agent Foundry uses Ollama only for quota, rate-limit, temporary availability, and related provider failures. Keep its API private.

## Backup and migration safety

Before production migrations:

```bash
bash scripts/backup.sh
bash scripts/restore.sh --verify /path/to/backup
bash scripts/vps-inspection.sh
```

The restore drill uses a throwaway database and proves the backup is usable. See [Migration Rescue](docs/MIGRATION-RESCUE.md) and [Backups](docs/BACKUPS.md).

## Verify

```bash
npm ci
npx prisma generate --schema packages/database/prisma/schema.prisma
npm run build
npm run build --workspace=apps/dashboard
npm test --workspace=apps/orchestrator
npm test --workspace=apps/runner
npm test --workspace=packages/github
pm2 status
curl -fsS http://127.0.0.1:3000/api/health
```

A healthy response reports `ok: true` with database and Redis checks set to `true`. GitHub Actions uses Node 24-compatible actions while testing the application on Node 22.

## Operations

```bash
pm2 logs foundry-dashboard
pm2 logs foundry-orchestrator
pm2 logs foundry-runner
pm2 restart ecosystem.config.cjs --update-env
```

The wedge sweeper safely fails tasks that stop progressing. Historical failures remain auditable until intentionally archived.

See [Architecture](docs/ARCHITECTURE.md), [Operations](docs/OPERATIONS.md), [Fork Execution](docs/FORK-EXECUTION.md), [Role Catalog](docs/ROLE-CATALOG.md), and [Reinstall](docs/REINSTALL.md).
