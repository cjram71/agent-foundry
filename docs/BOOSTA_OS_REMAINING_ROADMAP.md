# Boosta OS Remaining Build Roadmap

Last updated: 2026-08-14

## Current position

Boosta OS has completed Phases 1–3 of the ten-phase master plan.

| Phase | Status | Delivered |
| --- | --- | --- |
| 1. Core governance | PASS | Constitution, identity, authentication, authorization, human approvals, audit foundation, kill switch |
| 2. Executive layer | PASS | AI CEO, COO, agent registry, department registry, authority boundaries |
| 3. Opportunity loop | PASS | Opportunity Vault, deterministic scoring, independent Red Team record, human decision gate, decision memory and audit |

Production branch: `boosta-campaign-vertical-slice`

Latest completed checkpoint: `/srv/gizmo/checkpoints/boosta-phase-03-opportunity-loop.json`

Phase 3 commit: `fe1de91`

The current authority boundary is intentional: approving an opportunity records human intent only. It does not create a project, spend money, deploy, contact anyone, or invoke an external tool.

## Remaining work: seven phases

### Phase 4 — Project management and controlled production

Goal: turn an approved opportunity into a governed project and executable plan without bypassing human approval.

Build:

- Approved-opportunity-to-project transition with idempotency and provenance.
- Master Project Plan containing objective, customer, requirements, architecture, security, privacy, legal, compliance, marketing, sales, support, finance, budget, schedule, dependencies, risks, quality, testing, launch, operations, metrics, and exit criteria.
- Human project-plan approval gate separate from opportunity approval.
- Project Executive role for the AI CEO, with no direct unrestricted tool authority.
- Task model enforcing owner, inputs, dependencies, risk, validation, approval, result, and audit fields.
- COO orchestration for dependency ordering, scheduling, blocked work, deadlines, and escalation.
- Material-change detection that pauses a project and requests renewed approval.
- Project and task dashboards showing status, budget, timeline, departments, dependencies, risks, quality, and decisions.
- Controlled Tool Gateway interface. Keep external connectors disabled until their permissions and verification are implemented.

Acceptance evidence:

- An approved opportunity creates exactly one draft project.
- No task exists without an owner.
- No execution occurs before project-plan approval.
- Medium/high-risk actions stop at the configured approval boundary.
- Kill switch prevents task execution and preserves logs.
- Failure and retry behavior is deterministic and audited.

### Phase 5 — Product factory, marketing, sales, and customer success

Goal: provide reusable business delivery pipelines after the project engine is trustworthy.

Build:

- Product portfolio and lifecycle: idea, validation, MVP, testing, build, security, quality, launch, sale, measurement, improvement.
- Product types for books, eBooks, audiobooks, workbooks, courses, templates, assistants, apps, SaaS, APIs, consulting, and licensing.
- Marketing campaign records with objective, audience, approved budget, expected outcome, actual outcome, ROI, and lessons.
- Sales pipeline for leads, qualification, proposals, CRM state, forecasts, pricing, accounts, partnerships, upsell, and cross-sell.
- Customer onboarding, support, knowledge base, complaints, feedback, health, churn, retention, and escalation.
- Feedback events routed to Product, Marketing, Sales, CEO, and Opportunity Engine.
- IP/publishing rights metadata: ownership, authors, versions, formats, territories, licensing, royalties, and copyright.

Acceptance evidence:

- A product cannot launch until all configured quality gates pass.
- Campaign spending and external publication require authority checks.
- Contractual, reputational, and high-value sales actions require human approval.
- Customer data access is least-privilege and audited.
- Feedback creates traceable, non-duplicated improvement inputs.

### Phase 6 — Finance, security, compliance, and service operations

Goal: make operational activity measurable, defensible, recoverable, and safe.

Build:

- Finance ledger views for revenue, expenses, cash, profit, margin, CAC, LTV, recurring revenue, projects, products, and AI costs.
- Daily, weekly, and monthly CFO reports plus forecasts and risk reporting.
- AI FinOps attribution by department, agent, model, task, project, customer, and product.
- CISO workflows for identity, vulnerabilities, threat intelligence, monitoring, application/cloud/data/AI/supply-chain security, and audit.
- Incident flow: detect, classify, contain, investigate, recover, validate, report, root cause, correct, learn.
- GDPR, EU AI Act, contracts, copyright, privacy, consumer obligations, vendor obligations, and applicable tax/legal issue registers.
- Explicit distinction between legal information and legal advice, with professional escalation.
- Service registry with owners, customers, data classification, dependencies, suppliers, SLA, recovery, changes, incidents, and review dates.
- Change, release, availability, capacity, continuity, monitoring, and service reporting processes.

Acceptance evidence:

- Financial actions cannot exceed agent or project limits.
- AI spend is attributable and reconciles to provider invoices/usage where data exists.
- Critical incidents escalate immediately and the kill switch remains available.
- Compliance dashboards say readiness, not certification.
- Restore and recovery procedures are tested rather than merely documented.

### Phase 7 — Standards, evidence, and continuous learning

Goal: establish living management-system controls and evidence-backed improvement.

Build:

- Standards registry with edition, scope, applicable departments, controls, process, owner, test frequency, exceptions, corrective actions, and review date.
- Initial framework coverage for ISO 9001, 27001, 42001, 20000-1, 27701, 31000, 37301, 22301, 56002, 37001, 12207, and 25010.
- Standards Orchestrator and specialist standards agent definitions with read/recommend authority only.
- Evidence Ledger linking each control to owner, process, evidence, test, result, exception, corrective action, and review date.
- Gap analysis and review workflow for standards revisions; never assume an edition remains current.
- Expected-versus-actual project reviews covering revenue, cost, schedule, quality, customers, security, and agent performance.
- Lessons Learned records and approval-gated SOP, policy, agent, and process update proposals.
- Agent performance metrics and governed promote, retrain, reconfigure, replace, and retire recommendations.
- Expiration and retirement workflow for temporary agents.

Acceptance evidence:

- Every readiness claim links to inspectable evidence.
- Missing or expired evidence changes readiness state automatically.
- AI cannot alter the Constitution, policy, or permanent memory without the correct approval.
- Lessons are provenance-linked to actual outcomes.

### Phase 8 — Digital twin and advanced analysis

Goal: support scenario planning without presenting simulations as guaranteed forecasts.

Build:

- Company world model/knowledge graph for companies, departments, agents, people, customers, products, services, projects, tasks, opportunities, risks, decisions, contracts, suppliers, assets, IP, revenue, cost, campaigns, incidents, controls, evidence, and standards.
- Queryable relationships and provenance for every material fact.
- Digital-twin scenarios for investments, marketing changes, product portfolio changes, SaaS launches, shutdowns, and AI-cost changes.
- Assumptions, uncertainty ranges, sensitivity analysis, confidence, and comparison to actual outcomes.
- Boosta Health Score across finance, customers, products, operations, security, compliance, technology, workforce, and strategy.
- Human Attention Budget ranking decisions by value, urgency, impact, and estimated review time.

Acceptance evidence:

- Simulation outputs clearly label assumptions and uncertainty.
- No simulated result can trigger execution directly.
- World-model facts retain source, confidence, classification, and validation state.
- Health scores expose component calculations and missing data.

### Phase 9 — Advanced automation and model/tool gateways

Goal: safely increase capability while keeping execution behind authorization controls.

Build:

- Multi-provider Model Gateway selecting by task, capability, cost, speed, privacy, reliability, and risk.
- Per-generation model, version, cost, latency, project, agent, and result records.
- Tool Gateway adapters for approved services such as GitHub, email, cloud, database, CRM, payments, website, analytics, advertising, and social platforms.
- Every tool request includes agent, user/project, purpose, permission, risk, tool, action, timestamp, and result.
- Short-lived credentials, secret isolation, rate limits, output validation, idempotency, retries, and compensating actions.
- Prompt-injection and untrusted-content isolation, with data kept distinct from instructions.
- Cross-agent message authentication, authorization, structured request/response validation, and logging.
- Event-driven workflows for opportunity, research, projects, approvals, tasks, risk, incidents, feedback, launches, sales, experiments, policies, and agent lifecycle.

