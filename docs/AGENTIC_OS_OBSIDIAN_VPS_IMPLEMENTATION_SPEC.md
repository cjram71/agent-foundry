# Agentic OS Command Center and Obsidian RAG — VPS Implementation Specification

Status: proposed  
Target: `/home/cory/agent-foundry`  
Date: 2026-08-16

## 1. Purpose

Extend Agent Foundry/Gizmo OS with an Obsidian knowledge client, deterministic skills, tiered retrieval, local voice ingress, and auditable background research. This is an additive subsystem, not a replacement control plane.

The VPS owns durable execution state, scheduling, indexing, audit records, and headless workers. The workstation owns Obsidian, microphone capture, optional local speech models, and the editable vault. Markdown remains usable without the VPS.

## 2. Goals and non-goals

Goals:

- Present tasks, schedules, metrics, research, approvals, and daily briefings in Obsidian.
- Maintain a predictable vault optimized for humans and hybrid retrieval.
- Convert repeatable operations into versioned, validated, permission-scoped skills.
- Route deterministic work before retrieval and agentic execution.
- Support voice without exposing an unauthenticated microphone endpoint.
- Preserve Foundry policy, sandbox, approval, audit, and cost controls.

Non-goals:

- Running Obsidian desktop on the VPS.
- Replacing PostgreSQL, Redis, BullMQ, Prisma, PM2, or the task state machine.
- Treating Markdown as an authoritative job queue.
- Letting voice bypass authorization or approval.
- Automatic deletion, publication, purchase, messaging, or merge without policy approval.
- A second FastAPI/SQLAlchemy control plane.
- Indexing secrets, `.env` files, keys, or unrestricted home directories.

## 3. Binding architecture decisions

1. PostgreSQL is authoritative for missions, tasks, runs, schedules, approvals, metrics, and audit events.
2. Redis/BullMQ provides transient delivery; queued jobs reference durable database IDs.
3. The vault is authoritative for operator-authored knowledge and a projection target for reports.
4. A workstation bridge communicates with the VPS through Tailscale and authenticated HTTPS or an SSH tunnel.
5. The VPS never mounts the workstation vault directly; synchronization uses a narrow, versioned protocol.
6. Retrieval starts with metadata, links, indexes, and PostgreSQL full-text search. pgvector becomes default only after evaluation.
7. Existing gates (`awaiting_plan_approval`, `awaiting_human_review`, `approved_for_merge`) remain mandatory.
8. Models use the provider-neutral model router. Claude may be a provider, but correctness cannot depend on one vendor CLI.

```text
Workstation
  Obsidian plugin -> local loopback bridge
  editable vault
  Faster-Whisper / local TTS (optional)
                 |
                 | Tailscale + authenticated API
                 v
VPS / Agent Foundry
  dashboard API and operator auth
  knowledge/sync service
  skill registry and executor
  mission compiler, orchestrator, runner
  scheduler and BullMQ workers
  PostgreSQL + pgvector, Redis
  report projector and audit log
```

## 4. Repository ownership

```text
apps/dashboard/       Obsidian API routes and operator views
apps/orchestrator/    Tier 3 planning and research
apps/runner/          restricted execution of approved commands
packages/database/    Prisma models and migrations
packages/memory/      ingestion, chunking, retrieval, provenance
packages/skills/      manifests, validation, certification, contracts
packages/mission/     query/voice-to-mission compilation
packages/policy/      capabilities and approvals
packages/telemetry/   correlation, duration, errors, and cost
skills/               versioned skill definitions
knowledge/            templates and non-private seed content only
infra/                service, backup, and sync configuration
docs/                 API and operator runbooks
```

The live private vault stays outside Git at `AGENTIC_VAULT_ROOT`, recommended `/home/cory/agent-foundry-data/vault`.

## 5. Vault contract

```text
vault/
  CLAUDE.md
  raw/                    immutable intake except metadata corrections
  wiki/
    _master-index.md
    <domain>/_index.md
  output/                 generated reports and deliverables
  inbox/                  unclassified capture
  daily/
  tasks/                  human-readable task projections
  metrics/
  system/{schemas,templates,prompts}/
  logs/                   sanitized summaries only
```

