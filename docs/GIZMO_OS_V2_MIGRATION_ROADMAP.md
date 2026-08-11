# GIZMO OS v2 — Migration Roadmap

Baseline: `cjram71/agent-foundry@8d6dcd4c856f9166a08927a3ffdb6807b4d5c9f1`

This roadmap is the recommended implementation order. Each phase must leave the production system recoverable.

## Universal phase-gate rule

Every phase is blocked behind the previous phase's machine-verifiable PASS checkpoint. See `docs/GIZMO_PHASE_GATES.md` and `checkpoints/checkpoint.schema.json`.

Before any phase begins, the builder must define:

- PRE-CHECK
- EXECUTE
- VERIFY
- ROLLBACK
- HUMAN APPROVAL requirement

After the phase, the builder must write `/srv/gizmo/checkpoints/phase-XX-<name>.json` and run:

```bash
node scripts/gizmo-checkpoint-gate.js /srv/gizmo/checkpoints/phase-XX-<name>.json
```

The next phase is forbidden unless this command exits successfully.

| Phase | Name | Purpose | Production risk | Mandatory gate |
|---|---|---|---|---|
| 0 | Baseline & Restore Proof | prove source/VPS/backup reality | none/read-only | recorded audit + human review + PASS checkpoint |
| 1 | Security & CI Hardening | auth revocation, secret split, config consistency, broader CI | medium | full regression + security checks + PASS |
| 2 | Mission Layer | add Mission Contract above Tasks | low-medium | migration tests + task regression + PASS |
| 3 | Model Abstraction | wrap current Gemini/Ollama without behavior change | medium | provider parity + rollback path + PASS |
| 4 | LiteLLM + Codex | route models, add controlled Codex provider | medium | canary role migration + cost/fallback tests + PASS |
| 5 | Tool Gateway | capability-based audited tools | medium | deny/allow/audit tests + PASS |
| 6 | pgvector Memory | hybrid memory with provenance | high (DB cutover) | fresh backup + restored-copy rehearsal + human approval + PASS |
| 7 | Obsidian Vault | human-readable knowledge mirror | low | secret scan + backup test + PASS |
| 8 | Skill Foundry | versioned/certified reusable skills | medium | certification/eval gate + PASS |
| 9 | n8n Workflow Factory | deterministic workflows | medium | private exposure + security audit + workflow + backup test + PASS |
| 10 | Evals/Safety | goldens, red-team, regression gates | low | approved baseline + mandatory suites + PASS |
| 11 | Observability | OTel, Tempo, Prometheus, Loki, Grafana | medium | trace correlation + resource-budget + no-secret telemetry + PASS |
| 12 | Operator Layer | mission/knowledge/skill/workflow UX | low-medium | auth + UI acceptance + PASS |
| 13 | Software Factory Expansion | project constitutions/templates/Codex build modes | medium-high | sandbox + PR + security/eval gates + PASS |
| 14 | Business Foundry | process scanner/ROI/productization | low-medium | research-only pilot + evidence quality + PASS |
| 15 | Backup/DR Expansion | off-host Restic + full restore drill | medium | complete isolated restore + PASS |
| 16 | Publish `gizmo-os` | new private GitHub, preserved history, rulesets | external write | owner approval + CI/security status + PASS |

## Failure behavior for all phases

If a mandatory VERIFY item fails:

1. stop immediately;
2. record failure evidence without secrets;
3. attempt bounded repair only inside current scope;
4. rerun all mandatory checks, not only the failed check;
5. if still failing, execute ROLLBACK;
6. verify the prior PASS state is healthy;
7. write FAIL/ROLLED_BACK/BLOCKED checkpoint;
8. do not continue.

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

The database phase is intentionally later. Keep Postgres 16. Test pgvector against a restored copy before cutover. Never point the only production volume at a new image without a fresh verified backup, explicit rollback path, and PASS checkpoint.

## LiteLLM warning

Do not big-bang move all model calls. Introduce an internal interface first, then migrate planner/coder/reviewer one role at a time. Every role cutover must retain a tested rollback to the previous working provider path.

## n8n warning

n8n may execute powerful integrations. Keep the editor private, restrict risky nodes, keep credentials out of Git, and require Gizmo policy/approval around consequential invocations. The n8n phase cannot PASS until a test workflow, security audit, private-exposure check, and backup/restore verification succeed.

## New GitHub publication

The new repository is a publication milestone, not the first engineering step. Preserve history from Agent Foundry and record the baseline commit in the README. Publication is blocked until all required foundation checkpoints are PASS and the owner approves the external write.
