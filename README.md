# Gizmo OS v2

**Gizmo OS v2** is the evolution of the deployed **Agent Foundry** control plane into a persistent, self-hosted AI software, workflow, knowledge, and business operating system.

This repository deliberately evolves the working production foundation instead of replacing it with a clean-slate agent framework.

## Provenance

Accepted VPS/GitHub baseline:

```text
Repository: cjram71/agent-foundry
Commit: 8d6dcd4c856f9166a08927a3ffdb6807b4d5c9f1
Date: 2026-08-11
Source: PR #5 — Sync current VPS build
```

The baseline already provides the hard parts of a safe execution control plane:

- Next.js operator dashboard
- PostgreSQL 16 + Prisma durable state
- Redis + BullMQ queues
- deterministic task state machine
- deterministic project policy engine
- cost accounting and spending brake
- orchestrator and project manager
- restricted Docker validation sandboxes
- repair/review pipeline
- GitHub task branches and draft PRs
- human plan/merge approval gates
- task attempts/events/transitions/audit history
- emergency stop, cancellation, wedge recovery
- backup and restore verification
- Gemini primary AI path
- private Ollama fallback
- VPS-synced Results & Run Log interface

## Gizmo operating model

> Use deterministic software wherever possible, AI judgment wherever necessary, and human approval wherever consequences justify it.

```text
                              HUMAN OWNER
                                  |
                         GIZMO OPERATOR UI
                                  |
                         MISSION COMPILER
                                  |
                       MISSION CONTRACT
                                  |
                            TASK ROUTER
                                  |
          +-----------------------+-----------------------+
          |                       |                       |
   DETERMINISTIC WORK         AGENTIC WORK          HUMAN DECISION
          |                       |                       |
     n8n / APIs            Orchestrator/Runner        Approvals
          |                       |
          |                   MODEL LAYER
          |                       |
          |                    LiteLLM
          |                       |
          |      OpenAI / Codex / Gemini / Claude
          |                       |
          |                    Ollama
          |                 private fallback
          +-----------------------+-----------------------+
                                  |
                            TOOL GATEWAY
                                  |
                             EXECUTION
                                  |
                            VERIFICATION
                                  |
                               MEMORY
                                  |
             PostgreSQL + pgvector + Knowledge Vault
                                  |
                           LEARNING ENGINE
                                  |
        Skill Foundry / Workflow Factory / Agent Foundry
                                  |
                           SOFTWARE FACTORY
                                  |
                           BUSINESS FOUNDRY
```

## What remains authoritative

Gizmo does **not** throw away Agent Foundry. The existing TypeScript control plane remains authoritative for execution safety.

Keep and extend:

```text
apps/
  dashboard/
  orchestrator/
  runner/

packages/
  cost/
  database/
  github/
  manager/
  ops/
  policy/
  state-machine/
```

The following are explicit non-goals for the v2 migration:

- no second FastAPI/SQLAlchemy control plane
- no unnecessary PostgreSQL major upgrade
- no permanent swarm of agents
- no direct agent push/merge to protected `main`
- no unrestricted agent root shell
- no Docker socket inside task validation containers

## Gizmo v2 additions

The migration adds these capabilities incrementally:

```text
packages/
  mission/       Mission Contracts and compiler
  models/        provider-neutral model routing / LiteLLM
  tools/         capability-based Tool Gateway
  memory/        pgvector + hybrid retrieval + provenance
  skills/        versioned/certified Skill Foundry
  workflows/     n8n Workflow Contracts and bridge
  evals/         goldens, red-team, regression gates
  telemetry/     OpenTelemetry correlation
  business/      Business Foundry models/services

infra/
  litellm/
  n8n/
  postgres/
  grafana/
  prometheus/
  loki/
  tempo/
  alloy/

skills/
evals/
knowledge/
```

## Blocking security work

Before adding the larger Gizmo services, the migration must:

1. enforce authoritative DB-backed session checks on protected server-rendered pages;
2. reduce the current shared PM2 `.env` blast radius so dashboard/orchestrator/runner receive only required secrets;
3. reconcile Ollama fallback model configuration;
4. expand CI across the entire control plane, authentication, policy, state-machine and migration tests.

## Mission Contracts

A Gizmo Mission sits above atomic Tasks and records:

- goal
- context
- constraints
- deliverables
- Definition of Done
- failure conditions
- risk
- budget/token budget
- parallelism ceiling
- allowed tool classes
- approval rules
- optional deadline
- project/business linkage
- provenance

A model saying “done” is never sufficient evidence of mission completion.

## Models

Current Gemini/Ollama behavior is preserved while the system moves behind a provider-neutral interface. LiteLLM becomes a private internal router. Codex is added as a **controlled builder/reviewer capability** and must still pass the Runner’s schema validation, path validation, policy, atomic edits, sandbox tests, independent review, draft PR, and human gates.

## Memory and knowledge

Gizmo keeps PostgreSQL 16 and adds pgvector only after a restored-copy migration rehearsal. Retrieval combines PostgreSQL lexical/full-text search and pgvector semantic search with provenance and trust metadata.

An Obsidian-compatible vault under `/srv/gizmo/knowledge-vault/` provides a human-readable organizational view. Secrets never belong in the vault.

## Skills and workflows

Skills are reusable, versioned procedures with manifests, tests, permissions, risk ceilings, and evals. Full skill content is loaded only when needed.

n8n is Gizmo’s deterministic workflow engine, not its brain. Its editor stays private, credentials stay out of Git, and consequential actions remain subject to Gizmo policy/approval.

## Verification and AgentOps

Gizmo v2 adds golden datasets, red-team tests, independent review, and trace correlation across:

```text
Mission -> Task -> Attempt -> AgentRun -> model/tool call
        -> sandbox -> GitHub PR -> approval
```

Planned private observability stack:

- OpenTelemetry
- Grafana Alloy
- Tempo
- Prometheus
- Loki
- Grafana
- node_exporter
- cAdvisor

## Business Foundry

After the execution platform is reliable and observable, Gizmo adds business-process scanning, automation opportunity scoring, ROI analysis, reusable-asset detection, and productization workflows.

The flywheel is:

```text
business audit
 -> pilot
 -> implementation
 -> measured result
 -> repeated pattern
 -> reusable skill/workflow/template
 -> product candidate
 -> SaaS/app/managed service
```

## Security boundaries

Non-negotiable rules:

- no automatic merges
- human approval remains enabled
- AI output/repository/retrieved content is untrusted data
- AI never owns security policy
- fail closed on missing policy/security configuration
- no production secrets in model prompts/workspaces/logs
- no unrestricted Docker/host access for agents
- deterministic verification before “done”
- every infrastructure migration has rollback and restore proof
- every durable memory has provenance
- every capability is tested before certification

## Current installation foundation

The deployed Agent Foundry foundation currently expects:

- Ubuntu 24.04 LTS
- Node.js 22+
- npm + Git + authenticated `gh`
- Docker Engine + Compose v2
- PM2
- PostgreSQL 16
- Redis 7
- Gemini API credentials
- optional private Ollama on `127.0.0.1:11434`

Do not reinstall a working VPS merely to follow a design document. Observed VPS state is the first source of truth.

## Build documents

Read these before making Gizmo migrations:

- [`docs/GIZMO_OS_MASTER_BUILD_v2.md`](docs/GIZMO_OS_MASTER_BUILD_v2.md)
- [`docs/GIZMO_OS_V2_MIGRATION_ROADMAP.md`](docs/GIZMO_OS_V2_MIGRATION_ROADMAP.md)
- [`docs/GIZMO_OS_V2_CHANGE_MATRIX.md`](docs/GIZMO_OS_V2_CHANGE_MATRIX.md)
- [`docs/GIZMO_OS_V2_REPO_LAYOUT.txt`](docs/GIZMO_OS_V2_REPO_LAYOUT.txt)

Existing Agent Foundry operational documentation remains valid until explicitly superseded.

## Source-of-truth order

When information conflicts:

1. observed VPS state
2. current accepted Git code
3. deterministic tests/database state
4. Gizmo v2 build specification
5. current official upstream documentation
6. tutorials/videos
7. model assumptions

## Publication plan

This migration is developed on a dedicated branch first. After end-to-end acceptance, preserve Git history and publish the accepted build as a private `cjram71/gizmo-os` repository (or owner-approved equivalent). Do not delete/archive the original Agent Foundry repository without explicit approval.