Indexed Markdown requires:

```yaml
---
id: note_<uuid>
title: Example
type: raw|wiki|report|task|daily|metric
domains: [rag-systems]
status: inbox|active|superseded|archived
source_uri: null
source_hash: sha256:<hex>
created_at: 2026-08-16T00:00:00Z
updated_at: 2026-08-16T00:00:00Z
related: []
visibility: private
---
```

Rules:

- IDs survive moves and renames; hashes make ingestion idempotent.
- `/raw` retains sources and provenance; `/wiki` contains synthesized claims linked to sources.
- Index notes route navigation and are not retrieval chunks.
- Generated files include `generated_by`, `run_id`, and `model`.
- Conflicting claims remain explicit; agents do not silently rewrite history.
- Binary files receive Markdown sidecars with provenance and extraction status.
- `CLAUDE.md` defines navigation and safe-write rules; server policy remains authoritative.

## 6. Sync protocol

- Push manifests contain relative path, note ID, SHA-256, size, modified time, and content type.
- Server results are unchanged, upload-required, conflict, or rejected.
- Pull uses a cursor-based feed of generated and sanitized files.
- Conflicts create siblings in `output/conflicts/`; neither side silently overwrites.
- Paths remain beneath the configured root. Reject traversal, symlinks, device files, executable uploads, oversized bodies, and disallowed extensions.
- Initially allow Markdown, text, JSON/YAML, PDF, common images, and common audio formats.
- Sync records store hash, direction, actor, outcome, and correlation ID.

Syncthing can be evaluated later but cannot replace provenance or conflict handling.

## 7. Ingestion and retrieval

Ingestion:

1. Validate identity, authorization, path, MIME type, size, and hash.
2. Persist source content atomically.
3. Extract text in an isolated, resource-limited worker.
4. Parse frontmatter and Markdown structure.
5. Chunk by headings while retaining source ID, section path, offsets, and hash.
6. Transactionally upsert document/chunk metadata.
7. Update PostgreSQL full-text search.
8. Optionally create embeddings through the configured model route.
9. Record success or classified failure and sanitized telemetry.

Retrieval order:

1. exact ID/path/title;
2. master and domain index routing;
3. metadata plus full-text search;
4. vector similarity when enabled;
5. optional reranking for Tier 3.

Enforce authorization before ranking. Every result includes note ID, path, section, content hash, and score. Generated answers cite note ID and section.

Before hybrid retrieval becomes default, maintain at least 30 representative questions with expected sources. Compare lexical and hybrid recall@5, citation precision, latency, and token use.

## 8. Execution tiers

### Tier 1 — deterministic skills

Typed, bounded scripts or API operations with predictable outputs and no model requirement. Examples: daily note, index refresh, task export, backup verification.

### Tier 2 — metrics and retrieval

Read precomputed reports, indexed notes, and database views. A small model may summarize retrieved results but cannot expand tool scope.

### Tier 3 — agentic missions

Compile requests into existing Mission Contracts: goal, inputs, constraints, deliverables, definition of done, budget, deadline, capabilities, and approvals. Execute through orchestrator/runner. Store results in PostgreSQL first, then project sanitized Markdown to `/output`.

Routing is deterministic: skill match, metrics/retrieval match, then Tier 3 draft. Record route and confidence; low-confidence or high-impact work requires confirmation.

## 9. Skill contract

```text
skills/<namespace>/<name>/
  SKILL.md
  skill.yaml
  scripts/
  tests/
  fixtures/                optional and non-secret
```

```yaml
apiVersion: gizmo/v1
kind: Skill
metadata:
  name: daily-briefing
  version: 0.1.0
spec:
  tier: 1
  entrypoint: scripts/run.mjs
  runtime: node
  timeoutSeconds: 60
  capabilities: [vault.read, vault.write.output, metrics.read]
  network: none
  inputSchema: schemas/input.json
  outputSchema: schemas/output.json
  approval: never
  idempotency: required
```

