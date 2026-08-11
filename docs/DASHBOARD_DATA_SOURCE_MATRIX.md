# Gizmo Command Center data-source matrix

Audited against the candidate repository and live VPS on 2026-08-12. `Existing` means the source or schema exists; it does not imply that rows are currently populated. Browser access is always through authenticated Next.js server code.

| Dashboard data | Source | Authoritative? | Existing? | Refresh | History | Status |
|---|---|---:|---:|---|---:|---|
| Gizmo status | Derived from emergency stop, DB/Redis, queues, services, attention | Derived | Partial | 10–30s | No | PARTIAL |
| Active missions / contracts | PostgreSQL `Mission`, `MissionTask`, `MissionApproval` | Yes | Yes, currently 0 rows | 10s | Yes | EXISTING |
| Mission progress / current phase | Mission-linked `Task.state`, transitions, events | Yes | Yes, currently 0 rows | 10s | Yes | EXISTING |
| Mission spend / tokens | Linked tasks' `estimatedCost` / `tokenUsage` | Partial | Yes | 30s | Task totals only | PARTIAL |
| Mission dependencies / graph | `MissionTask.sequence`; no dependency edges | Partial | Partial | 30s | Yes | PARTIAL |
| Active/waiting/blocked/failed tasks | PostgreSQL `Task.state` | Yes | Yes, currently 0 rows | 10s | Current + transitions | EXISTING |
| Attempts and repair state | `TaskAttempt`, `TaskStateTransition`, `TaskEvent` | Yes | Yes, currently 0 rows | 10s | Yes | EXISTING |
| Task validation/review evidence | `TaskEvent.payload`, attempt outcome, audit metadata | Partial | Partial | 10s | Yes | PARTIAL |
| Pending approvals | `Approval`, `MissionApproval`, project-run execution gate | Yes | Yes, currently 0 rows | 15s | Yes | EXISTING |
| Attention required | Derived from mission/task states, approvals, queues, budgets, audits, health | Derived | Partial | 10s | Source-dependent | PARTIAL |
| Agent registry | `config/agents/registry.json`, DB `AgentDefinition/AgentVersion` | Yes for configuration | Yes; file has 5, DB has 0 | Manual/slow | Versions in DB | EXISTING |
| Agent runtime state | Active task + latest `AgentRun` evidence | Partial | Partial; no heartbeat | 10s | Agent runs | PARTIAL |
| AgentRun model/role/tokens/error | PostgreSQL `AgentRun` | Yes | Yes, currently 0 rows | 10s | Yes | EXISTING |
| AgentRun attempt/mission/correlation | No FK/correlation fields on `AgentRun` | — | No | — | No | MISSING |
| Model requests by provider/model | PostgreSQL `AgentRun` aggregate | Partial | Yes | 30–60s | Yes | PARTIAL |
| Input/output token split | Model response knows split; DB stores combined only | — | No | — | No | MISSING |
| Model latency/retries/fallbacks | Model result supports values; DB does not persist them | — | No | — | No | MISSING |
| Recorded cost | `Task.estimatedCost`, `ProjectRun.estimatedCost` | Yes at current granularity | Yes | 30s | Task/run totals | EXISTING |
| Cost by mission/project/agent/model | Task/project links; AgentRun lacks cost and mission/attempt link | Partial | Partial | 30–60s | Partial | PARTIAL |
| Daily budget / brake | Project monthly `spendingLimit`; agent manifests have daily limits | Mixed | Partial | 30s | No daily ledger | PARTIAL |
| Tool registry / permissions | `config/tools/registry.json`, agent manifests | Yes for configuration | Yes | Manual/slow | No | EXISTING |
| Tool calls / failures | Audit may contain some actions; no normalized call ledger | — | No | — | No | MISSING |
| Audit and security feed | PostgreSQL `AuditEvent` | Yes | Yes, 415 rows | 10–30s | Yes | EXISTING |
| Normalized security events / correlation | Audit action/result/metadata are free-form | Partial | Partial | 10–30s | Yes | PARTIAL |
| Failed auth / secret detections | Some audit actions may exist; no normalized contract | Partial | Partial | 30s | Audit only | PARTIAL |
| Emergency stop | Redis `foundry:emergency-stop`, audited in PostgreSQL | Yes | Yes | 10s | Audit events | EXISTING |
| BullMQ waiting/active/delayed/failed | Redis/BullMQ `foundry-tasks`, `foundry-execution` | Yes live | Yes | 10s | Failed jobs retained | EXISTING |
| Queue completed 24h / average wait / wedge | BullMQ timestamps + DB transitions; not aggregated today | Partial | Partial | 10s | Partial | PARTIAL |
| Core app health | Dashboard `/api/health`; PM2 unavailable to browser | Partial | Yes | 10s | No | PARTIAL |
| PostgreSQL/Redis health | Bounded server probes | Yes | Yes | 10s | No | EXISTING |
| n8n/LiteLLM/service readiness | Private localhost health endpoints | Yes live | Yes | 30s | No | EXISTING |
| Workflow definitions/runs | n8n API/database needs bounded credentialed adapter | Yes in n8n | Not integrated | 30–60s | In n8n | BLOCKED |
| Prometheus/cAdvisor | Private Prometheus API, allowlisted PromQL | Yes for telemetry | Yes | 15–30s | Yes | EXISTING |
| VPS CPU/RAM/disk/load | node_exporter through Prometheus | Yes | Target currently down | 15–30s | Prometheus when fixed | BLOCKED |
| Container CPU/RAM | cAdvisor through Prometheus | Yes | Target up | 15–30s | Yes | EXISTING |
| App logs | Loki receives `/var/log/*.log` only | Supplemental | Apps not correlated | 30s/manual | Yes if ingested | PARTIAL |
| Traces | Tempo OTLP receiver via Alloy | Supplemental | Apps not instrumented | Manual | Empty/unknown | MISSING |
| GitHub PR/CI state | Existing bounded `gh` adapter per task PR URL | GitHub | Yes per task | 30–60s | GitHub | EXISTING |
| Deployments | No deployment record/source contract | — | No | — | No | MISSING |
| PostgreSQL backups | `/srv/agent-foundry/backups` + checksums | Yes | Yes, app user cannot read metadata | 60s/manual | Filesystem | BLOCKED |
| Off-host backup state | Restic binary only; no repository/snapshot configuration | — | Not configured | Manual | No | NOT APPLICABLE |
| Restore drill | Restore output/checkpoints not in app-readable metadata | Partial | Partial | Manual | Checkpoints/files | BLOCKED |
| Knowledge/memory | PostgreSQL `MemoryRecord` with provenance/trust/sensitivity | Yes | Yes, currently 0 rows | 30–60s | Yes | EXISTING |
| Skills | Source manifests/markers; no usage ledger | Configuration | Partial | Manual/slow | No | PARTIAL |
| Business Foundry | Runtime scorer only; no Business schema/tables | — | No deployment data | Manual | No | NOT APPLICABLE |
| Global search | PostgreSQL entities + registries | Yes per source | Not aggregated | Manual | Source-dependent | MISSING |

