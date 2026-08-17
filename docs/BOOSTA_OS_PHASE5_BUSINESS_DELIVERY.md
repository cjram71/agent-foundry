# Boosta OS Phase 5 — Product Factory and Customer Lifecycle

## Authority boundary

Phase 5 creates internal business records and controlled lifecycle transitions. It does not send campaigns, publish content, sign contracts, charge customers, or contact third parties. External connectors remain disabled unless separately authorized through the Tool Gateway.

Mandatory gates:

- product launch: quality, security, legal-rights, commercial, and operations gates all PASS plus explicit human approval;
- campaign spend: human-approved budget exists and cumulative spend remains within it;
- campaign publication: separate human publication approval exists;
- contractual, partnership, reputational/high-risk, or value >= 1,000,000 minor units sales transition: explicit human approval;
- customer access: authenticated ADMIN, Boosta company scope, and an audit event;
- feedback: stable idempotency key and routing to Product, Marketing, Sales, CEO, and Opportunity Engine.

## PRE-CHECK

- Phase 4 checkpoint passes.
- Health, PostgreSQL, Redis, and queues pass.
- Worktree contains only Phase 5 changes.
- Fresh backup and restore drill pass before migration.

## EXECUTE

- Add product portfolio, lifecycle, quality gates, and publishing/IP rights.
- Add campaign budgets, outcomes, ROI, lessons, spend and publication approvals.
- Add sales pipeline, forecasts, pricing, partnership, upsell/cross-sell, and approval gates.
- Add minimal customer accounts, cases, health, churn, retention, and escalation data.
- Add idempotent feedback routing.
- Add authenticated API and Business Delivery dashboard.

## VERIFY

```bash
npx prisma validate --schema packages/database/prisma/schema.prisma
npm --workspace apps/dashboard test
npm run build
npm run build --workspace=apps/dashboard
node --env-file=.env scripts/verify-boosta-phase5.cjs
curl -fsS http://127.0.0.1:3000/api/health
```

## ROLLBACK

1. Stop the Phase 5 dashboard release and restore the previous accepted build.
2. Preserve Phase 5 records and audit evidence; do not drop the tables during ordinary rollback.
3. Keep campaigns unpublished, spending disabled, and high-impact sales unapproved.
4. Restore the verified pre-migration backup only with explicit approval and reconciliation.
5. Re-run the Phase 4 checkpoint and verifier.