Certification requires schema, deterministic, timeout, injection, redaction, and idempotency tests plus reviewed capabilities and side effects. Scheduled promotion requires a successful-run threshold and operator approval. Rollback pins the previous version.

## 10. Voice control plane

1. Workstation records after explicit push-to-talk.
2. Faster-Whisper transcribes locally where possible.
3. Local bridge previews transcript and intended action.
4. Read-only commands execute by policy; mutations require confirmation.
5. VPS receives text and metadata, not continuous audio.
6. Response returns as text and optional local TTS.

VPS transcription is an opt-in authenticated fallback with zero retention by default. Audio is deleted after transcription unless explicitly retained. Transcripts are untrusted input and use the same mission compiler and policy engine as typed requests.

Initial intents: task status, daily briefing, vault search, inbox capture, approved skill invocation, and Tier 3 mission draft. Voice cannot directly approve merges, purchases, credentials, deletion, publication, or outbound communication.

## 11. Obsidian plugin

The TypeScript plugin is a thin client storing only a revocable scoped token locally.

- Command center: health, queues, missions, approvals, cost, failures.
- Today: calendar, daily note, schedules, morning briefing.
- Tasks: filterable pipeline and permitted approvals.
- Research: reports, provenance, sync state.
- Skills: registry, certification, runs, invocation forms.
- Voice: push-to-talk, transcript preview, intent, confirmation, response.

The client handles offline state, never silently retries non-idempotent writes, and displays correlation IDs. Development supports Obsidian community `hot-reload`.

## 12. API contract

Routes under `/api/v1/obsidian`:

- `GET /status`, `GET /command-center`
- `GET /tasks`, `GET /tasks/:id`, `POST /tasks/:id/actions`
- `GET /missions`, `POST /missions/drafts`
- `GET /skills`, `POST /skills/:name/runs`, `GET /runs/:id`
- `POST /retrieval/query`
- `POST /sync/manifest`, `PUT /sync/files/:id`, `GET /sync/changes?cursor=`
- `POST /voice/intents`

Require operator authentication, scoped authorization, Zod validation, size/rate limits, structured errors, and correlation IDs. Writes require idempotency keys and audit events. Apply CSRF defenses for cookies. Bind behind the authenticated dashboard and private network; no public exposure.

## 13. Data model additions

- `KnowledgeDocument`: stable ID, path, hash, type, visibility, provenance, ingestion state.
- `KnowledgeChunk`: document, section, ordinal, text hash, FTS data, optional embedding.
- `VaultSyncRecord`: path, hash, direction, conflict state, actor, correlation ID.
- `SkillDefinition`: name, version, manifest hash, tier, certification.
- `SkillRun`: version, input/output references, status, duration, effects, error class.
- `Schedule`: skill/mission reference, timezone, cadence, enabled, next run.
- `VoiceIntent`: transcript hash, intent, risk, confirmation; no audio by default.
- `ReportProjection`: run, destination path, content hash, sync state.

Extend existing task/run entities instead of duplicating them. Large bodies stay on disk/object storage; PostgreSQL stores metadata and hashes. External actions create `AuditEvent` records. Production migrations require review, backup, and explicit approval.

## 14. Security requirements

- Tailscale/private ingress only; deny public ingress by default.
- Separate scoped credentials for sync, metrics, execution, and administration.
- Retrieve minimum authorized chunks; never send the entire vault to a model.
- Redact secrets before logging, indexing, prompting, or projection.
- Spawn allowlisted executable/argument arrays without a shell.
- Disable worker network by default and bound CPU, memory, processes, time, and filesystem.
- Encrypt backups and test restoration.
- Audit actor, capability, policy decision, model, cost, and correlation ID.
- Emergency stop disables schedules and agentic consumption without corrupting durable state.
- Define separate retention for audio, transcripts, raw data, chunks, reports, and logs.

## 15. Configuration

Document but never commit:

