# Boosta OS Phase 2 — Executive Layer

Phase 2 adds durable company departments and staged AI CEO/COO identities above the existing generic agent runtime. It does not grant autonomy.

## Security boundary

- The human owner remains the only legal and strategic authority.
- Executive records start in `STAGING` with zero financial authority.
- Spending, contracts, publication, external communications and deployment are disabled.
- The AI CEO recommends and escalates; the COO coordinates approved work.
- Existing approval, emergency-stop, audit and Tool Gateway boundaries remain authoritative.

## Verification

```bash
npx prisma validate --schema packages/database/prisma/schema.prisma
npm run typecheck --workspace apps/dashboard
npm test --workspace apps/dashboard
npm run build --workspace apps/dashboard
curl -fsS http://127.0.0.1:3000/api/health
```

## Rollback

Revert the application change. If no Phase 2 records are referenced, drop `CompanyAgent` before `CompanyDepartment`. If records have operational history, retain the additive tables and roll back only the application layer pending a human-approved retention decision.
