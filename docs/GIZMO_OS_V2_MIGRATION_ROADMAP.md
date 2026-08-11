# GIZMO OS v2 — Migration Roadmap

Baseline: `cjram71/agent-foundry@8d6dcd4c856f9166a08927a3ffdb6807b4d5c9f1`

This roadmap is the recommended implementation order. Each phase must leave the production system recoverable.

| Phase | Name | Purpose | Production risk | Gate |
|---|---|---|---|---|
| 0 | Baseline & Restore Proof | prove source/VPS/backup reality | none/read-only | human review |
| 1 | Security & CI Hardening | auth revocation, secret split, config consistency, broader CI | medium | full regression |
| 2 | Mission Layer | add Mission Contract above Tasks | low-medium | migrations + task regression |
| 3 | Model Abstraction | wrap current Gemini/Ollama without behavior change | medium | provider parity tests |
| 4 | LiteLLM + Codex | route models, add controlled Codex provider | medium | canary role migration |
| 5 | Tool Gateway | capability-based audited tools | medium | deny/allow tests |
| 6 | pgvector Memory | hybrid memory with provenance | high (DB cutover) | restore rehearsal + maintenance approval |
| 7 | Obsidian Vault | human-readable knowledge mirror | low | backup test |
| 8 | Skill Foundry | versioned/certified reusable skills | medium | skill eval gate |
| 9 | n8n Workflow Factory | deterministic workflows | medium | private exposure + security audit |
| 10 | Evals/Safety | goldens, red-team, regression gates | low | baseline approved |
| 11 | Observability | OTel, Tempo, Prometheus, Loki, Grafana | medium | resource-budget check |
| 12 | Operator Layer | mission/knowledge/skill/workflow UX | low-medium | auth + UI acceptance |
| 13 | Software Factory Expansion | project constitutions/templates/codex build modes | medium-high | sandbox + PR gates |
| 14 | Business Foundry | process scanner/ROI/productization | low-medium | research-only pilot |
| 15 | Backup/DR Expansion | off-host Restic + full restore drill | medium | verified restore |
| 16 | Publish `gizmo-os` | new private GitHub, preserved history, rulesets | external write | owner approval |

## Phase 1 blocking fixes

### 1A — Protected server-page authoritative auth
Centralize DB-backed `getSession()` enforcement for protected server-rendered pages. Add revoked-session tests.

### 1B — Per-process secrets
Replace one shared PM2 `.env` blast radius with staged dashboard/orchestrator/runner configurations.

### 1C — AI config consistency
Reconcile the current global Ollama model mismatch. Prefer role aliases once `packages/models` lands.

### 1D — CI completeness
CI must cover the control plane, not only the Runner.

## PostgreSQL / pgvector warning

The database phase is intentionally later. Keep Postgres 16. Test pgvector against a restored copy before cutover. Never point the only production volume at a new image without a fresh verified backup and rollback path.

## LiteLLM warning

Do not big-bang move all model calls. Introduce an internal interface first, then migrate planner/coder/reviewer one role at a time.

## n8n warning

n8n may execute powerful integrations. Keep the editor private, restrict risky nodes, keep credentials out of Git, and require Gizmo policy/approval around consequential invocations.

## New GitHub publication

The new repository is a publication milestone, not the first engineering step. Preserve history from Agent Foundry and record the baseline commit in the README.
