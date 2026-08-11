# GIZMO OS v2 — Change Matrix

## Keep as authoritative

| Existing system | Decision | Reason |
|---|---|---|
| Next.js dashboard | KEEP / EXPAND | already operator surface |
| TypeScript monorepo | KEEP | working production code |
| Prisma | KEEP | current schema/migrations |
| PostgreSQL 16 | KEEP | avoid unnecessary major migration |
| Redis + BullMQ | KEEP | durable queues + operational controls |
| `packages/policy` | KEEP | deterministic security/risk law |
| `packages/state-machine` | KEEP | mature execution lifecycle |
| `packages/manager` | KEEP | safe AI-proposes/code-disposes pattern |
| `packages/cost` | KEEP / EXPAND | spending brake foundation |
| `packages/github` | KEEP / EXPAND | branch/fork/PR controls |
| `apps/runner` | KEEP / EXPAND | sandbox/review/delivery foundation |
| PM2 | KEEP DURING MIGRATION | minimize deployment churn |
| Existing backup/restore scripts | KEEP / EXPAND | proven logical restore foundation |

## Add

| New layer | Implementation |
|---|---|
| Mission Contracts | `packages/mission` + DB models |
| Model Router | `packages/models` + LiteLLM |
| Codex | controlled coder/reviewer provider |
| Tool Gateway | `packages/tools` |
| Semantic Memory | pgvector + `packages/memory` |
| Knowledge Vault | Obsidian Headless optional + `/srv/gizmo/knowledge-vault` |
| Skills | `packages/skills` + `/skills` source tree |
| Workflows | n8n + `packages/workflows` |
| Evals | `packages/evals` + `/evals` |
| AgentOps/Tracing | OTel + Alloy + Tempo/Grafana |
| Business Foundry | `packages/business` + UI |
| Off-host backups | Restic |

## Remove from the old master as mandatory core

| Old proposal | New decision |
|---|---|
| FastAPI core | REMOVE as mandatory |
| SQLAlchemy/Alembic core | REMOVE |
| Python as primary runtime | REMOVE; specialist only |
| OpenAI Agents SDK as authoritative orchestrator | REMOVE; optional adapter only |
| PostgreSQL 18 immediate upgrade | REMOVE |
| giant permanent agent team | REMOVE |
| separate vector database | REMOVE |
| immediate Kubernetes | REMOVE |

## Fix before adding features

1. Protected server pages need authoritative DB-backed session validation.
2. PM2 currently injects one shared env into all three processes; reduce blast radius.
3. Reconcile Ollama fallback model/config documentation.
4. Expand CI to all security/control-plane packages.
5. Ensure the results/run-log UI remains within the protected authenticated surface.