```text
AGENTIC_VAULT_ROOT=/home/cory/agent-foundry-data/vault
OBSIDIAN_API_ENABLED=false
OBSIDIAN_API_TOKEN=<scoped-secret>
OBSIDIAN_ALLOWED_ORIGINS=app://obsidian.md
VAULT_MAX_UPLOAD_BYTES=<bounded-value>
VAULT_ALLOWED_EXTENSIONS=<allowlist>
KNOWLEDGE_EMBEDDINGS_ENABLED=false
KNOWLEDGE_EMBEDDING_MODEL=<local-model>
VOICE_VPS_TRANSCRIPTION_ENABLED=false
VOICE_AUDIO_RETENTION_SECONDS=0
SKILL_AUTOMATION_ENABLED=false
```

Fail closed when required configuration is absent. Split runtime secrets so each process receives only what it needs.

## 16. Delivery phases and gates

### Phase 0 — baseline and threat model

Inventory, data-flow diagram, trust boundaries, backup proof, rollback plan, and closure of relevant auth/runner issues.

Gate: reviewed threat model and verified restore.

### Phase 1 — vault and retrieval

Templates, `CLAUDE.md`, Markdown ingestion, metadata/FTS retrieval, provenance, sync manifest, evaluation set.

Gate: idempotent ingestion, scoped retrieval, conflict-safe writes, measured baseline.

### Phase 2 — skills

Manifest schema, registry, Tier 1 runner, certification, logs, manual API.

Gate: injection, timeout, capability, redaction, and idempotency tests.

### Phase 3 — Obsidian MVP

Status, tasks, approvals, research, sync, offline/errors, hot reload.

Gate: authenticated plugin -> API -> database -> projected Markdown end-to-end test.

### Phase 4 — Tier 3 research

Mission compilation, constrained worker, citations, budgets, cancellation, report projection.

Gate: missions meet definitions of done with correct citations and human gates.

### Phase 5 — voice

Push-to-talk transcription, intent preview, confirmations, TTS, optional VPS fallback.

Gate: ambiguous commands fail safely and prohibited intents cannot bypass approval.

### Phase 6 — schedules and automation

Schedules, reliability scores, promotion workflow, emergency stop, operations dashboard.

Gate: successful-run threshold, explicit approval, deduplication, missed-run policy, rollback test.

## 17. Verification

- Unit: manifests, path normalization, chunking, routing, policy, redaction.
- Integration: migrations, Redis delivery, idempotent ingestion, retrieval, sync conflicts.
- Security: traversal, symlink escape, MIME spoofing, injection, authz, CSRF, limits, secret leakage.
- Failure: crashes, timeout, duplicates, network loss, partial upload, unavailable model, full disk.
- End to end: Obsidian -> API -> routing -> execution -> audit -> projection -> sync -> rendered note.
- Operations: backup/restore, emergency stop, recovery, deduplication, token revocation, rollback.

Minimum code handoff is `npm run build` plus focused tests. Deployment also verifies PM2, logs, listening interfaces, queues, migrations, and a representative flow.

## 18. Definition of done

- Obsidian works offline and reconnects without silent loss.
- Command center displays live authorized Foundry state.
- Results trace to actor, input, policy, run, sources, and model/skill version.
- Tier routing is deterministic and auditable.
- Skills cannot exceed declared capabilities.
- Agentic work respects budgets, cancellation, and approvals.
- Voice has no policy bypass.
- Retrieval quality and latency are measured continuously.
- Backups restore database state and vault projections.
- Runbooks cover install, upgrade, rollback, token revocation, recovery, and emergency stop.

## 19. First implementation slice

The first pull request is intentionally narrow:

1. Add JSON/Zod contracts for vault manifests, document metadata, and retrieval.
2. Add reviewed Prisma models/migration for `KnowledgeDocument`, `KnowledgeChunk`, and `VaultSyncRecord`.
3. Add isolated Markdown ingestion with stable IDs, SHA-256 idempotency, heading chunks, and PostgreSQL FTS.
4. Add authenticated retrieval-query and sync-manifest endpoints.
5. Add 30 retrieval fixtures and deterministic provenance assertions.
6. Add `docs/OBSIDIAN_OPERATIONS.md` for configuration, backup, and recovery.

PDF extraction, embeddings, plugin UI, voice, schedules, and autonomous Tier 3 work remain deferred until this slice passes its gate.
