# Boosta Forlag revenue workflow changelog

## 2026-08-17

- Created safe branch `boosta-forlag-revenue-workflow`.
- Verified PostgreSQL backup and throwaway restore before migration.
- Added additive Prisma migration `20260817214000_boosta_revenue_workflow`.
- Added reusable workspace, brain-version, author, book, agent-role, artifact, review, approval, distribution, email, funnel, experiment, offer, B2B, weekly-review, and revenue-attribution records.
- Seeded Boosta Forlag workspace, Company Brain v1, Malla Taipale, both books, six revenue-oriented projects, six mission-linked tasks, seven role templates, retailer checklists, draft offers, draft experiments, and a weekly review.
- Added authenticated `/api/boosta` summary endpoint and `/boosta` dashboard view.
- Preserved all existing models, missions, projects, tasks, sessions, approvals, and audit history.
- No public publishing, advertising spend, commercial email, discount activation, or production deployment was performed.
