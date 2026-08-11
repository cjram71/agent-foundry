# Mission runtime

The Mission runtime adds a durable parent contract above Tasks. Operator input and any future AI compiler output are treated as untrusted and validated by `@foundry/mission` against a server-derived project-policy ceiling.

## Security and approval boundaries

- Clients cannot select provenance or project linkage; the authenticated API overwrites both.
- Risk, USD/token budgets, concurrency, and tool classes cannot exceed the active project policy and server capability registry.
- Required plan and merge approval rules cannot be removed by a Mission request.
- Mission creation records both a Mission event and an `AuditEvent` in the same transaction.
- Creating a Mission does not queue Tasks, execute tools, approve plans, merge, or deploy.

## Verification

```bash
npm run test --workspace @foundry/mission
DATABASE_URL=postgresql://user:pass@127.0.0.1:5432/validate npx prisma validate --schema packages/database/prisma/schema.prisma
npm run typecheck --workspace dashboard
npm run test --workspace dashboard
npm run build
```

The additive production migration is intentionally not applied by the build. Deployment requires the normal fresh-backup and migration approval process.

## Rollback

Before production migration, revert the Mission commits. After migration but before Mission data is used, roll back application code and drop only `MissionEvent`, `MissionApproval`, `MissionTask`, and `Mission` in that dependency order after a verified backup. Once Mission records exist, preserve the tables and roll back application code only until an explicit data-retention decision is approved.
