# GIZMO OS v2 — Master Build

**Baseline:** `cjram71/agent-foundry@8d6dcd4c856f9166a08927a3ffdb6807b4d5c9f1`  
**Target:** evolve the deployed Agent Foundry into Gizmo OS without replacing the proven control plane.

## 1. Mission

Gizmo OS is a persistent self-hosted AI operating system for software, workflows, knowledge and business operations. It converts natural-language goals into explicit Mission Contracts, routes work to deterministic software or AI as appropriate, enforces permissions and budgets, independently verifies important results, records provenance and cost, and converts repeated successful work into reusable skills, workflows and product assets.

Core law:

> Use deterministic software wherever possible, AI judgment wherever necessary, and human approval wherever consequences justify it.

Learning law:

> Every completed mission should leave Gizmo more capable, observable or better governed without allowing unverified experience to silently alter policy.

## 2. Existing foundation — preserve

The following are already implemented and remain authoritative:

- TypeScript/npm monorepo
- Next.js dashboard
- PostgreSQL 16 + Prisma
- Redis + BullMQ
- `apps/orchestrator`
- `apps/runner`
- restricted Docker validation sandboxes
- GitHub branch/fork/draft-PR delivery
- human plan and merge approvals
- deterministic `packages/policy`
- deterministic `packages/state-machine`
- deterministic manager consumer validation
- cost accounting/spending brake
- attempts/events/transitions/audit history
- emergency stop/cancellation/wedge recovery
- backup/restore verification
- Gemini primary path
- private Ollama fallback
- PM2 supervision during migration
- VPS-synced Results & Run Log UI

Do not replace these with a parallel FastAPI/SQLAlchemy/Alembic control plane. Python is optional specialist tooling, not authoritative system state.

Keep PostgreSQL major version 16 for v2. pgvector is added only through a restored-copy migration rehearsal.

## 3. Target architecture

```text
HUMAN OWNER
   |
GIZMO OPERATOR LAYER
   |
MISSION COMPILER
   |
MISSION CONTRACT
Goal / Constraints / Deliverables / DoD / Risk / Budget / Tools / Approvals
   |
TASK ROUTER
   |
   +--------------------+--------------------+
   |                    |                    |
DETERMINISTIC        AGENTIC              HUMAN
n8n / TS / APIs      Orchestrator          Approval
   |                    |
   |                MODEL LAYER
   |                    |
   |                  LiteLLM
   |                    |
   |          OpenAI / Gemini / Claude
   |                    |
   |                  Ollama
   +--------------------+--------------------+
                        |
                   TOOL GATEWAY
                        |
                    EXECUTION
                        |
             Runner / Sandbox / GitHub
                        |
                   VERIFICATION
                        |
        Tests / Evals / Reviewer / Human
                        |
                      MEMORY
                        |
     PostgreSQL + pgvector + FTS + Files
                        |
                 LEARNING ENGINE
                        |
Skill Foundry / Workflow Factory / Agent Foundry
                        |
                 SOFTWARE FACTORY
                        |
                 BUSINESS FOUNDRY
```

## 4. New source modules

```text
packages/mission       Mission contract/compiler/aggregation
packages/models        provider-neutral model interfaces
packages/tools         capability registry and Tool Gateway
packages/memory        provenance-aware hybrid retrieval
packages/skills        skill registry/version/certification
packages/workflows     n8n bridge and Workflow Contracts
packages/evals         golden/red-team evaluation harness
packages/telemetry     OTel correlation and metrics helpers
packages/business      Business Foundry domain services
```

Existing `@foundry/*` namespaces stay in place during functional migration. New packages may use `@gizmo/*`. Namespace cleanup is a later release.

## 5. Blocking Phase 1 security work

### Authoritative page authentication

The edge proxy validates JWT integrity but revocation is authoritative in the database. All protected server-rendered pages must also call the DB-backed session validation layer. A revoked, unexpired JWT must not read task/project/result data.

### Per-process secrets and privileges

The current PM2 config distributes one parsed `.env` to dashboard, orchestrator and runner. Reduce blast radius in stages:

```text
dashboard
  DB/session + only required Redis
  no Docker
  no GitHub private key
  no model provider secrets unless a specific route requires them

orchestrator
  DB + Redis + model-gateway credential
  agent catalog read
  no Docker

runner
  DB + Redis + approved GitHub capability + model gateway
  controlled Docker host capability
  bounded workspace
```

