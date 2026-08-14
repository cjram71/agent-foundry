# Boosta OS Phase 3: Opportunity and Decision Loop

## Scope

Phase 3 adds durable opportunity candidates, deterministic 13-factor scoring, independent Red Team records, the human owner decision gate, decision memory, and audit events.

It does not create projects, spend money, deploy software, contact customers, or grant agents new authority. Those remain outside this phase.

## Controls

- Only an authenticated administrator may read or mutate opportunities.
- Mutations enforce same-origin requests.
- Candidate evidence requires at least two references.
- Every score is bounded from 0 to 10; the calculated total is bounded from 0 to 100.
- A Red Team record is mandatory before the owner decision gate opens.
- Human decisions require a rationale and are restricted to APPROVE, REJECT, RESEARCH_MORE, or NO_ACTION.
- Decisions write an audit event and a provenance-linked approved memory record.
- Approval records intent only; it never creates a project or invokes an external tool.

## Verification

Run:

```bash
npm --workspace apps/dashboard test
npm --workspace apps/dashboard run typecheck
npm --workspace apps/dashboard run build
node --env-file=.env scripts/verify-boosta-phase3.cjs
curl -i http://127.0.0.1:3000/api/health
curl -i http://127.0.0.1:3000/api/opportunities
curl -I http://127.0.0.1:3000/opportunities
```

Expected: tests/typecheck/build pass, verification reports `valid: true`, health is 200, unauthenticated API access is 401, and the protected UI redirects to login.

## Rollback

Revert the Phase 3 application commit and rebuild/restart `foundry-dashboard`. The migration is additive: retain the three Phase 3 tables to preserve any decision/audit evidence. If and only if all three are confirmed empty, they may be removed in reverse dependency order (`OpportunityDecision`, `OpportunityRedTeam`, `Opportunity`) and the migration record reconciled by an operator.
