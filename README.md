# Agent Foundry

Agent Foundry is a self-hosted, approval-gated control plane for planning, developing, reviewing, and monitoring multiple GitHub projects with AI agents.

It provides:

- a Next.js administration dashboard;
- multi-project registration, authorization, and deletion;
- AI Project Manager evaluations and specialist-agent selection;
- approval gates before execution and merging;
- BullMQ orchestration backed by Redis;
- PostgreSQL persistence through Prisma;
- isolated Docker validation;
- branch and draft pull-request automation through GitHub CLI;
- Gemini as an optional primary provider;
- a private Ollama fallback running only on the VPS;
- task, run, approval, cost, and audit tracking.

## Security model

Agent Foundry does not automatically merge pull requests. Project authorization and plan approval are checked before execution. Validation runs in restricted Docker containers with no network, dropped Linux capabilities, process and memory limits, and filtered workspaces.

Never commit API keys, GitHub tokens, private keys, databases, model files, generated repositories, logs, or live environment files. This repository contains placeholders only.

## Requirements

Recommended VPS:

- Ubuntu 24.04 LTS
- 8 CPU cores
- 16 GB RAM minimum; 32 GB recommended for a 7B local model
- 40 GB free disk without local models; 100 GB recommended with models
- Docker Engine with Compose v2
- Node.js 20.9+ (Node.js 22 LTS recommended)
- npm
- Git
- GitHub CLI authenticated to the repositories Agent Foundry will manage
- PM2
- Optional: Tailscale for private access
- Optional: Ollama for local AI fallback

## Quick installation

1. Create a private GitHub repository or clone this one on the new VPS.
2. Install the requirements above.
3. Clone and enter the repository.
4. Copy the environment template:

   ```bash
   cp .env.example .env
   chmod 600 .env
   ```

5. Generate secrets:

   ```bash
   openssl rand -base64 36
   openssl rand -base64 48
   ```

6. Fill in `.env`. Provider credentials and local models are intentionally not included.
7. Authenticate GitHub CLI:

   ```bash
   gh auth login
   gh auth status
   ```

8. Run:

   ```bash
   bash scripts/install-ubuntu.sh
   ```

9. Create the first administrator:

   ```bash
   set -a
   source .env
   set +a
   node packages/database/create-admin.js
   ```

10. Start services:

    ```bash
    pm2 start ecosystem.config.cjs
    pm2 save
    ```

The dashboard binds to `127.0.0.1:3000` by default. Reach it through a secured reverse proxy, SSH tunnel, or Tailscale. Do not expose it directly without TLS and access controls.

## AI providers

No API key or model is stored in this repository.

For Gemini, set `GEMINI_API_KEY` in `.env`.

For Ollama fallback, install Ollama separately, download a model, and keep its API private:

```bash
OLLAMA_HOST=127.0.0.1:11434 ollama serve
ollama pull qwen2.5-coder:3b
```

Then set:

```dotenv
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5-coder:3b
```

Agent Foundry attempts Gemini first and uses Ollama only for quota, rate-limit, or temporary provider failures.

## GitHub access

The runtime uses GitHub CLI for repository checks, clones, branches, pushes, and draft pull requests. Authenticate a dedicated service account or GitHub App with only the required repositories and permissions. Agent Foundry never automatically merges.

## Services

- `dashboard`: web control plane
- `orchestrator`: planning and agent-team selection
- `runner`: coding, validation, review, and draft pull requests
- `postgres`: application database
- `redis`: BullMQ queues
- `ollama`: optional local provider, installed separately

## Verification

```bash
npm run build
npm run test --workspace=apps/runner
docker compose ps
pm2 status
curl http://127.0.0.1:3000/login
```

See [docs/REINSTALL.md](docs/REINSTALL.md) for a complete migration checklist and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the system design.