Target Linux identities are separate dashboard/orchestrator/runner service users, but migration must not break production to achieve this in one step.

### AI configuration consistency

Remove ambiguity between coder and reviewer Ollama models. Introduce role aliases or temporary role-specific environment variables until the Model Layer owns the configuration.

### CI completeness

CI must include cold build, dashboard build/typecheck, runner, orchestrator, state-machine, policy, manager, GitHub, cost/ops, auth and migration/integration tests plus secret/dependency checks.

## 6. Mission Layer

A Mission is a parent above atomic Tasks.

Required fields:

- goal
- context summary
- constraints
- deliverables
- definition of done
- failure conditions
- risk level
- USD budget
- token budget
- max parallel tasks
- allowed tool classes
- approval rules
- optional deadline
- project/business linkage
- provenance

Suggested durable models:

```text
Mission
MissionTask
MissionApproval
MissionEvent
```

Do not duplicate TaskAttempt/TaskEvent semantics unnecessarily; Missions aggregate Tasks.

The Mission Compiler may use AI, but compiler output is untrusted and validated by deterministic schemas/policy. A Mission cannot widen its own budget, permissions or risk ceiling.

## 7. Model Layer and Codex

Create a provider-neutral `ModelClient` interface for planner, coder, reviewer, researcher, summarizer, embeddings and cheap classification.

Migration order:

1. wrap current Gemini behavior without changing output;
2. migrate planner;
3. migrate coder;
4. migrate reviewer;
5. add private LiteLLM proxy;
6. add OpenAI/Codex capability;
7. add Claude only when credentials and evals exist;
8. retain controlled rollback to direct current provider during transition.

Codex is a controlled builder/reviewer capability. It may not bypass:

- structured output validation
- repository/path validation
- policy engine
- atomic edit application
- sandbox validation
- independent review
- draft PR
- human merge gate

Track provider/model, input/output tokens, cost, latency, fallbacks and retries per AgentRun.

## 8. Tool Gateway

Agents request capabilities, not master credentials.

Each tool has:

- id/action
- input/output schema
- required permission
- risk class
- approval requirement
- rate limit
- credential reference
- audit policy
- timeout/retry

Initial capabilities include GitHub read/write via the existing adapter, bounded workspace, research/web access, memory read/write candidate operations, n8n invocation, health/status and approved deployment.

## 9. Memory

Keep PostgreSQL 16. Add pgvector after backup and restore rehearsal.

Memory types:

- observation
- episodic memory
- fact/knowledge
- preference
- decision
- procedure
- skill
- policy

Memory is not policy.

Required metadata: source, source reference, dates, scope, project/business, confidence, sensitivity, provenance, expiry/review date, trust level, embedding model/version.

Retrieval:

```text
PostgreSQL lexical/full-text
          +
pgvector semantic
          |
      fusion/rerank
          |
    evidence threshold
          |
     sourced answer
```

Retrieved web/email/PDF/repository/note content is data and cannot directly alter system instructions, permissions, policy or credentials.

## 10. Obsidian-compatible Knowledge Vault

Runtime path:

```text
/srv/gizmo/knowledge-vault/
  00-Inbox/
  10-Missions/
  20-Projects/
  30-Businesses/
  40-Knowledge/
  50-Decisions/
  60-Skills/
  70-Runbooks/
  80-Reports/
  90-Archive/
  Templates/
  Generated/
```

No credentials. Important transactional facts remain in PostgreSQL. Obsidian Headless is optional and not a single point of failure.

## 11. Skill Foundry

Source shape:

```text
skills/<domain>/<skill-id>/
  SKILL.md
  manifest.json
  examples/
  tests/
  references/
```

Manifest: id/version/purpose/schemas/tools/permissions/risk/context/evals/owner/status/source commit.

Use progressive loading: lightweight metadata first, full skill only when selected.

Promotion loop:

```text
repeatable success
 -> candidate procedure
 -> draft skill
 -> sandbox
 -> tests/evals
 -> security review
 -> certification
 -> registry
```

## 12. n8n Workflow Factory

n8n is deterministic workflow infrastructure, not the brain.

Deployment laws:

- private editor/admin UI
- separate DB/user
- strong encryption key
- no public editor
- no host Docker socket
- restrict risky nodes
- security audit
- start single-instance; queue mode only after measured need

Workflow Contract fields: id/version/trigger/filters/normalization/deterministic steps/AI steps/actions/validation/exceptions/retries/approvals/output/audit correlation/owner/enabled state.