Acceptance evidence:

- Tool calls fail closed when identity, permission, approval, context, or risk checks are missing.
- Agents cannot discover or inherit secrets through prompts or memory.
- External actions are idempotent where possible and have reconciliation paths.
- Model fallback never silently violates privacy or task-capability requirements.

### Phase 10 — Controlled autonomous operation

Goal: permit bounded low-risk autonomous work after all preceding controls are proven.

Build:

- Configurable autonomy matrix: low-risk AI execution, medium department approval, high CEO approval, very-high/human approval, and human-only legal/strategic/major-financial decisions.
- Permission Broker between CEO intelligence, COO orchestration, Approval Engine, and Tool Gateway.
- Continuous Observe → Discover → Research → Validate → Score → Challenge → Decide → Plan → Approve → Execute → Verify → Operate → Measure → Learn loop.
- CEO daily briefing explaining events, changes, success, failure, opportunities, risks, current actions, approvals, key knowledge, and next steps.
- Highly visible emergency stop for spending, deployments, communications, agent creation, campaigns, production changes, and high-risk integrations.
- Operational limits, anomaly detection, budget ceilings, safe degradation, emergency revocation, and recovery rehearsals.
- Continuous audits, evaluations, performance monitoring, and approval-bound policy improvements.

Acceptance evidence:

- Autonomy is enabled only for explicitly classified low-risk actions.
- Human-only decisions cannot be delegated or bypassed.
- Emergency stop is tested across every external action class without deleting evidence.
- A complete demonstration runs from discovery to controlled execution, reporting, memory, learning, and renewed discovery.
- Security, compliance, financial, reliability, and recovery reviews all pass before production autonomy is enabled.

## Resume instructions for the next build session

1. Work on VPS `cory@100.120.94.15` in `/home/cory/agent-foundry`.
2. Confirm branch `boosta-campaign-vertical-slice` and a clean worktree.
3. Pull from GitHub and verify commit `fe1de91` or a later documented roadmap commit.
4. Run the Phase 3 gate:

   ```bash
   node scripts/gizmo-checkpoint-gate.js /srv/gizmo/checkpoints/boosta-phase-03-opportunity-loop.json
   ```

5. Run health and baseline verification:

   ```bash
   curl -sS http://127.0.0.1:3000/api/health
   node --env-file=.env scripts/verify-boosta-phase3.cjs
   npm --workspace apps/dashboard test
   ```

6. Read the master requirements supplied by the owner plus:

   - `docs/BOOSTA_OS_PHASE2_EXECUTIVE_LAYER.md`
   - `docs/BOOSTA_OS_PHASE3_OPPORTUNITY_LOOP.md`
   - this roadmap
   - `docs/GIZMO_PHASE_GATES.md`

7. Start only Phase 4. Declare PRE-CHECK, EXECUTE, VERIFY, and ROLLBACK before changing code.
8. Preserve the existing zero-authority defaults. Do not activate spending, deployment, communication, contracts, publishing, or unrestricted tools.
9. Use additive migrations and preserve audit, decision, and memory evidence during rollback.
10. Test, build, deploy, verify live authorization and health, push GitHub, then create a Phase 4 PASS checkpoint before beginning Phase 5.

## Standing design rules

- Build the company, not merely a chatbot or a collection of agents.
- Keep THINK, RECOMMEND, REQUEST, APPROVE, EXECUTE, and VERIFY as distinct states.
- The human owner remains the ultimate authority.
- An AI recommendation never implies permission to execute.
- No major opportunity proceeds directly from discovery to production.
- Treat agents, models, retrieved content, and external text as untrusted by default.
- Require identity, authentication, authorization, least privilege, context checks, logging, and monitoring.
- Permanent memory requires provenance, confidence, classification, scope, timestamp, author, and validation status.
- Never represent compliance readiness as certification.
- Never weaken a failed control to make a phase pass.