## Schema gaps deferred from Phase 1

- `AgentRun`: attempt/correlation IDs, input/output tokens, latency, cost, retry and fallback counters.
- Normalized model-call and tool-call ledgers if per-call forensics are required.
- Mission task dependency edges if a real task graph is required beyond sequence.
- Deployment records and workflow-run correlation.
- App-readable backup/restore metadata written by backup automation, without directory access from the web process.
- Agent heartbeat/runtime lease if Idle versus disconnected must be distinguished authoritatively.

No migration is justified for the Phase 1 read foundation or Today page.

## Phase 1 file plan

- `apps/dashboard/src/lib/dashboard/types.ts`: stable, secret-free DTOs and availability envelopes.
- `apps/dashboard/src/lib/dashboard/status.ts`: centralized system/service/agent/attention derivation.
- `apps/dashboard/src/lib/dashboard/database.ts`: bounded PostgreSQL summaries and activity queries.
- `apps/dashboard/src/lib/dashboard/prometheus.ts`: allowlisted queries only, timeouts, normalized unknowns.
- `apps/dashboard/src/lib/dashboard/queues.ts`: bounded BullMQ snapshots and wedge evidence.
- `apps/dashboard/src/lib/dashboard/registries.ts`: registry metadata separated from runtime evidence.
- `apps/dashboard/src/lib/dashboard/aggregate.ts`: partial-failure isolation and Today composition.
- `apps/dashboard/src/app/api/dashboard/today/route.ts`: authenticated read endpoint.
- `apps/dashboard/src/lib/dashboard/__tests__/*`: derivation, partial failure, queue, cost, telemetry, redaction tests.

Rollback: revert Phase 1 commits. No database migration or production deployment is part of this branch.