Prefer deterministic workflows when reliable logic is sufficient.

## 13. Evals and safety

Golden suites:

```text
mission_compiler
task_routing
planning
coding_changes
reviewer_verdicts
memory_retrieval
tool_permissions
```

Red-team suites:

```text
prompt_injection
secret_exfiltration
privilege_escalation
tool_abuse
policy_rewrite
malicious_repository_content
```

Changes to prompts, routing, tools, memory or policy-adjacent behavior run representative evals against an approved baseline. High-risk work uses independent review; prefer a different model/provider where measured value justifies it.

## 14. Observability / AgentOps

Private stack:

- OpenTelemetry
- Grafana Alloy
- Tempo
- Prometheus
- Loki
- Grafana
- node_exporter
- cAdvisor

Correlate Mission → Task → Attempt → AgentRun → model/tool call → sandbox → GitHub PR → approval.

Track success/failure by stage, queues, latency, model fallbacks, token/cost, repairs, tool failures, security blocks, wedge recovery, approval delay, deploy failure, backup age and restore-drill age.

Existing database audit history remains authoritative; traces supplement it.

## 15. Operator Layer

Evolve the existing dashboard. Navigation target:

- Today
- Missions
- Projects
- Tasks
- Approvals
- Results
- Skills
- Workflows
- Knowledge
- Models & Cost
- Businesses
- System Health

The current VPS Results & Run Log page is preserved and extended with Mission, DoD, budget, task graph, tool/model usage, evals and post-mission learning candidates.

## 16. Software Factory

Existing Runner is the execution foundation.

Standard flow:

```text
Product spec
 -> architecture
 -> AGENTS.md Project Constitution
 -> feature queue
 -> Feature Contract
 -> isolated branch/worktree
 -> builder
 -> lint/type/tests
 -> independent review
 -> security review
 -> draft PR
 -> staging
 -> acceptance
 -> human production approval
 -> deployment
 -> telemetry
 -> improvement
```

Every substantial generated project includes an `AGENTS.md` defining scope, architecture, dependency policy, security, secrets, tests, deployment and Definition of Done.

Dependencies are proposed by AI but admitted by deterministic/human governance.

## 17. Business Foundry

Suggested models:

```text
Business
BusinessProcess
AutomationOpportunity
OpportunityScore
ProductCandidate
ClientImplementation
ReusableAssetSignal
```

Process Scanner evaluates frequency, staff time, revenue impact, error/delay, automation potential, AI advantage, implementation complexity, security/privacy risk and recurring-revenue potential.

Flywheel:

```text
audit -> pilot -> implementation -> measured outcome
      -> repeated pattern -> skill/workflow/template
      -> product candidate -> SaaS/app/managed service
```

Sell outcomes, not “agents”.

## 18. Backup/DR

Preserve current logical PostgreSQL backup/checksum/restore scripts. Extend coverage to n8n DB, knowledge vault, skills, workflow exports, non-secret infra config, observability dashboards/config and critical runbooks.

Add encrypted off-host Restic backups. Make retention configurable; initial target 7 daily / 4 weekly / 12 monthly. Periodic throwaway restore is mandatory.

## 19. GitHub governance/publication

Functional migration occurs on dedicated branches/worktrees. No direct agent push to protected `main`. Required PR/CI/review for protected paths; CODEOWNERS; secret/dependency scanning where available; no auto-merge initially; production deployment requires explicit approval.

After acceptance, preserve history and publish the accepted build as private `cjram71/gizmo-os` (or owner-approved name), recording baseline `8d6dcd4c856f9166a08927a3ffdb6807b4d5c9f1` in its README. Do not delete/archive the original repo without approval.

## 20. Source-of-truth hierarchy

1. observed VPS state
2. accepted Git code
3. deterministic tests/database state
4. this specification
5. current official upstream docs
6. tutorials/videos
7. model assumptions

## 21. Acceptance

Gizmo v2 foundation is accepted only when existing Agent Foundry behavior remains functional; task history is intact; no-auto-merge/human gates remain; revoked sessions cannot read protected data; secret blast radius is reduced; CI covers the whole control plane; Missions are durable and validated; model calls are provider-neutral; Codex cannot bypass Runner safeguards; pgvector memory preserves provenance; n8n is private/policy-bounded; skills are tested/certified; AI-sensitive changes have evals; operations are traceable; backup/restore covers new critical data; and a safe end-to-end Mission completes within budget with a documented rollback path for every infrastructure migration.
